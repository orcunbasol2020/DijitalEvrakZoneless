import { environment } from '../environments/environment';
import { Injectable, inject } from '@angular/core';
import { HttpContext } from '@angular/common/http';
import { HttpService } from './http';
import { ScanFileModel } from '../models/scanneddocument.model';
import { SKIP_ERROR_TOAST } from '../interceptors/error-interceptor';
import { firstValueFrom } from 'rxjs';

/**
 * Taranan belge havuzu. Angular Taranan Belge API'sini doğrudan çağırmaz;
 * tüm istekler evrak takip backend'inin api/ScannedDocuments uç noktalarından geçer.
 */
@Injectable({ providedIn: 'root' })
export class ScannedDocumentService {

  private httpService = inject(HttpService);
  private baseUrl = 'api/ScannedDocuments/';

  // Kaynaklar ("evrak", "nota")
  async getScanSources(): Promise<string[]> {
    try {
      const sources = await firstValueFrom(this.httpService.get<string[]>(this.baseUrl + 'GetScanSources'));
      return sources ?? [];
    } catch (error) {
      console.error('Scan sources load error:', error);
      return [];
    }
  }

  // Havuzdaki belgeler; source verilmezse tüm kaynaklar, en yeni üstte
  async getScannedDocuments(source?: string): Promise<ScanFileModel[]> {
    try {
      const query = source ? `?source=${encodeURIComponent(source)}` : '';
      const docs = await firstValueFrom(this.httpService.get<ScanFileModel[]>(this.baseUrl + 'GetScanPool' + query));
      return docs ?? [];
    } catch (error) {
      console.error('Scanned documents load error:', error);
      return [];
    }
  }

  // Evrak numarasıyla arama (tüm kaynaklar); aynı evrak birden fazla taranmışsa birden fazla sonuç döner.
  // Hata ekranda gösterildiği için genel hata toast'ı atlanır.
  searchScanPool(qrCode: string) {
    return this.httpService.get<ScanFileModel[]>(
      `${this.baseUrl}SearchScanPool?qrCode=${encodeURIComponent(qrCode)}`,
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) }
    );
  }

  // Tarama sistemindeki yeni belgeleri arka plan turunu beklemeden alır (ayar kapalı olsa da)
  importFromScanApi() {
    return this.httpService.post<ScanJobResult>(`${this.baseUrl}ImportFromScanApi`, {},
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  // Yönetici: süresi dolduğu için temizlikte arşive alınacak bekleyen belgeler (hiçbir şey değiştirmez)
  getScanCleanupCandidates() {
    return this.httpService.get<ScanFileModel[]>(`${this.baseUrl}GetScanCleanupCandidates`,
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  // Yönetici: temizliği günlük turu beklemeden çalıştırır; belgeler arşive taşınır
  runScanCleanup() {
    return this.httpService.post<ScanJobResult>(`${this.baseUrl}RunScanCleanup`, {},
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  // Önizleme PDF'i (belge havuzda kalır); token istemez, iframe src'ye doğrudan verilebilir
  getPdfUrl(source: string, fileName: string): string {
    if (!source || !fileName) return '';
    return `${environment.apiUrl}api/ScannedDocuments/GetScanPoolPdf?source=${encodeURIComponent(source)}&fileName=${encodeURIComponent(fileName)}`;
  }

  // Belgeyi havuzdan alıp evrak numarasına bağlar. Hata mesajları ekranda backend'den gelen
  // metinle gösterildiği için genel hata toast'ı atlanır.
  transferScannedDocument(source: string, fileName: string, documentNumber: string, userId: string) {
    return this.httpService.post<any>(
      `${this.baseUrl}TransferFromScanPool`,
      { source, fileName, documentNumber, userId },
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) }
    );
  }
}

/** ImportFromScanApi / RunScanCleanup cevabı; message kullanıcıya olduğu gibi gösterilebilir */
export interface ScanJobResult {
  ran: boolean;
  imported?: number;
  archived?: number;
  skipped: number;
  failed: number;
  message: string;
}

const SCAN_SOURCE_LABELS: Record<string, string> = { evrak: 'Evrak', nota: 'Nota' };

/** Kaynak rozetlerinde gösterilen ad; bilinmeyen kaynak olduğu gibi gösterilir */
export function scanSourceLabel(source: string): string {
  return SCAN_SOURCE_LABELS[source] ?? source;
}

/** Aktarılmak istenen belge havuzda yoksa (başka kullanıcı almış) backend mesajında geçen ifade; liste yenilenmelidir */
export const SCAN_FILE_TAKEN_TEXT = 'başka bir kullanıcı tarafından alınmış';

/**
 * Havuz isteği (arama / aktarım) hatasının kullanıcıya gösterilecek metni. Hatalar { Message, StatusCode }
 * biçiminde gelir; doğrulama hatasında gövde { StatusCode: 403, Errors: [alan adları] } olur.
 * Aktarım yarıda kalırsa backend belgeyi havuza kendisi geri bırakır, ayrıca çağrı gerekmez.
 */
export function scanPoolErrorMessage(err: any, fallback = 'Belge aktarılırken bir hata oluştu.'): string {
  const body = err?.error;
  const fields: unknown = body?.Errors ?? body?.errors;
  if (Array.isArray(fields) && fields.length) {
    if (fields.includes('DocumentNumber')) return 'Evrak numarası boş olamaz.';
    if (fields.includes('UserId')) return 'Kullanıcı bilgisi bulunamadı.';
    return 'Belge bilgileri geçersiz.';
  }
  const message: string | undefined = body?.Message ?? body?.message;
  if (message) return message;
  if (err?.status === 0) return 'Tarama servisine ulaşılamıyor.';
  return fallback;
}
