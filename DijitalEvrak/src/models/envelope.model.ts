export enum EnvelopeStatus {
  Yeni = 1,
  // Zarf, Giden Evrak birimine teslim edildi; dış kuruma henüz çıkmadı.
  EvrakBirimde = 2,
  TeslimEdildi = 3,
  // Zarf, kurum içinde başka bir kullanıcıya zimmetlendi (Zimmetle sekmesi).
  ZimmetDevri = 4
}

// Zimmet ekranlarındaki mod seçimi (Teslim Al / Zimmetle / Teslim Et) sonrası
// zarfın alacağı durum:
//   Teslim Al  -> Evrak Birimde
//   Zimmetle   -> Zimmet Devri
//   Teslim Et  -> Teslim Edildi
export function envelopeStatusForZimmetMode(mode: 'self' | 'internal' | 'external'): EnvelopeStatus {
  switch (mode) {
    case 'external': return EnvelopeStatus.TeslimEdildi;
    case 'internal': return EnvelopeStatus.ZimmetDevri;
    default: return EnvelopeStatus.EvrakBirimde;
  }
}

export const EnvelopeStatusLabels: Record<EnvelopeStatus, string> = {
  [EnvelopeStatus.Yeni]: 'Yeni Kayıt',
  [EnvelopeStatus.EvrakBirimde]: 'Evrak Birimde',
  [EnvelopeStatus.TeslimEdildi]: 'Teslim Edildi',
  [EnvelopeStatus.ZimmetDevri]: 'Zimmet Devri'
};

// "envelope-status-*" sınıfları styles.css'te tanımlıdır; Zarflar listesindeki durum rozeti için.
export const EnvelopeStatusBadgeClass: Record<EnvelopeStatus, string> = {
  [EnvelopeStatus.Yeni]: 'envelope-status-yeni',
  [EnvelopeStatus.EvrakBirimde]: 'envelope-status-birimde',
  [EnvelopeStatus.TeslimEdildi]: 'envelope-status-teslim',
  [EnvelopeStatus.ZimmetDevri]: 'envelope-status-devir'
};

// Zarflar listesindeki durum rozetinde gösterilen Material Symbols ikonu.
export const EnvelopeStatusIcon: Record<EnvelopeStatus, string> = {
  [EnvelopeStatus.Yeni]: 'mark_email_unread',
  [EnvelopeStatus.EvrakBirimde]: 'inventory_2',
  [EnvelopeStatus.TeslimEdildi]: 'task_alt',
  [EnvelopeStatus.ZimmetDevri]: 'swap_horiz'
};

export interface EnvelopeModel {
  id: string;
  envelopeNo: string;
  createdByUserId: string;
  externalInstitutionId?: string;
  externalInstitutionName?: string
  departmentId?: string;
  unitName?: string;
  address?: string;
  documentCount:number;
  createdDate?: string;
  status?: EnvelopeStatus;
}
