import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
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
  ran: boolean;
  picked: number;
  succeeded: number;
  requeued: number;
  failed: number;
  recoveredStuck: number;
  message: string;
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

  /** Aktarımı hatalı evraklar (en fazla 500, en yenisi üstte). Hata nedeni yalnızca bu uçta var. */
  getFailed() {
    return this.#http.get<AtlasTransferFailure[]>(`${this.#baseUrl}GetFailed`, { context: this.#context() });
  }

  /** Hatalı evrakı evrak bilgilerine dokunmadan yeniden kuyruğa alır (submissionStatus 2). */
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

  /** Kuyruğu hemen çalıştırır; otomatik aktarım ayarı kapalı olsa da çalışır (yalnızca yönetici). */
  run() {
    return this.#http.post<AtlasTransferRunResult>(`${this.#baseUrl}Run`, {}, { context: this.#context() });
  }
}
