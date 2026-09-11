export interface OutgoingDocumentAllocationModel {
  id: string;                     // Allocation kaydı ID (Guid)
  outgoingDocumentId: string;     // Giden evrak ID (Guid)
  userId: string;                 // Teslim alan kişi ID (Guid)
  fullName: string;               // Teslim alan kişi Ad Soyad, backend'ten geliyor
  createdUserId: string;          // Teslim eden kullanıcı ID (Guid)
  createdFullName: string;        // Teslim eden kullanıcı Ad Soyad, backend'ten geliyor
  status: number;                 // Allocation durumu
  isActive: boolean;              // Aktif allocation mı
  createdDate: string;            // Oluşturulma tarihi
  updateDate?: string;            // Güncellenme tarihi (opsiyonel)
  isDeleted: boolean;             // Silinmiş mi
}
