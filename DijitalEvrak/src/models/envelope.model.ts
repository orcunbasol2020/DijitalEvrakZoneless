export enum EnvelopeStatus {
  Yeni = 1,
  // Zarf, Giden Evrak birimine teslim edildi; dış kuruma henüz çıkmadı.
  EvrakBirimde = 2,
  TeslimEdildi = 3
}

export const EnvelopeStatusLabels: Record<EnvelopeStatus, string> = {
  [EnvelopeStatus.Yeni]: 'Yeni Kayıt',
  [EnvelopeStatus.EvrakBirimde]: 'Evrak Birimde',
  [EnvelopeStatus.TeslimEdildi]: 'Teslim Edildi'
};

// "envelope-status-*" sınıfları styles.css'te tanımlıdır; Zarflar listesindeki durum rozeti için.
export const EnvelopeStatusBadgeClass: Record<EnvelopeStatus, string> = {
  [EnvelopeStatus.Yeni]: 'envelope-status-yeni',
  [EnvelopeStatus.EvrakBirimde]: 'envelope-status-birimde',
  [EnvelopeStatus.TeslimEdildi]: 'envelope-status-teslim'
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
