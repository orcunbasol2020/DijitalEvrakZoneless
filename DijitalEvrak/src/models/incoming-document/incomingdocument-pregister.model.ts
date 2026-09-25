export interface IncomingDocumentPreRegisterModel {
  id: string;
  qrCode: string;
  userId: string;
  // 1 = iç sistem kullanıcısı (Users), 2 = dış kurum kullanıcısı (ExternalUsers)
  userType: number;
  documentDirection : number;
  // Ön kaydı yapan kullanıcı; backend boş gelirse userId ile doldurur.
  createdUserId?: string;
  isDeleted: boolean;
  createdDate: Date;
}
