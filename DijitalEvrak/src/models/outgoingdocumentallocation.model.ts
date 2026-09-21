import { AllocationStatusEnum } from './allocationstatus.model';

export interface OutgoingDocumentAllocationModel {
  id: string;                     // Allocation kaydı ID (Guid)
  outgoingDocumentId: string;     // Giden evrak ID (Guid)
  userId: string;                 // Teslim alan kişi ID (Guid)
  fullName: string;               // Teslim alan kişi Ad Soyad, backend'ten geliyor
  createdUserId: string;          // Teslim eden kullanıcı ID (Guid)
  createdFullName: string;        // Teslim eden kullanıcı Ad Soyad, backend'ten geliyor
  status: AllocationStatusEnum;   // Allocation durumu (1 İlk Kayıt, 2 Devir, 3 Teslim, 4 Arşiv)
  isActive: boolean;              // Aktif allocation mı
  createdDate: string;            // Oluşturulma tarihi
  updateDate?: string;            // Güncellenme tarihi (opsiyonel)
  isDeleted: boolean;             // Silinmiş mi

  wetSignedDocumentFileName?: string;          // Yüklenen ıslak imzalı belgenin orijinal adı
  wetSignedDocumentUploadDate?: string;        // Islak imzalı belgenin yüklenme tarihi
  wetSignedDocumentUploadedByFullName?: string; // Islak imzalı belgeyi yükleyen kişi Ad Soyad
  hasWetSignedDocument?: boolean;              // Islak imzalı belge yüklenmiş mi
}
