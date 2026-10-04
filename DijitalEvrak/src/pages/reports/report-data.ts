import { Injectable, inject } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { IncomingDocumentService } from '../../services/incomingdocument';
import { Department } from '../../services/department';
import { ExternalInstitution, ExternalInstitutionType } from '../../services/external-institution';
import { Language } from '../../services/language';
import { UserService } from '../../services/user';
import { HttpService } from '../../services/http';
import { IncomingDocumentModel } from '../../models/incoming-document/incoming-document.model';
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

const INSTITUTION_TYPE_LABELS: Record<number, string> = {
  [ExternalInstitutionType.Misyon]: 'Misyon',
  [ExternalInstitutionType.Kurum]: 'Kurum',
  [ExternalInstitutionType.Sahis]: 'Şahıs',
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

function key(id: string | null | undefined): string | null {
  return id ? id.toLowerCase() : null;
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
      institutions: safe(this.institutionService.getExternalInstitutions()),
      languages: safe(this.languageService.getLanguages()),
      users: safe(this.userService.getAll()),
      envelopes: safe(this.http.get<EnvelopeModel[]>('api/Envelopes/GetAll')),
    }).pipe(map(raw => {
      const departments = new Map<string, string>();
      for (const d of raw.departments) if (d.id) departments.set(d.id.toLowerCase(), d.name);

      const institutions = new Map<string, { name: string; type: string }>();
      for (const i of raw.institutions) {
        if (i.id) institutions.set(i.id.toLowerCase(), { name: i.name, type: INSTITUTION_TYPE_LABELS[i.type] ?? UNKNOWN });
      }

      const languages = new Map<string, string>();
      for (const l of raw.languages) if (l.id) languages.set(String(l.id).toLowerCase(), l.name);

      const users = new Map<string, string>();
      for (const u of raw.users) if (u.id) users.set(u.id.toLowerCase(), `${u.name} ${u.surname}`.trim());

      // Gönderen / alıcı kurum dış kurumda yoksa kurum içi birim olabilir
      const place = (id: string | null | undefined) => {
        const k = key(id);
        if (!k) return { name: UNKNOWN, type: UNKNOWN };
        return institutions.get(k) ?? (departments.has(k) ? { name: departments.get(k)!, type: 'Kurum İçi' } : { name: UNKNOWN, type: UNKNOWN });
      };

      const docs: ReportDoc[] = [];

      for (const d of (raw.incoming ?? []) as IncomingDocumentModel[]) {
        if (d.isDeleted) continue;
        const created = toDate(d.createdDate);
        const release = toDate(d.releaseDate);
        const published = isPublished(d);
        const inst = place(d.externalInstitutionId);
        docs.push({
          id: d.id ?? '',
          direction: 'in',
          no: d.qrCode || d.orginalNo || '—',
          subject: d.subject ?? '',
          searchText: [d.qrCode, d.orginalNo, d.subject, d.notes, d.content_Ocr].filter(Boolean).join(' ').toLocaleLowerCase('tr'),
          createdDate: created,
          documentDate: toDate(d.documentDate),
          departmentId: key(d.departmentId),
          departmentName: departments.get(key(d.departmentId) ?? '') ?? UNKNOWN,
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
        const inst = place(d.externalInstitutonId);
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
          || (e.externalInstitutionId ? place(e.externalInstitutionId).name : null)
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
        institutions: [...institutions].map(([id, v]) => ({ id, name: v.name })).sort(byName),
        users: [...users].map(([id, name]) => ({ id, name })).sort(byName),
        languages: [...new Set(languages.values())].sort((a, b) => a.localeCompare(b, 'tr')),
        loadedAt: new Date(),
      };
    }));
  }
}
