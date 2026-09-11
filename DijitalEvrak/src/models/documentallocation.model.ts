export interface DocumentAllocationModel {
  id: string;                     // Zimmet kaydı ID (Guid)
  incomingDocumentId: string;     // Evrak ID (Guid)
  userId: string;                 // Kullanıcı ID (Guid)
  fullName: string;               // Kullanıcı Ad Soyad, backend’ten geliyor
  status: number;                 // Zimmet durumu
  isActive: boolean;              // Aktif zimmet mi
  isPreRegistered: boolean;       // Ön kayıt bilgisi
  isAllocated: boolean;           // Zimmetleme yapıldı mı
  createdDate: string;            // Oluşturulma tarihi
  updateDate?: string;            // Güncellenme tarihi (opsiyonel)
  isDeleted: boolean;             // Silinmiş mi
  // GetActiveByUserId gibi uçlarda backend'in evrak bilgisiyle birlikte
  // döndürdüğü (varsayılan) alanlar
  qrCode?: string;
  documentName?: string;
  documentDate?: string;
  // Backend henüz bu alanı göndermiyor; Atlas entegrasyonu tamamlanınca
  // zimmetin hangi sistemde yapıldığını taşıyacak. Gelmediği sürece
  // "EvrakTakip" varsayılır (bkz. allocation-card.ts).
  source?: 'EvrakTakip' | 'Atlas';
}