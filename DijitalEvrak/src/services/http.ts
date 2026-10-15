import { inject, Injectable, resource, runInInjectionContext, Injector } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';

/** withCredentials yalnızca Windows girişinde gerekir (tarayıcı Windows kimliğini ancak böyle gönderir) */
export interface HttpOptions {
  context?: HttpContext;
  withCredentials?: boolean;
}

@Injectable({ providedIn: 'root' })
export class HttpService {
  readonly #http = inject(HttpClient);
  readonly #injector = inject(Injector);

  /**
   * Dinamik endpoint için resource oluşturur.
   * Injection context içinde çalışması için runInInjectionContext kullanıyoruz.
   */
  createResource<T>(endpoint: string) {
    return runInInjectionContext(this.#injector, () =>
      resource<T[], T[]>({
        loader: async () => await lastValueFrom(this.#http.get<T[]>(endpoint)),
        defaultValue: []
      })
    );
  }

  get<T>(endpoint: string, options?: HttpOptions) {
    return this.#http.get<T>(endpoint, options);
  }

  post<T>(endpoint: string, body: any, options?: HttpOptions) {
    return this.#http.post<T>(endpoint, body, options);
  }

  put<T>(endpoint: string, body: any, options?: { context?: HttpContext }) {
    return this.#http.put<T>(endpoint, body, options);
  }

  delete(endpoint: string) {
    return this.#http.delete<void>(endpoint);
  }
}
