import { inject, Injectable, signal } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { HttpService } from '../../../services/http';
import { ExternalInstitution, ExternalInstitutionModel } from '../../../services/external-institution';
import { Department, DepartmentModel } from '../../../services/department';
import { IncomingDocumentModel } from '../../../models/incoming-document/incoming-document.model';
import { OutgoingDocumentModel } from '../../../models/outgoingdocument.model';
import { DocumentTypeEnum } from '../../../models/documenttype.model';

/** Gelen evrakta nota sayılan türler */
export const INCOMING_NOTA_TYPES = new Set<number>([DocumentTypeEnum.Nota, DocumentTypeEnum.ENota]);
/** Giden evrak türü (API alanı "type"): 1 Nota, 2 Evrak */
export const OUTGOING_NOTA_TYPE = 1;

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
