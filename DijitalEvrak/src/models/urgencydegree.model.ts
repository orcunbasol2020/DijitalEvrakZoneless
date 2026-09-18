export enum UrgencyDegreeEnum {
  Normal = 10005001,
  Urgent = 10005002,           // Acele
  VeryUrgent = 10005003,       // Çok Acele
  Lightning = 10005004,        // Yıldırım
  Dated = 10005005,            // Günlüdür
  UrgentTimeLimited = 10005006 // İvedi Süreli
}

export const UrgencyDegreeLabels: Record<UrgencyDegreeEnum, string> = {
  [UrgencyDegreeEnum.Normal]: 'Normal',
  [UrgencyDegreeEnum.Urgent]: 'Acele',
  [UrgencyDegreeEnum.VeryUrgent]: 'Çok Acele',
  [UrgencyDegreeEnum.Lightning]: 'Yıldırım',
  [UrgencyDegreeEnum.Dated]: 'Günlüdür',
  [UrgencyDegreeEnum.UrgentTimeLimited]: 'İvedi Süreli'
};
