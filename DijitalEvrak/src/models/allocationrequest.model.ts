import { AllocationStatusEnum } from './allocationstatus.model';

// Gelen evrak zimmet onay talebi (api/DocumentAllocationRequests). Kurum içi başka bir
// kullanıcıya Devir / Teslim yapıldığında zimmet hemen geçmez; alıcı onaylayana kadar
// evrak devredende kalır ve bu talep açılır.
export interface AllocationRequestModel {
  id: string;
  incomingDocumentId: string;
  orginalNo?: string | null;
  qrCode?: string | null;
  documentName?: string | null;
  subject?: string | null;
  documentDate?: string | null;

  fromUserId?: string | null;
  fromUserFullName: string;
  toUserId: string;
  toUserFullName: string;
  requestedByUserId: string;
  requestedByFullName: string;

  // Talep edilen işlem: 2 (Devir) / 3 (Teslim)
  requestedAllocationStatus: AllocationStatusEnum;
  status: AllocationRequestStatusEnum;

  responseNote?: string | null;
  respondedDate?: string | null;
  resultAllocationId?: string | null;
  reminderCount: number;
  lastReminderDate?: string | null;
  createdDate: string;

  // Devredenin beyanı: talep açılırken evrakta kayıtlı sayfa sayısı ve ek bilgisi
  pageCount?: number | null;
  hasAttachment?: boolean | null;
  attachmentDescription?: string | null;
  // true: alıcı şerh koyarak kabul etti; şerh metni responseNote alanında
  hasDiscrepancy?: boolean | null;
}

export enum AllocationRequestStatusEnum {
  Beklemede = 1,
  Onaylandi = 2,
  Reddedildi = 3,
  IptalEdildi = 4,
  Gecersiz = 5
}

// Onay / red / iptal sonucunda data.result alanı. Backend hata durumlarında da
// HTTP 200 döndürdüğü için sonuç message metnine göre değil bu koda göre okunur.
export enum AllocationRequestActionResultEnum {
  Basarili = 1,
  Gecersiz = 2,
  Cakisma = 3,
  Bulunamadi = 4,
  Yetkisiz = 5,
  ZatenSonuclanmis = 6,
  GecersizKullanici = 7
}

export const AllocationRequestActionResultLabels: Record<AllocationRequestActionResultEnum, string> = {
  [AllocationRequestActionResultEnum.Basarili]: 'İşlendi',
  [AllocationRequestActionResultEnum.Gecersiz]: 'Talep beklerken evrakın zimmeti değişti; talep kapandı',
  [AllocationRequestActionResultEnum.Cakisma]: 'Talep aynı anda başka bir işlemle sonuçlandı',
  [AllocationRequestActionResultEnum.Bulunamadi]: 'Talep bulunamadı',
  [AllocationRequestActionResultEnum.Yetkisiz]: 'Bu talep üzerinde işlem yetkiniz yok',
  [AllocationRequestActionResultEnum.ZatenSonuclanmis]: 'Talep zaten sonuçlanmış',
  [AllocationRequestActionResultEnum.GecersizKullanici]: 'Kullanıcı bilgisi geçersiz'
};

export interface AllocationRequestActionResult {
  requestId: string;
  result: AllocationRequestActionResultEnum;
  message: string;
}

export interface MessageResponse<T> {
  message: string;
  data?: T | null;
}

// === EVRAK BİRİMİNDE YERİNDE TESLİM ===
// Alıcı, evrak memurunun ekranında kişisel teslim PIN'ini girerek evrak biriminin açtığı
// bekleyen talepleri onaylar. Kendi ekranından onaylama yolu aynen kalır.

export enum DeliveryPinCheckResultEnum {
  Dogru = 1,
  Tanimsiz = 2,
  Yanlis = 3,
  Kilitli = 4
}

export interface DeliveryPinStatus {
  hasPin: boolean;
  updatedDate?: string | null;
  lockedUntilUtc?: string | null;
}

export interface InPersonPending {
  receiverUserId: string;
  receiverFullName: string;
  receiverDepartmentName?: string | null;
  hasPin: boolean;
  lockedUntilUtc?: string | null;
  requests: AllocationRequestModel[];
}

export interface InPersonApproveResult {
  pinResult: DeliveryPinCheckResultEnum;
  remainingAttempts?: number | null;
  lockedUntilUtc?: string | null;
  approvedCount: number;
  results: AllocationRequestActionResult[];
}

// Backend kuralıyla aynı (DeliveryPinRules): 4-6 rakam
export const DELIVERY_PIN_MIN_LENGTH = 4;
export const DELIVERY_PIN_MAX_LENGTH = 6;

// Talep edilen işlemin ekrandaki adı
export function allocationRequestOperationLabel(status: AllocationStatusEnum): string {
  return Number(status) === AllocationStatusEnum.Teslim ? 'Teslim' : 'Devir';
}
