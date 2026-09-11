export interface EnvelopeDocumentModel {
  id : string;
  envelopeId: string;
  documentId: string;
  qrCode: string;
  createdUserId?: string;
  isDeleted?: boolean;
  createdDate?: string;
  updateDate?: string;
}