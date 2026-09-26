import { AllocationStatusEnum } from './allocationstatus.model';

export interface DocumentAllocationModel {
  id: string;                     // Zimmet kaydı ID (Guid)
  incomingDocumentId: string;     // Evrak ID (Guid)
  userId: string;                 // Kullanıcı ID (Guid)
  fullName: string;               // Kullanıcı Ad Soyad, backend’ten geliyor
  status: AllocationStatusEnum;   // Zimmet durumu (1 Ön Kayıt, 2 Devir, 3 Teslim Edildi, 4 Arşiv, 5 Teslim Alındı)
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
  // Zimmetin hangi sistemde yapıldığını taşır. Backend bunu şu an sayısal bir
  // enum olarak gönderiyor (gözlemlenen tek değer: 1 = EvrakTakip); Atlas
  // entegrasyonu ilerledikçe string ('EvrakTakip' | 'Atlas') de gelebilir.
  // allocation-card.ts'teki source getter'ı her iki biçimi de karşılar.
  source?: 'EvrakTakip' | 'Atlas' | number;
}