// Zimmet (DocumentAllocations / OutgoingDocumentAllocations) kayıtlarındaki
// status alanı; backend'deki sayısal enum ile birebir.
export enum AllocationStatusEnum {
  IlkKayit = 1,
  Devir = 2,
  Teslim = 3,
  Arsiv = 4,
  TeslimAlindi = 5
}

export const AllocationStatusLabels: Record<AllocationStatusEnum, string> = {
  // Kullanıcı isteğiyle (2026-09-26) ekranda "Ön Kayıt" olarak gösterilir; enum üyesi değişmedi.
  [AllocationStatusEnum.IlkKayit]: 'Ön Kayıt',
  [AllocationStatusEnum.Devir]: 'Devir',
  [AllocationStatusEnum.Teslim]: 'Teslim Edildi',
  [AllocationStatusEnum.Arsiv]: 'Arşiv',
  [AllocationStatusEnum.TeslimAlindi]: 'Teslim Alındı'
};
