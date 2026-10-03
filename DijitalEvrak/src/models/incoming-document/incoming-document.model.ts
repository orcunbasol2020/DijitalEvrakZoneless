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

  externalInstitutionId?: string;
  departmentId?: string;

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

  // true: Gereği, false: Bilgi
  actionRequired?: boolean | null;

  currentAssignmentUserId : string;
  // Atanan personelin adı (GetAll yanıtında gelir; gelmezse kullanıcı listesinden çözülür)
  currentAssignmentUser?: string | null;
}
