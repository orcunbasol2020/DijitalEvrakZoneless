import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { SKIP_ERROR_TOAST } from '../interceptors/error-interceptor';

/** GET api/AppSettings/GetAll satırı. Değerler her zaman string gelir ("true", "100", null). */
export interface AppSettingModel {
  id?: string;
  key: string;
  value: string | null;
  /** Backend'den gelen yardım metni */
  description?: string | null;
  updatedByUserId?: string | null;
  /** UTC */
  updateDate?: string | null;
}

/**
 * Uygulama ayarları (AppSettings tablosu, anahtar-değer). Kaydedildiği an geçerli olur.
 * Update hataları genel toast'a düşmez; ekran hangi ayarın kaydedilemediğini kendisi gösterir.
 */
@Injectable({ providedIn: 'root' })
export class AppSettingsService {
  readonly #http = inject(HttpClient);
  readonly #baseUrl = 'api/AppSettings/';

  getAll() {
    return this.#http.get<AppSettingModel[]>(`${this.#baseUrl}GetAll`);
  }

  /** value her zaman string gönderilir; token varsa backend güncelleyeni token'dan alır. */
  update(key: string, value: string, userId: string) {
    return this.#http.post<{ message: string }>(
      `${this.#baseUrl}Update`,
      { key, value, userId },
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) }
    );
  }
}
