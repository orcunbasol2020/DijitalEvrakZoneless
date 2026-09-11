export interface IncomingDocumentPreRegisterModel {
  id: string;
  qrCode: string;
  userId: string;
  // 1 = iç sistem kullanıcısı (Users), 2 = dış kurum kullanıcısı (ExternalUsers)
  userType: number;
  documentDirection : number;
  isDeleted: boolean;
  createdDate: Date;
}
