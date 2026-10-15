import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { SKIP_ERROR_TOAST } from '../interceptors/error-interceptor';

/** Atlas aktarımı kalıcı hata alan (submissionStatus 5) evrak; lastError kullanıcıya gösterilir. */
export interface AtlasTransferFailure {
  documentId: string;
  qrCode: string | null;
  subject: string | null;
  tryCount: number;
  lastError: string | null;
  lastAttemptAt: string | null;
}

/** Kuyruk özeti: yayın durumlarına göre evrak sayıları. */
export interface AtlasTransferStats {
  notPublished: number;
  queued: number;
  transferring: number;
  succeeded: number;
  failed: number;
}

export interface AtlasTransferRunResult {
  ran: boolean;            // false: tur iş yapmadı, nedeni message'da
  picked: number;
  succeeded: number;
  requeued: number;        // geçici hata, tekrar denenecek
  failed: number;          // Aktarım Hatalı'ya düşen
  recoveredStuck: number;  // takılı kalıp sıraya geri alınan
  message: string;
}

/** Tamamlanan son tur; sunucu belleğindedir, yeniden başlayınca ilk tura kadar null gelir. */
export interface AtlasTransferLastRun {
  startedAt: string;
  finishedAt: string;
  manual: boolean;
  result: AtlasTransferRunResult | null;
  error: string | null;
}

export type AtlasTransferCheckCode = 'AutoTransfer' | 'Recipient' | 'PhysicalDeliveryPdf' | 'AtlasDelivery';

/** Aktarımın çalışması için gereken koşul; code sabittir, rozet rengi ona göre seçilir. */
export interface AtlasTransferCheck {
  code: AtlasTransferCheckCode;
  name: string;
  ok: boolean;
  message: string;
}

export interface AtlasTransferStatus {
  autoTransferEnabled: boolean;
  intervalSeconds: number;
  batchSize: number;
  maxTryCount: number;
  isRunning: boolean;
  runningSince: string | null;
  lastRun: AtlasTransferLastRun | null;
  nextRunAt: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  counts: AtlasTransferStats;
  checks: AtlasTransferCheck[];
}

/** Sıradaki (2) ya da aktarılmakta olan (3) evrak. */
export interface AtlasTransferQueueItem {
  documentId: string;
  qrCode: string;
  subject: string | null;
  status: 2 | 3;
  statusUpdatedAt: string | null;
  tryCount: number;
  nextAttemptAt: string | null;  // doluysa geçici hata sonrası bekliyor
  lastError: string | null;
}

export interface AtlasTransferAttempt {
  documentId: string;
  qrCode: string;
  subject: string | null;
  packageId: string;
  attemptNo: number;
  attemptedAt: string;
  isSuccess: boolean;
  isPermanentFailure: boolean;
  error: string | null;
  atlasReferenceId: string | null;
}

/** Evrakın EYP paketi; evrak yeniden sıraya alınınca eskisi isActive: false olarak kalır. */
export interface AtlasTransferPackage {
  id: string;
  isActive: boolean;
  createdDate: string;
  fileName: string | null;
  fileSize: number | null;
  sha256: string | null;
  fileExists: boolean;
  usedPlaceholderContent: boolean;  // üst yazı olarak fiziki gönderim sayfası kullanıldı
  tryCount: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  lastError: string | null;
  atlasReferenceId: string | null;
  transferredAt: string | null;
}

export interface AtlasTransferDocument {
  documentId: string;
  qrCode: string;
  subject: string | null;
  status: number | null;
  statusUpdatedAt: string | null;
  packages: AtlasTransferPackage[];   // en yenisi önce
  attempts: AtlasTransferAttempt[];
}

/**
 * Backend'in UTC zamanını Date'e çevirir. Bellekten gelen zamanlar sonunda Z ile, veritabanından
 * gelenler Z'siz döner; ikisi de UTC'dir (Z'siz değer new Date()'e doğrudan verilirse yerel saat sanılır).
 */
export function utc(value: string | null | undefined): Date | null {
  if (!value) return null;
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : value + 'Z');
}

/** Bir denemenin sonucu: başarılı, kalıcı hata ya da tekrar denenecek geçici hata. */
export function attemptOutcome(a: AtlasTransferAttempt): { label: string; tone: 'ok' | 'error' | 'warn' } {
  if (a.isSuccess) return { label: 'Aktarıldı', tone: 'ok' };
  if (a.isPermanentFailure) return { label: 'Hatalı', tone: 'error' };
  return { label: 'Tekrar denenecek', tone: 'warn' };
}

