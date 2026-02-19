import { inject, Injectable, resource, runInInjectionContext, Injector } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';

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

  get<T>(endpoint: string) {
    return this.#http.get<T>(endpoint);
  }

  post<T>(endpoint: string, body: any) {
    return this.#http.post<T>(endpoint, body);
  }

  put<T>(endpoint: string, body: any) {
    return this.#http.put<T>(endpoint, body);
  }

  delete(endpoint: string) {
    return this.#http.delete<void>(endpoint);
  }
}
