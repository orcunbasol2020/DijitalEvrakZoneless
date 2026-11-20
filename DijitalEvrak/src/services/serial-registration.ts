import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { HttpService } from './http';
import { SKIP_ERROR_TOAST } from '../interceptors/error-interceptor';
import { readToken } from '../interceptors/auth-interceptor';
import { DepartmentId, ExternalInstitutionId } from '../models/ids';
import {
  IncomingDocumentDistributionModel,
  IncomingDocumentModel,
  IncomingDocumentRecipientInput
} from '../models/incoming-document/incoming-document.model';
import { environment } from '../environments/environment';

/** Seri Kayıt ekranını görenler: gelen evrak kaydını yapan roller */
export const SERIAL_REGISTRATION_ROLES = ['Gelen Evrak', 'Yönetici'];

/**
 * Sıradaki iş: havuzdaki eşleşmemiş tarama ("scan:<id>") ya da taraması bağlanmış ama Evrak Kayıt'ta
 * kaydedilmemiş evrak ("doc:<id>"). key ekranda tekil kimliktir; Register / Release'e aynen gönderilir.
 */
export interface SerialQueueItem {
  key: string;
  kind: 'scan' | 'document';
  /** Tarama: GetScanPoolPdf kaynağı ve dosya adı */
  source?: string | null;
  fileName?: string | null;
  /** Evrak: bağlı dosya (GetPdf) */
  documentName?: string | null;
  /** Evrak: QrCode; tarama: barkoddan tek numara okunduysa o */
  documentNumber?: string | null;
  /** Tarama: barkoddan okunan numaralar (0, 1 ya da çok) */
  qrCodes?: string[] | null;
  scannedAtUtc?: string | null;
  /** Numaraya ait evrak varsa (ön kayıt) bilgileri; form bunlarla dolar */
  document?: IncomingDocumentModel | null;
  recipients?: IncomingDocumentDistributionModel[] | null;
}

export interface SerialRemaining {
  scans: number;
  documents: number;
}

export interface SerialClaimResult {
  item: SerialQueueItem | null;
  remaining: SerialRemaining;
}

export interface SerialRegisterRequest {
  userId: string;
  key: string;
  documentNumber: string;
  externalInstitutionId: ExternalInstitutionId | null;
  orginalNo: string | null;
  documentDate: string | null;
  subject: string | null;
  documentTypeId: number | null;
  securityDegree: number | null;
  urgencyDegree: number | null;
  recipients: IncomingDocumentRecipientInput[];
  publish: boolean;
}

export interface SerialRegisterResult {
  documentId: string;
  documentNumber: string;
  published: boolean;
}

/**
 * Seri Kayıt (api/SerialRegistration). Sözleşme: backend degisiklik_notlari/seri_kayit_ekrani.md.
 * - ClaimNext sıradaki işi kullanıcıya geçici (süreli) ayırır; zimmet, hareket, durum yazılmaz.
 * - Register bağlama + kayıt + hareket + zimmet + (istenirse) yayını tek işlemde yapar.
 * - Release (Atla) ayırmayı kaldırır.
 * Hatalar ekranda backend metniyle gösterildiği için genel hata toast'ı atlanır.
 */
@Injectable({ providedIn: 'root' })
export class SerialRegistrationService {
  private readonly httpService = inject(HttpService);
  readonly #http = inject(HttpClient);
  private readonly baseUrl = 'api/SerialRegistration/';
  private readonly skipToast = () => ({ context: new HttpContext().set(SKIP_ERROR_TOAST, true) });

  claimNext(userId: string, exclude: string[]): Observable<SerialClaimResult> {
    return this.httpService.post<SerialClaimResult>(`${this.baseUrl}ClaimNext`, { userId, exclude }, this.skipToast())
      .pipe(map(r => ({
        item: r?.item ?? null,
        remaining: { scans: r?.remaining?.scans ?? 0, documents: r?.remaining?.documents ?? 0 }
      })));
  }

