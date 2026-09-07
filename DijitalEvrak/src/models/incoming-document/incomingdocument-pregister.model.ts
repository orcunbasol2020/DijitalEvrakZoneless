export interface IncomingDocumentPreRegisterModel {
  id: string;
  qrCode: string;
  userId: string;
  documentDirection : number;
  isDeleted: boolean;
  createdDate: Date;
}
