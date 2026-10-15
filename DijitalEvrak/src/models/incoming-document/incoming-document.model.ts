import { DepartmentId, ExternalInstitutionId } from '../ids';
export interface IncomingDocumentModel {
  id?: string;

  orginalNo?: string;
  qrCode?: string;

  securityDegree: number;
  // İvedilik derecesi (bkz. UrgencyDegreeEnum); eski kayıtlarda boş olabilir
  urgencyDegree?: number;
  documentTypeId: number;
  languageId: number;

  subject?: string;
  content_Ocr?: string;

  externalInstitutionId?: ExternalInstitutionId | null;
  // Kurum adı (ComAgency); cevapta doldurulur, ad için kurum listesi çekilmez
  externalInstitutionName?: string | null;
  // Geçiş dönemi alanı: yalnızca ana alıcıyı (ilk Gereği alıcısı, yoksa ilk alıcı) taşır.
  // "Nereye" için distributions okunur; Create / Update'te gönderilmez (bkz. recipients).
  departmentId?: DepartmentId | null;

  status: number;
  electronicCopy: boolean;
  release: boolean;
  pageCount: number;
  // Ek bilgisi: true = ek var, false = ek yok, null = belirtilmemiş.
  // Update'te null gönderilirse sunucudaki değer korunur.
  hasAttachment?: boolean | null;
  // Ekin serbest metin açıklaması (en fazla 1000 karakter); "" gönderilirse silinir,
  // hasAttachment = false ise sunucuda otomatik silinir.
  attachmentDescription?: string | null;

  documentDate: string;
  releaseDate: string;

  ocrStatus?: number;
  submissionStatus: number;

  userId?: string;
  // Evrakı oluşturan (ön kaydı yapan) kullanıcı; sütun eklenmeden önceki kayıtlarda null
  createdUserId?: string | null;

  documentName?: string;
  notes?: string;

  // 🔹 Yeni eklenenler
  isDeleted?: boolean;
  createdDate?: Date;
  updateDate?: Date | null;

  // true: Gereği, false: Bilgi. Backend alıcılardan hesaplar (biri Gereği ise Gereği);
  // recipients gönderildiğinde formdan gelen değer dikkate alınmaz.
  actionRequired?: boolean | null;

  // "Nereye" alıcıları. GetAll / GetByStatus'ta dolu gelir (birim adı olmadan);
  // GetById'de boş döner, düzenleme ekranı GetDistributions'tan okur.
  distributions?: IncomingDocumentDistributionModel[];

  // Create / Update isteğinde alıcı listesi. Update'te liste mevcut alıcıların YERİNE geçer
  // ([] tümünü kaldırır); alan hiç gönderilmezse (undefined / null) alıcılara dokunulmaz.
  recipients?: IncomingDocumentRecipientInput[] | null;

  currentAssignmentUserId : string;
  // Atanan personelin adı (GetAll yanıtında gelir; gelmezse kullanıcı listesinden çözülür)
  currentAssignmentUser?: string | null;
}

// Gelen evrakın "Nereye" alıcısı: yalnızca iç birim; Gereği/Bilgi alıcı bazında.
// GetDistributions yanıtında departmentName dolu gelir; liste yanıtlarında gelmez.
export interface IncomingDocumentDistributionModel {
  id: string;
  incomingDocumentId: string;
  departmentId: DepartmentId;
  departmentName?: string | null;
  // true: Gereği, false: Bilgi; null Atlas'a Gereği olarak gider
  actionRequired?: boolean | null;
  notes?: string | null;
  isDeleted?: boolean;
  createdDate: string;
  updateDate?: string | null;
}

export interface IncomingDocumentRecipientInput {
  departmentId: DepartmentId;
  actionRequired?: boolean | null;
  notes?: string | null;
}

// Alıcı notu için sunucunun kabul ettiği en fazla karakter
export const INCOMING_RECIPIENT_NOTES_MAX = 500;

/**
 * Evrakın silinmemiş alıcıları (eklenme sırasıyla). Dağıtım listesi boş gelen yanıtlarda
 * (ör. GetById) evraktaki ana alıcıya (departmentId) düşülür.
 */
export function incomingRecipientsOf(doc: Pick<IncomingDocumentModel, 'distributions' | 'departmentId' | 'actionRequired'>)
  : { departmentId: DepartmentId; actionRequired: boolean | null }[] {
  const list = (doc.distributions ?? []).filter(d => !d.isDeleted && d.departmentId);
  if (list.length) return list.map(d => ({ departmentId: d.departmentId, actionRequired: d.actionRequired ?? null }));
  return doc.departmentId ? [{ departmentId: doc.departmentId, actionRequired: doc.actionRequired ?? null }] : [];
}

/**
 * "Nereye" sütunu için alıcı adları. Liste yanıtlarında birim adı gelmediğinden id'ler verilen
 * eşlemeyle ada çevrilir; çözülemeyen birim atlanır. Bilgi alıcıları ekle ayrılır: hücrelerde
 * kısa "(B)", tooltip ve dışa aktarımda açık "(Bilgi)" (infoLabel).
 */
export function incomingRecipientNames(
  doc: Pick<IncomingDocumentModel, 'distributions' | 'departmentId' | 'actionRequired'>,
  nameOf: (departmentId: DepartmentId) => string | null | undefined,
  infoLabel: 'B' | 'Bilgi' = 'B'
): string[] {
  return incomingRecipientsOf(doc)
    .map(r => {
      const name = nameOf(r.departmentId)?.trim();
      if (!name) return '';
      return r.actionRequired === false ? `${name} (${infoLabel})` : name;
    })
    .filter(Boolean);
}

/** Hücre metni: en fazla iki ad virgülle; fazlası "X ve N birim daha" (tam liste title'da). */
export function summarizeRecipientNames(names: string[]): string {
  if (names.length <= 2) return names.join(', ');
  return `${names[0]} ve ${names.length - 1} birim daha`;
}
