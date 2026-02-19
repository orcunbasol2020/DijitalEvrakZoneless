export interface DocumentModel {
  id: string;
  orginalNo?: string;
  subject?: string;
  externalInstitutionId?: string;
  departmentId?: string;
  documentDate?: string;
  notes?: string;
  status?: string;

  // UI için ek alanlar
  qrCode?: string;
  //atananPersonel?: string;
  createdDate?: string;
  securityDegree?: string;
  documentTypeId?: string;
  languageId?: string;
  ocrStatus?: string;
  release?: string;
  submissionStatus?: string;
  electronicCopy?: string;
  //yayinla?: string;
  releaseDate?: string;
  pageCount?: string;
  userId?: string;
  isDeleted?: string;
  updateDate?: string;
  documentName?:string;
}
