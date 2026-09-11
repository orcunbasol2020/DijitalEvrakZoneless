export enum OutgoingDocumentStatus {
  Taslak = 1,
  Gonderildi = 2,
  TeslimEdildi = 3,
  Iade = 4
}

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
  createdDate?: string;
  updateDate?: string;
  isDeleted?: boolean;
}
