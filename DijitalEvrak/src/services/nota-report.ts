import { Injectable, inject } from '@angular/core';
import { HttpContext, HttpErrorResponse } from '@angular/common/http';
import { HttpService } from './http';
import { SKIP_ERROR_TOAST } from '../interceptors/error-interceptor';

// Nota Raporları uç noktaları (bkz. degisiklik_notlari/backend_nota-raporlari.txt ve frontend_nota-raporlari.txt).
// Ay / yıl sunucuda Türkiye saatine göre hesaplanır; dateField=document seçiliyken belge tarihi boş
// notalar kayıt tarihine göre sayılır. lastNotaDate her zaman kayıt zamanıdır.
// Sayım sunucuda yapılır; ekran tüm gelen evrakları indirmez.

export type NotaDateField = 'created' | 'document';

export interface NotaPeriod {
  year?: number | null;
  /** 1-12 */
  month?: number | null;
  dateField?: NotaDateField;
}

export interface NotaSender {
  externalInstitutionId: string;
  name: string;
  /** ExternalInstitutionType: 1 Misyon, 2 Kurum, 3 Şahıs */
  type: number;
  notaCount: number;
  lastNotaDate?: string | null;
}

export interface NotaDepartmentCount {
  departmentId: string;
  /** Birim kaydı bulunamazsa null gelir; ekranda "Bilinmeyen birim" */
  departmentName: string | null;
  departmentShortName?: string | null;
  notaCount: number;
  geregiCount: number;
  bilgiCount: number;
}

export interface NotaSummary {
  externalInstitutionId: string;
  name: string;
  notaCount: number;
  eNotaCount: number;
  noRecipientCount: number;
  lastNotaDate?: string | null;
  departments: NotaDepartmentCount[];
  months: { year: number; month: number; notaCount: number }[];
  years: { year: number; notaCount: number }[];
}

/**
 * Hata metni: { Message } (ör. "Dış kurum bulunamadı.") olduğu gibi gösterilir. Doğrulama hatasında
 * Errors yalnızca alan adını taşır (mesaj yok); ekran bu değerleri kendisi ürettiği için genel metin yeter.
 */
export function notaErrorMessage(err: unknown, fallback: string): string {
  const body = (err as HttpErrorResponse)?.error;
  if (body?.Message || body?.message) return body.Message || body.message;
  if (Array.isArray(body?.Errors ?? body?.errors)) return 'Rapor ölçütleri geçersiz. Sayfayı yenileyip tekrar deneyin.';
  return fallback;
}

@Injectable({ providedIn: 'root' })
export class NotaReportService {
  private readonly httpService = inject(HttpService);
  private readonly baseUrl = 'api/IncomingDocuments/';

  // Hata durumunu ekran kendisi gösterir; genel "Sunucu Hatası" toast'ı çıkmaz
  private readonly quiet = () => ({ context: new HttpContext().set(SKIP_ERROR_TOAST, true) });

  private query(params: Record<string, string | number | null | undefined>): string {
    return Object.entries(params)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&');
  }

  getSenders(period: NotaPeriod = {}) {
    return this.httpService.get<NotaSender[]>(
      `${this.baseUrl}GetNotaSenders?${this.query({ year: period.year, dateField: period.dateField })}`, this.quiet());
  }

  getSummary(externalInstitutionId: string, period: NotaPeriod = {}) {
    return this.httpService.get<NotaSummary>(
      `${this.baseUrl}GetNotaSummary?${this.query({ externalInstitutionId, ...period })}`, this.quiet());
  }

}
