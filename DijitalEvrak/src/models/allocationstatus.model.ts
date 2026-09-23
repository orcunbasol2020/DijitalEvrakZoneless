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
  [AllocationStatusEnum.IlkKayit]: 'İlk Kayıt',
  [AllocationStatusEnum.Devir]: 'Devir',
  [AllocationStatusEnum.Teslim]: 'Teslim Edildi',
  [AllocationStatusEnum.Arsiv]: 'Arşiv',
  [AllocationStatusEnum.TeslimAlindi]: 'Teslim Alındı'
};
