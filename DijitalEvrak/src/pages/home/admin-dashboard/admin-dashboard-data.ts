import { computed, inject, Injectable, signal } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { HttpService } from '../../../services/http';
import { ExternalInstitution, ExternalInstitutionModel, ExternalInstitutionType } from '../../../services/external-institution';
import { Department, DepartmentModel } from '../../../services/department';
import { IncomingDocumentModel } from '../../../models/incoming-document/incoming-document.model';
import { OutgoingDocumentModel } from '../../../models/outgoingdocument.model';

// Nota kuralı (Nota Raporları backend'iyle aynı): yabancı misyondan gelen ve yabancı misyona giden her
// evrak, türü ne olursa olsun notadır. Misyon = dış kurum türü 1; Kurum ve Şahıs nota sayılmaz.
// Kimlikler küçük harfle karşılaştırılır (missionIds küçük harf tutar).

const key = (id: string | null | undefined) => (id ? id.toLowerCase() : null);

/** Gelen evrak nota ise gönderen misyonun kimliği (küçük harf), değilse null */
export function incomingNotaMission(d: IncomingDocumentModel, missionIds: ReadonlySet<string>): string | null {
  const id = key(d.externalInstitutionId);
  return id && missionIds.has(id) ? id : null;
}

/**
 * Giden evrakın alıcı misyonları (küçük harf); boşsa evrak nota değildir. Alıcılar dağıtım listesinden,
 * eski kayıtlarda tek alıcı alanından okunur; aynı misyon bir kez sayılır.
 */
export function outgoingNotaMissions(d: OutgoingDocumentModel, missionIds: ReadonlySet<string>): Set<string> {
  const recipients = new Set<string>();
  for (const dist of d.distributions ?? []) {
    const id = key(dist.externalInstitutionId);
    if (id && !(dist as { isDeleted?: boolean }).isDeleted && missionIds.has(id)) recipients.add(id);
  }
  const legacy = key(d.externalInstitutonId);
  if (legacy && missionIds.has(legacy)) recipients.add(legacy);
  return recipients;
}

/**
 * Yönetici panelindeki kartların ortak verisi: gelen / giden evrak, dış kurum ve birim listeleri
 * bir kez çekilir, kartlar (istatistikler, Diplomatik Nota Sayıları ...) buradan hesaplar.
 * Panel bileşeninde sağlanır; paneldeki Yenile düğmesi load() ile tazeler.
 */
@Injectable()
export class AdminDashboardData {
  readonly #http = inject(HttpService);
  readonly #institutions = inject(ExternalInstitution);
  readonly #departments = inject(Department);

  readonly loading = signal(true);
  readonly failed = signal(false);
  /** Silinmiş kayıtlar ayıklanmış halde */
  readonly incoming = signal<IncomingDocumentModel[]>([]);
  readonly outgoing = signal<OutgoingDocumentModel[]>([]);
  readonly institutions = signal<ExternalInstitutionModel[]>([]);
  readonly departments = signal<DepartmentModel[]>([]);
  /** Misyon türündeki dış kurumların kimlikleri, küçük harf */
  readonly missionIds = computed(() => new Set(
    this.institutions().filter(i => i.type === ExternalInstitutionType.Misyon).map(i => i.id.toLowerCase())));

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.failed.set(false);
    const safe = <T>(obs: Observable<T[]>) => obs.pipe(catchError(() => of(null)));

    forkJoin({
      incoming: safe(this.#http.get<IncomingDocumentModel[]>('api/IncomingDocuments/GetAll')),
      outgoing: safe(this.#http.get<OutgoingDocumentModel[]>('api/OutgoingDocuments/GetAll')),
      institutions: safe(this.#institutions.getExternalInstitutions()),
      // Birim adları yalnızca etiket için; gelmezse kartlar yine açılır
      departments: this.#departments.getDepartments().pipe(catchError(() => of([] as DepartmentModel[]))),
    }).subscribe(({ incoming, outgoing, institutions, departments }) => {
      if (!incoming || !outgoing || !institutions) {
        this.failed.set(true);
      } else {
        this.incoming.set(incoming.filter(d => !d.isDeleted));
        this.outgoing.set(outgoing.filter(d => !d.isDeleted));
        this.institutions.set(institutions.filter(i => !i.isDeleted));
        this.departments.set(departments ?? []);
      }
      this.loading.set(false);
    });
  }
}
