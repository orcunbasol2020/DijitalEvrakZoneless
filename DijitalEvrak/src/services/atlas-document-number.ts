import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { SKIP_ERROR_TOAST } from '../interceptors/error-interceptor';

/** Reserve yanıtı: data istenenden kısa gelebilir, message bunu açıklar. */
export interface AtlasReserveResult {
  message: string;
  data: string[];
}

export interface AtlasNumberStock {
  available: number;
  reserved: number;
  used: number;
  cancelled: number;
  minStock: number;
}

/**
 * Atlas EBYS'den alınıp backend havuzunda bekleyen evrak numaraları (biçim: 2026/42679909).
 * Hatalar bu serviste genel toast'a düşmez; çağıran taraf backend'in Message alanını gösterir
 * (bkz. atlasErrorMessage).
 */
@Injectable({ providedIn: 'root' })
export class AtlasDocumentNumberService {
  readonly #http = inject(HttpClient);
  readonly #baseUrl = 'api/AtlasDocumentNumbers/';
  readonly #context = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

  /** count 1–100. Alınan numara başka bir isteğe bir daha verilmez. */
  reserve(userId: string, count: number) {
    return this.#http.post<AtlasReserveResult>(
      `${this.#baseUrl}Reserve`,
      { userId, count },
      { context: this.#context() }
    );
  }

  /** Hatalı basılan etiketin numarasını iptal eder; evrakta kullanılmış numara iptal edilemez. */
  cancel(qrCode: string, userId: string, reason?: string) {
    return this.#http.post<unknown>(
      `${this.#baseUrl}Cancel`,
      { qrCode, userId, reason: reason || undefined },
      { context: this.#context() }
    );
  }

  getStock() {
    return this.#http.get<AtlasNumberStock>(`${this.#baseUrl}GetStock`, { context: this.#context() });
  }
}

/** Hata yanıtında alan adları büyük harfle başlar ({ Message, StatusCode }). */
export function atlasErrorMessage(err: unknown, fallback: string): string {
  const body = (err as HttpErrorResponse)?.error;
  return body?.Message || body?.message || fallback;
}
