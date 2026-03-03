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
}