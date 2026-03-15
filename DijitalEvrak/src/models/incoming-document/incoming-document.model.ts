export interface IncomingDocumentModel {
  id?: string;

  orginalNo?: string;
  qrCode?: string;

  securityDegree: number;
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

  documentDate: string;
  releaseDate: string;

  ocrStatus?: number;
  submissionStatus: number;

  userId?: string;

  documentName?: string;
  notes?: string;

  // 🔹 Yeni eklenenler
  isDeleted?: boolean;
  createdDate?: Date;
  updateDate?: Date | null;

  currentAssignmentUserId : string;
}