/**
 * Yayınlanan gelen evrakın EYP paketi olarak Atlas'a aktarım kuyruğu.
 * Hatalar genel toast'a düşmez; çağıran taraf backend'in Message alanını gösterir
 * (bkz. incomingErrorMessage).
 */
@Injectable({ providedIn: 'root' })
export class AtlasTransferService {
  readonly #http = inject(HttpClient);
  readonly #baseUrl = 'api/AtlasTransfer/';
  readonly #context = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

  /** Ayarlar, çalışan / son / sonraki tur, ön koşul kontrolleri ve sayılar. */
  getStatus() {
    return this.#http.get<AtlasTransferStatus>(`${this.#baseUrl}GetStatus`, { context: this.#context() });
  }

  /** Sıradaki ve aktarılan evraklar (en fazla 500), sıraya alınma sırasıyla. */
  getQueue() {
    return this.#http.get<AtlasTransferQueueItem[]>(`${this.#baseUrl}GetQueue`, { context: this.#context() });
  }

  /** Aktarımı hatalı evraklar (en fazla 500, en yenisi üstte). Hata nedeni yalnızca bu uçta var. */
  getFailed() {
    return this.#http.get<AtlasTransferFailure[]>(`${this.#baseUrl}GetFailed`, { context: this.#context() });
  }

  /** Tüm evraklarda son gönderim denemeleri, en yenisi önce (limit 1–500). */
  getAttempts(limit = 50) {
    return this.#http.get<AtlasTransferAttempt[]>(`${this.#baseUrl}GetAttempts`,
      { params: { limit }, context: this.#context() });
  }

  /** Evrakın yayın durumu, paketleri ve tüm denemeleri; yayınlanmamış evrakta listeler boş. */
  getDocument(documentId: string) {
    return this.#http.get<AtlasTransferDocument>(`${this.#baseUrl}GetDocument/${documentId}`,
      { context: this.#context() });
  }

  /** Hatalı evrakı güncel bilgileriyle yeniden kontrol edip yeni paketle kuyruğa alır (submissionStatus 2). */
  retry(documentId: string, userId: string) {
    return this.#http.post<{ message: string }>(
      `${this.#baseUrl}Retry`,
      { documentId, userId },
      { context: this.#context() }
    );
  }

  getStats() {
    return this.#http.get<AtlasTransferStats>(`${this.#baseUrl}GetStats`, { context: this.#context() });
  }

  /** Kuyruğu hemen çalıştırır; otomatik aktarım ayarı kapalı olsa da çalışır (yalnızca yönetici).
   *  Tur bitene kadar cevap gelmez. */
  run() {
    return this.#http.post<AtlasTransferRunResult>(`${this.#baseUrl}Run`, {}, { context: this.#context() });
  }

  /**
   * .eyp paketini indirir; packageId verilmezse güncel paket iner. Hata cevabı da blob geldiği için
   * mesajı okunup Error olarak fırlatılır. Dosya adı Content-Disposition'dan okunur.
   */
  downloadPackage(documentId: string, packageId?: string, fallbackName = 'paket.eyp'): Promise<void> {
    const params: Record<string, string> = packageId ? { packageId } : {};
    return this.#downloadBlob(`${this.#baseUrl}DownloadPackage/${documentId}`, params, fallbackName, 'Paket indirilemedi.');
  }

  /**
   * Evrakın şimdiki bilgileriyle yeni bir test paketi üretip indirir; yayın durumundan bağımsızdır.
   * Paket kaydedilmez, kuyruğa ve deneme sayısına dokunulmaz; her çağrıda yeniden üretilir.
   */
  generatePackage(documentId: string, fallbackName = 'test.eyp'): Promise<void> {
    return this.#downloadBlob(`${this.#baseUrl}GeneratePackage/${documentId}`, {}, fallbackName, 'Paket üretilemedi.');
  }

  async #downloadBlob(url: string, params: Record<string, string>, fallbackName: string, failMessage: string): Promise<void> {
    try {
      const response = await firstValueFrom(this.#http.get(url,
        { params, responseType: 'blob', observe: 'response', context: this.#context() }));
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disposition);
      const name = match ? decodeURIComponent(match[1] ?? match[2]) : fallbackName;
      const objectUrl = URL.createObjectURL(response.body!);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl));
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.error instanceof Blob) {
        let message = failMessage;
        try {
          message = JSON.parse(await e.error.text())?.Message || message;
        } catch { /* gövde JSON değil */ }
        throw new Error(message);
      }
      throw new Error(failMessage);
    }
  }
}
