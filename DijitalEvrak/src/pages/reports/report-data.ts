import { ExternalInstitutionId, idKey } from '../../models/ids';
import { Injectable, inject } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { IncomingDocumentService } from '../../services/incomingdocument';
import { Department } from '../../services/department';
import { EXTERNAL_INSTITUTION_TYPE_LABELS, ExternalInstitution, ExternalInstitutionType } from '../../services/external-institution';
import { Language } from '../../services/language';
import { UserService } from '../../services/user';
import { HttpService } from '../../services/http';
import { IncomingDocumentModel, incomingRecipientsOf } from '../../models/incoming-document/incoming-document.model';
import { OutgoingDocumentModel, OutgoingDocumentStatus } from '../../models/outgoingdocument.model';
import { EnvelopeModel, EnvelopeStatus, EnvelopeStatusLabels } from '../../models/envelope.model';
import { UrgencyDegreeEnum, UrgencyDegreeLabels } from '../../models/urgencydegree.model';
import { SecurityDegreeEnum, SecurityDegreeLabels } from '../../models/securitydegree.model';
import { DocumentTypeEnum, DocumentTypeLabels } from '../../models/documenttype.model';
import { isPublished, publishStatusLabel } from '../../models/publishstatus.model';

export type Direction = 'in' | 'out';

/**
 * Raporların üzerinde çalıştığı tek satır: gelen ve giden evrak aynı biçime çevrilir,
 * id'ler ada çözülür. Tüm grafikler ve Detaylı Sorgu bu listeden hesaplanır.
 */
export interface ReportDoc {
  id: string;
  direction: Direction;
  no: string;
  subject: string;
  /** Konu, not ve OCR metni: serbest metin aramasında kullanılır (küçük harf) */
  searchText: string;
  createdDate: Date | null;
  documentDate: Date | null;
  departmentId: string | null;
  departmentName: string;
  /** Birim bazlı süzgeç ve sayımlar için: gelen evrakta tüm alıcı birimler ("Nereye" listesi),
   *  giden evrakta gönderen birim. Hiç birim yoksa tek "Belirtilmemiş" kaydı. departmentId ilk
   *  birim, departmentName adların virgülle birleşimidir (tablo, sıralama ve CSV için). */
  units: { id: string | null; name: string }[];
  institutionId: string | null;
  institutionName: string;
  institutionType: string;
  urgency: number | null;
  urgencyLabel: string;
  security: number | null;
  securityLabel: string;
  typeLabel: string;
  languageName: string;
  statusLabel: string;
  /** Gelen: teslim alındı (status 3). Giden: teslim edildi (status 3). */
  delivered: boolean;
  /** Gelen: Atlas'ta yayınlandı. Giden için anlamsız (false). */
  published: boolean;
  publishLabel: string;
  actionLabel: string;
  createdUserId: string | null;
  createdUserName: string;
  assigneeName: string;
  electronicCopy: boolean | null;
  sourceLabel: string;
  /** Gelen: kayıttan Atlas yayınına geçen saat (yayınlanmışsa) */
  publishHours: number | null;
}

export interface EnvelopeRow {
  id: string;
  no: string;
  statusLabel: string;
  institutionName: string;
  departmentId: string | null;
  departmentName: string;
  documentCount: number;
  createdDate: Date | null;
}

export interface ReportDataset {
  docs: ReportDoc[];
  envelopes: EnvelopeRow[];
  departments: { id: string; name: string }[];
  institutions: { id: string; name: string }[];
  users: { id: string; name: string }[];
  languages: string[];
  loadedAt: Date;
}

const UNKNOWN = 'Belirtilmemiş';
/** "Dilekçe / Talep" göndereninin sabit kimliği */
const DILEKCE_ID = -1;

export const INCOMING_STATUS_LABELS: Record<number, string> = {
  1: 'Ön Kayıt',
  2: 'Kayıt Tamamlandı',
  3: 'Teslim Edildi',
  4: 'Eşleştirme',
  5: 'OCR',
};

export const OUTGOING_STATUS_LABELS: Record<number, string> = {
  [OutgoingDocumentStatus.Taslak]: 'Ön Kayıt',
  [OutgoingDocumentStatus.Gonderildi]: 'Gönderildi',
  [OutgoingDocumentStatus.TeslimEdildi]: 'Teslim Edildi',
  [OutgoingDocumentStatus.Iade]: 'İade',
};


/** Giden evrak türü (API alanı "type"): 1 Nota, 2 Evrak */
const OUTGOING_TYPE_LABELS: Record<number, string> = { 1: 'Nota', 2: 'Evrak' };

const SOURCE_LABELS: Record<number, string> = { 1: 'Evrak Takip', 2: 'Atlas' };

/** Girilmemiş tarih backend'den 0001-01-01 olarak gelebilir */
export function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) || date.getFullYear() < 1900 ? null : date;
}

// Birim kimliği sayı, diğerleri Guid: tüm eşlemeler idKey biçimindeki metin anahtarla yapılır
function key(id: string | number | null | undefined): string | null {
  return idKey(id);
}

