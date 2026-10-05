import { inject, Injectable } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { HttpService } from './http';
import { Common } from './common';
import { RoleService } from './role-service';
import { Department, DepartmentModel } from './department';
import { IncomingDocumentModel } from '../models/incoming-document/incoming-document.model';
import { OutgoingDocumentModel, OutgoingDocumentStatus } from '../models/outgoingdocument.model';

export type SearchDirection = 'in' | 'out';

/** Üst bardaki "Belge Ara" kutusunun tek sonuç satırı; gelen ve giden evrak aynı biçimde. */
export interface DocumentSearchResult {
  id: string;
  direction: SearchDirection;
  no: string;
  subject: string;
  departmentName: string;
  date: Date | null;
  statusLabel: string;
  statusClass: string;
  /** Küçük harfe çevrilmiş evrak no, orijinal no ve konu: arama bunun üzerinde yapılır */
  haystack: string;
}

const INCOMING_STATUS: Record<number, { label: string; cls: string }> = {
  1: { label: 'Ön Kayıt', cls: 'badge-soft-warning' },
  2: { label: 'Kayıt Tamamlandı', cls: 'badge-soft-info' },
  3: { label: 'Teslim Edildi', cls: 'badge-soft-success' },
};

const OUTGOING_STATUS: Record<number, { label: string; cls: string }> = {
  [OutgoingDocumentStatus.Taslak]: { label: 'Ön Kayıt', cls: 'badge-soft-warning' },
  [OutgoingDocumentStatus.Gonderildi]: { label: 'Gönderildi', cls: 'badge-soft-info' },
  [OutgoingDocumentStatus.TeslimEdildi]: { label: 'Teslim Edildi', cls: 'badge-soft-success' },
  [OutgoingDocumentStatus.Iade]: { label: 'İade', cls: 'badge-soft-danger' },
};

// Eski kayıtlarda kalmış 4 / 5 / 6 / 10 gibi ara durumlar "Kayıt Tamamlandı" sayılır
const INCOMING_DEFAULT = { label: 'Kayıt Tamamlandı', cls: 'badge-soft-info' };
const OUTGOING_DEFAULT = { label: '-', cls: 'badge-soft-fume' };

/** Liste yeniden çekilmeden önce önbellekte kalma süresi */
const CACHE_MS = 2 * 60 * 1000;

const lower = (value: string | null | undefined) => (value ?? '').toLocaleLowerCase('tr');

/** Girilmemiş tarih backend'den 0001-01-01 olarak gelebilir */
function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) || date.getFullYear() < 1900 ? null : date;
}

/**
 * Üst bar evrak araması. Ayrı bir arama uç noktası olmadığı için gelen ve giden evrak
 * listeleri bir kez çekilip tarayıcıda süzülür. Kapsam liste ekranlarıyla aynıdır:
 * gelen evrakta Yönetici / Gelen Evrak / Ön Kayıt tüm evrakları, diğerleri kendi
 * birimininkileri; giden evrakta Yönetici / Giden Evrak tümünü, diğerleri kendi birimini görür.
 */
@Injectable({ providedIn: 'root' })
export class DocumentSearchService {
  readonly #http = inject(HttpService);
  readonly #common = inject(Common);
  readonly #roles = inject(RoleService);
  readonly #departments = inject(Department);

  #cache$: Observable<DocumentSearchResult[]> | null = null;
  #cachedAt = 0;

  /** Arama listesini getirir; son CACHE_MS içinde çekildiyse önbellekten döner. */
  index(): Observable<DocumentSearchResult[]> {
    if (!this.#cache$ || Date.now() - this.#cachedAt > CACHE_MS) {
      this.#cachedAt = Date.now();
      this.#cache$ = this.#load().pipe(shareReplay(1));
    }
    return this.#cache$;
  }

  /** Oturum değişince (çıkış / farklı kullanıcı) önceki kullanıcının listesi kullanılmasın */
  clear(): void {
    this.#cache$ = null;
  }

  search(items: DocumentSearchResult[], term: string, limit: number): DocumentSearchResult[] {
    const words = lower(term).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return items.filter(i => words.every(w => i.haystack.includes(w))).slice(0, limit);
  }

  #load(): Observable<DocumentSearchResult[]> {
    const departmentId = this.#common.user()?.departmentId || undefined;
    const incomingScope = this.#roles.hasAny(['Yönetici', 'Gelen Evrak', 'Ön Kayıt']) ? undefined : departmentId;
    const outgoingScope = this.#roles.hasAny(['Yönetici', 'Giden Evrak']) ? undefined : departmentId;
    const query = (id?: string) => id ? `?departmentId=${encodeURIComponent(id)}` : '';
    const safe = <T>(obs: Observable<T[]>) => obs.pipe(catchError(() => of([] as T[])));

    return forkJoin({
      incoming: safe(this.#http.get<IncomingDocumentModel[]>(`api/IncomingDocuments/GetAll${query(incomingScope)}`)),
      outgoing: safe(this.#http.get<OutgoingDocumentModel[]>(`api/OutgoingDocuments/GetAll${query(outgoingScope)}`)),
      departments: safe(this.#departments.getDepartments()),
    }).pipe(
      map(({ incoming, outgoing, departments }) => {
        const deptName = new Map((departments as DepartmentModel[]).map(d => [d.id.toLowerCase(), d.name]));
        const nameOf = (id?: string | null) => (id && deptName.get(id.toLowerCase())) || '';

        const rows: DocumentSearchResult[] = [
          ...(incoming ?? []).filter(d => d.id && !d.isDeleted).map(d => {
            const status = INCOMING_STATUS[d.status] ?? INCOMING_DEFAULT;
            return {
              id: d.id!,
              direction: 'in' as const,
              no: d.qrCode || d.orginalNo || '-',
              subject: d.subject || '',
              departmentName: nameOf(d.departmentId),
              date: toDate(d.createdDate) ?? toDate(d.documentDate),
              statusLabel: status.label,
              statusClass: status.cls,
              haystack: lower([d.qrCode, d.orginalNo, d.subject].join(' ')),
            };
          }),
          ...(outgoing ?? []).filter(d => d.id && !d.isDeleted).map(d => {
            const status = OUTGOING_STATUS[d.status] ?? OUTGOING_DEFAULT;
            return {
              id: d.id,
              direction: 'out' as const,
              no: d.qrCode || d.originalDocumentNumber || '-',
              subject: d.subject || '',
              departmentName: nameOf(d.departmentId),
              date: toDate(d.createdDate) ?? toDate(d.documentDate),
              statusLabel: status.label,
              statusClass: status.cls,
              haystack: lower([d.qrCode, d.originalDocumentNumber, d.subject].join(' ')),
            };
          }),
        ];

        // En yeni evrak en üstte
        return rows.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
      })
    );
  }
}