  /**
   * Numara okutarak açma (taranmayacak gizli evrak ya da belirli bir belge). Cevap ClaimNext ile aynı biçim;
   * dosyasız evrakta documentName null döner. Bulunamaz / kaydedilmiş / başkasında ise 409 + Message.
   */
  claimByNumber(userId: string, documentNumber: string): Observable<SerialClaimResult> {
    return this.httpService.post<SerialClaimResult>(`${this.baseUrl}ClaimByNumber`, { userId, documentNumber }, this.skipToast())
      .pipe(map(r => ({
        item: r?.item ?? null,
        remaining: { scans: r?.remaining?.scans ?? 0, documents: r?.remaining?.documents ?? 0 }
      })));
  }

  register(request: SerialRegisterRequest): Observable<SerialRegisterResult> {
    return this.httpService.post<SerialRegisterResult>(`${this.baseUrl}Register`, request, this.skipToast());
  }

  release(userId: string, key: string) {
    return this.httpService.post<unknown>(`${this.baseUrl}Release`, { userId, key }, this.skipToast());
  }

  /** Kullanıcının açık ayırmalarının süresini uzatır (5 dk); form açıkken dakikada bir çağrılır */
  renew(userId: string) {
    return this.httpService.post<unknown>(`${this.baseUrl}Renew`, { userId }, this.skipToast());
  }

  /**
   * Sekme kapanırken / sayfa terk edilirken bırakma: Angular istekleri iptal olabileceği için keepalive fetch.
   * Gitmese de sorun olmaz; ayırma süre dolunca kendiliğinden düşer.
   */
  releaseOnUnload(userId: string, keys: string[]): void {
    const token = readToken();
    for (const key of keys) {
      try {
        fetch(environment.apiUrl + this.baseUrl + 'Release', {
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ userId, key })
        }).catch(() => { });
      } catch { /* tarayıcı keepalive desteklemiyorsa ayırma süre dolunca düşer */ }
    }
  }

  /** İşin PDF'i blob olarak (token'lı istek); önceden yükleme ve gösterim için */
  pdf(item: SerialQueueItem): Observable<Blob> {
    return this.#http.get(this.pdfPath(item), { responseType: 'blob', ...this.skipToast() });
  }

  private pdfPath(item: SerialQueueItem): string {
    if (item.kind === 'scan') {
      return `api/ScannedDocuments/GetScanPoolPdf?source=${encodeURIComponent(item.source ?? '')}`
        + `&fileName=${encodeURIComponent(item.fileName ?? '')}`;
    }
    return `api/ScannedDocuments/GetPdf?fileName=${encodeURIComponent(item.documentName ?? '')}`;
  }
}

/**
 * Register'da 409: belge başka kullanıcıya geçmiş ya da kaydedilmiş; bu belge için yapılacak bir şey kalmadı,
 * sıradakine geçilir (girilen bilgiler kaybolur, kabul edildi).
 */
export function isLeaseLost(err: unknown): boolean {
  return (err as HttpErrorResponse)?.status === 409;
}

/** ClaimNext'te 409: kullanıcının zaten 2 açık belgesi var; sıra boş değildir, önceden alma bekletilir */
export function isClaimLimit(err: unknown): boolean {
  const e = err as HttpErrorResponse;
  return e?.status === 409 && /en fazla/i.test(e?.error?.Message ?? e?.error?.message ?? '');
}

/** Kullanıcıya gösterilecek hata metni; backend { Message } ya da { Errors: [...] } döner */
export function serialErrorMessage(err: unknown, fallback: string): string {
  const e = err as HttpErrorResponse;
  if (e?.status === 404 || e?.status === 405) return 'Seri Kayıt bu sunucuda henüz kullanılamıyor.';
  if (e?.status === 0) return 'Sunucuya ulaşılamıyor.';
  const body = e?.error;
  const errors: unknown = body?.Errors ?? body?.errors;
  const listed = Array.isArray(errors) ? errors.filter(x => typeof x === 'string').join(' ') : '';
  return body?.Message || body?.message || listed || fallback;
}

/** Gereği/Bilgi seçimli alıcı (Nereye) */
export interface SerialRecipient {
  departmentId: DepartmentId;
  name: string;
  actionRequired: boolean;
}
