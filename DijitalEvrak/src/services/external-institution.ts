import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { HttpContext } from '@angular/common/http';
import { HttpService } from './http';
import { SKIP_ERROR_TOAST } from '../interceptors/error-interceptor';
import { ExternalInstitutionId } from '../models/ids';

// Dış kurumlar kaynak sistemden (ComAgency) gelir, bizde salt okunurdur; kimlikleri sayıdır.
export enum ExternalInstitutionType {
  /** Türkiye'deki yabancı misyonlar (~840); gönderdikleri her evrak notadır */
  Misyon = 1,
  /** DETSİS kamu kurumları (~160.000): liste yalnızca aramayla çekilir */
  Kurum = 2,
  /** Tek kayıt, id -1 */
  Dilekce = 3,
  /** BM ajansları, NATO, AGİT ... (59); nota sayılmaz */
  UluslararasiKurulus = 4,
}

export const EXTERNAL_INSTITUTION_TYPE_LABELS: Record<number, string> = {
  [ExternalInstitutionType.Misyon]: 'Misyon',
  [ExternalInstitutionType.Kurum]: 'Kurum',
  [ExternalInstitutionType.Dilekce]: 'Dilekçe / Talep',
  [ExternalInstitutionType.UluslararasiKurulus]: 'Uluslararası Kuruluş',
};

export interface ExternalInstitutionModel {
  id: ExternalInstitutionId;
  name: string;
  type: number;
  address?: string | null;
  /** DETSİS kaynaklı kurumlarda 8 haneli numara */
  detsisCode?: string | null;
  parentId?: ExternalInstitutionId | null;
  isDeleted?: boolean;
}

export interface ExternalInstitutionFilter {
  type?: ExternalInstitutionType | null;
  /** Adda geçen metin ya da tam DETSİS numarası */
  search?: string | null;
  /** Tür boşken ya da Kurum iken en fazla bu kadar kayıt (sunucu varsayılanı 50, en fazla 200) */
  take?: number | null;
}

/** Aramanın sunucuya gitmesi için gereken en az karakter */
export const INSTITUTION_MIN_SEARCH = 2;

@Injectable({ providedIn: 'root' })
export class ExternalInstitution {

  private httpService = inject(HttpService);
  // backend path ile birebir eşleşiyor
  private baseUrl = 'api/ExternalInstitutions/';

  /**
   * Kurumlar ~160.000 kayıt: tür verilmezse ya da Kurum (2) ise sunucu en fazla take kayıt döner, bu yüzden
   * kurum seçimi search ile yapılmalı. Misyon, dilekçe ve uluslararası kuruluş listeleri küçüktür, tamamı gelir.
   * Ad göstermek için liste çekilmez: evrak / zarf cevaplarında externalInstitutionName gelir.
   */
  getExternalInstitutions(filter: ExternalInstitutionFilter = {}) {
    return this.httpService.get<ExternalInstitutionModel[]>(this.listUrl(filter));
  }

  /** Türkiye'deki yabancı misyonların tamamı (~840) */
  getMissions() {
    return this.getExternalInstitutions({ type: ExternalInstitutionType.Misyon });
  }

  listUrl(filter: ExternalInstitutionFilter = {}): string {
    const params = Object.entries(filter)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
    return `${this.baseUrl}GetAll${params.length ? '?' + params.join('&') : ''}`;
  }

  /**
   * Dışişleri birimleri ve kaynakta kapatılmış kurumlar için 404 döner (genel hata toast'ı çıkmaz).
   * Evrak / zarf ekranlarında ad için kullanılmaz: cevaptaki externalInstitutionName okunur.
   */
  getExternalInstitutionById(id: ExternalInstitutionId) {
    return this.httpService.get<ExternalInstitutionModel>(`${this.baseUrl}GetById?id=${id}`,
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }
}

/**
 * Kurum seçiciler için sunucuda arama: yazılan metin kısa bir beklemeden sonra GetAll?search= ile aranır.
 * Bileşenin alan başlatıcısında (injection context) oluşturulur; bileşen kapanınca istek iptal edilir.
 */
export function institutionSearch(filter: Omit<ExternalInstitutionFilter, 'search'> = {}) {
  const service = inject(ExternalInstitution);
  const destroyRef = inject(DestroyRef);
  const options = signal<ExternalInstitutionModel[]>([]);
  const loading = signal(false);
  const terms = new Subject<string>();

  terms.pipe(
    debounceTime(300),
    distinctUntilChanged(),
    switchMap(term => {
      if (term.length < INSTITUTION_MIN_SEARCH) {
        loading.set(false);
        return of([] as ExternalInstitutionModel[]);
      }
      loading.set(true);
      return service.getExternalInstitutions({ ...filter, search: term })
        .pipe(catchError(() => of([] as ExternalInstitutionModel[])));
    }),
    takeUntilDestroyed(destroyRef)
  ).subscribe(list => {
    loading.set(false);
    options.set((list ?? []).filter(i => !i.isDeleted));
  });

  return {
    options: options.asReadonly(),
    loading: loading.asReadonly(),
    search: (term: string) => terms.next((term ?? '').trim()),
  };
}
