export interface DocumentTransactionModel {
  id: string;
  documentId: string;
  transactionType: number;
  userId: string;
  isActive: boolean;
  incomingDocument?: any;
  isDeleted: boolean;
  createdDate: string;
  updateDate?: string;
  transactionTypeName: string;
  userFullName: string;
  createdUserFullName : string;
  // Backend henüz bu alanı göndermiyor; Atlas entegrasyonu tamamlanınca
  // her işlemin hangi sistemde yapıldığını taşıyacak. Gelmediği sürece
  // "EvrakTakip" varsayılır (bkz. transaction-card.ts).
  source?: 'EvrakTakip' | 'Atlas';
}