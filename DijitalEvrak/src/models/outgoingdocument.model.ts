export enum OutgoingDocumentStatus {
  Taslak = 1,
  Gonderildi = 2,
  TeslimEdildi = 3,
  Iade = 4
}

// Liste görünümünde tam metin yerine baş harfli yuvarlak rozet gösterilirken kullanılır.
export const OutgoingDocumentStatusInitials: Record<OutgoingDocumentStatus, string> = {
  [OutgoingDocumentStatus.Taslak]: 'Ö',
  [OutgoingDocumentStatus.Gonderildi]: 'G',
  [OutgoingDocumentStatus.TeslimEdildi]: 'T',
  [OutgoingDocumentStatus.Iade]: 'İ'
};

// "status-tier-*" sınıfları styles.css'te tanımlıdır.
export const OutgoingDocumentStatusBadgeClass: Record<OutgoingDocumentStatus, string> = {
  [OutgoingDocumentStatus.Taslak]: 'status-tier-taslak',
  [OutgoingDocumentStatus.Gonderildi]: 'status-tier-gonderildi',
  [OutgoingDocumentStatus.TeslimEdildi]: 'status-tier-teslim',
  [OutgoingDocumentStatus.Iade]: 'status-tier-iade'
};

export interface OutgoingDocumentModel {
  id: string;
  qrCode?: string;
  originalDocumentNumber?: string;
  subject?: string;
  documentDate?: string;
  status: OutgoingDocumentStatus;
  cargoPostNumber?: string;
  // API alan adı gerçekten böyle (harf eksik) döner, düzeltmeyin.
  externalInstitutonId?: string | null;
  // Gönderen birim (dahili). Manuel giden evrak kaydında kullanılıyor.
  departmentId?: string | null;
  // Evrak türü (1: Nota, 2: Evrak). API alan adı "type" (documentTypeId değil).
  type?: number;
  // Gizlilik derecesi (bkz. SecurityDegreeEnum).
  securityDegree?: number;
  // Aciliyet derecesi (bkz. UrgencyDegreeEnum).
  urgencyDegree?: number;
  // true: Gereği, false: Bilgi
  actionRequired?: boolean | null;
  // Dil (bkz. services/language.ts - LanguageModel).
  languageId?: string | null;
  // Kayıt kaynağı (backend AllocationSourceEnum: 1: Evrak Takip / manuel kayıt, 2: Atlas).
  source?: number;
  createdUserId?: string;
  createdDate?: string;
  updateDate?: string;
  isDeleted?: boolean;
}