/** Birim id'lerini adlarıyla (tekrarsız) döndürür; hiç birim yoksa tek "Belirtilmemiş" kaydı. */
function unitsOf(ids: (string | number | null | undefined)[], departments: Map<string, string>): { id: string | null; name: string }[] {
  const units = new Map<string, { id: string | null; name: string }>();
  for (const id of ids) {
    const k = key(id);
    if (k && !units.has(k)) units.set(k, { id: k, name: departments.get(k) ?? UNKNOWN });
  }
  return units.size ? [...units.values()] : [{ id: null, name: UNKNOWN }];
}

function actionLabel(value: boolean | null | undefined): string {
  return value === true ? 'Gereği' : value === false ? 'Bilgi' : UNKNOWN;
}

@Injectable({ providedIn: 'root' })
export class ReportDataService {
  private readonly incoming = inject(IncomingDocumentService);
  private readonly departmentService = inject(Department);
  private readonly institutionService = inject(ExternalInstitution);
  private readonly languageService = inject(Language);
  private readonly userService = inject(UserService);
  private readonly http = inject(HttpService);

  /** Tüm kaynaklar paralel alınır; yardımcı listelerden biri gelmezse rapor yine açılır (adlar "Belirtilmemiş" olur). */
  load(): Observable<ReportDataset> {
    const safe = <T>(obs: Observable<T[]>) => obs.pipe(catchError(() => of([] as T[])));

    return forkJoin({
      incoming: this.incoming.getAllIncomingDocuments(),
      outgoing: safe(this.http.get<OutgoingDocumentModel[]>('api/OutgoingDocuments/GetAll')),
      departments: safe(this.departmentService.getDepartments()),
      // Kurum adı evrak cevaplarında gelir (~160.000 kurum çekilmez); tür için yalnızca küçük listeler alınır,
      // bunlarda olmayan kurum DETSİS kurumudur
      institutions: safe(forkJoin([
        this.institutionService.getMissions(),
        this.institutionService.getExternalInstitutions({ type: ExternalInstitutionType.UluslararasiKurulus }),
      ]).pipe(map(([missions, international]) => [...(missions ?? []), ...(international ?? [])]))),
      languages: safe(this.languageService.getLanguages()),
      users: safe(this.userService.getAll({ onlyWithRoles: true })),
      envelopes: safe(this.http.get<EnvelopeModel[]>('api/Envelopes/GetAll')),
    }).pipe(map(raw => {
      const departments = new Map<string, string>();
      for (const d of raw.departments) if (d.id) departments.set(key(d.id)!, d.name);

      const institutionTypes = new Map<string, string>();
      for (const i of raw.institutions) {
        if (i.id) institutionTypes.set(key(i.id)!, EXTERNAL_INSTITUTION_TYPE_LABELS[i.type] ?? UNKNOWN);
      }

      const languages = new Map<string, string>();
      for (const l of raw.languages) if (l.id) languages.set(String(l.id).toLowerCase(), l.name);

      const users = new Map<string, string>();
      for (const u of raw.users) if (u.id) users.set(u.id.toLowerCase(), `${u.name} ${u.surname}`.trim());

      // Gönderen / alıcı kurum: ad cevaptan; tür misyon / uluslararası kuruluş listesinden, dilekçe -1,
      // diğerleri DETSİS kurumu
      const place = (id: ExternalInstitutionId | null | undefined, name: string | null | undefined) => {
        const k = key(id);
        if (!k) return { name: UNKNOWN, type: UNKNOWN };
        const type = id === DILEKCE_ID
          ? EXTERNAL_INSTITUTION_TYPE_LABELS[ExternalInstitutionType.Dilekce]
          : institutionTypes.get(k) ?? EXTERNAL_INSTITUTION_TYPE_LABELS[ExternalInstitutionType.Kurum];
        return { name: name || UNKNOWN, type };
      };

      const docs: ReportDoc[] = [];

      for (const d of (raw.incoming ?? []) as IncomingDocumentModel[]) {
        if (d.isDeleted) continue;
        const created = toDate(d.createdDate);
        const release = toDate(d.releaseDate);
        const published = isPublished(d);
        const inst = place(d.externalInstitutionId, d.externalInstitutionName);
        // Gelen evrak birden fazla birime gidebilir: her alıcı birim ayrı sayılır
        const units = unitsOf(incomingRecipientsOf(d).map(r => r.departmentId), departments);
        docs.push({
          id: d.id ?? '',
          direction: 'in',
          no: d.qrCode || d.orginalNo || '—',
          subject: d.subject ?? '',
          searchText: [d.qrCode, d.orginalNo, d.subject, d.notes, d.content_Ocr].filter(Boolean).join(' ').toLocaleLowerCase('tr'),
          createdDate: created,
          documentDate: toDate(d.documentDate),
          departmentId: units[0].id,
          departmentName: units.map(u => u.name).join(', '),
          units,
          institutionId: key(d.externalInstitutionId),
          institutionName: inst.name,
          institutionType: inst.type,
          urgency: d.urgencyDegree ?? null,
          urgencyLabel: UrgencyDegreeLabels[d.urgencyDegree as UrgencyDegreeEnum] ?? UNKNOWN,
          security: d.securityDegree ?? null,
          securityLabel: SecurityDegreeLabels[d.securityDegree as SecurityDegreeEnum] ?? UNKNOWN,
          typeLabel: DocumentTypeLabels[d.documentTypeId as DocumentTypeEnum] ?? UNKNOWN,
          languageName: languages.get(String(d.languageId ?? '').toLowerCase()) ?? UNKNOWN,
          statusLabel: INCOMING_STATUS_LABELS[d.status] ?? UNKNOWN,
          delivered: d.status === 3,
          published,
          publishLabel: publishStatusLabel(d),
          actionLabel: actionLabel(d.actionRequired),
          createdUserId: key(d.createdUserId),
          createdUserName: users.get(key(d.createdUserId) ?? '') ?? UNKNOWN,
          assigneeName: d.currentAssignmentUser || users.get(key(d.currentAssignmentUserId) ?? '') || '—',
          electronicCopy: d.electronicCopy ?? null,
          sourceLabel: 'Evrak Takip',
          publishHours: published && created && release && release >= created
            ? (release.getTime() - created.getTime()) / 3_600_000 : null,
        });
      }

      for (const d of raw.outgoing ?? []) {
        if (d.isDeleted) continue;
        const inst = place(d.externalInstitutonId, d.externalInstitutionName);
        docs.push({
          id: d.id,
          direction: 'out',
          no: d.qrCode || d.originalDocumentNumber || '—',
          subject: d.subject ?? '',
          searchText: [d.qrCode, d.originalDocumentNumber, d.subject].filter(Boolean).join(' ').toLocaleLowerCase('tr'),
          createdDate: toDate(d.createdDate),
          documentDate: toDate(d.documentDate),
          departmentId: key(d.departmentId),
          departmentName: departments.get(key(d.departmentId) ?? '') ?? UNKNOWN,
          units: unitsOf([d.departmentId], departments),
          institutionId: key(d.externalInstitutonId),
          institutionName: inst.name,
          institutionType: inst.type,
          urgency: d.urgencyDegree ?? null,
          urgencyLabel: UrgencyDegreeLabels[d.urgencyDegree as UrgencyDegreeEnum] ?? UNKNOWN,
          security: d.securityDegree ?? null,
          securityLabel: SecurityDegreeLabels[d.securityDegree as SecurityDegreeEnum] ?? UNKNOWN,
          typeLabel: OUTGOING_TYPE_LABELS[d.type ?? 0] ?? UNKNOWN,
          languageName: languages.get(String(d.languageId ?? '').toLowerCase()) ?? UNKNOWN,
          statusLabel: OUTGOING_STATUS_LABELS[d.status] ?? UNKNOWN,
          delivered: d.status === OutgoingDocumentStatus.TeslimEdildi,
          published: false,
          publishLabel: '—',
          actionLabel: actionLabel(d.actionRequired),
          createdUserId: key(d.createdUserId),
          createdUserName: users.get(key(d.createdUserId) ?? '') ?? UNKNOWN,
          assigneeName: '—',
          electronicCopy: null,
          sourceLabel: SOURCE_LABELS[d.source ?? 0] ?? UNKNOWN,
          publishHours: null,
        });
      }

      const envelopes: EnvelopeRow[] = (raw.envelopes ?? []).map(e => ({
        id: e.id ?? '',
        no: e.envelopeNo ?? '—',
        statusLabel: EnvelopeStatusLabels[e.status as EnvelopeStatus] ?? UNKNOWN,
        // Gideceği yer: dış kurum / misyon ya da kurum içi birim (ikisi birlikte dolu olmaz)
        institutionName: e.externalInstitutionName || e.targetDepartmentName
          || departments.get(key(e.targetDepartmentId) ?? '') || UNKNOWN,
        departmentId: key(e.departmentId),
        departmentName: departments.get(key(e.departmentId) ?? '') ?? UNKNOWN,
        documentCount: e.documentCount ?? 0,
        createdDate: toDate(e.createdDate),
      }));

      const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'tr');
      return {
        docs,
        envelopes,
        departments: [...departments].map(([id, name]) => ({ id, name })).sort(byName),
        // Kurum seçenekleri evraklardaki kurumlardan (ad cevaptan gelir)
        institutions: [...new Map(docs.filter(d => d.institutionId).map(d => [d.institutionId!, d.institutionName])).entries()]
          .map(([id, name]) => ({ id, name })).sort(byName),
        users: [...users].map(([id, name]) => ({ id, name })).sort(byName),
        languages: [...new Set(languages.values())].sort((a, b) => a.localeCompare(b, 'tr')),
        loadedAt: new Date(),
      };
    }));
  }
}
