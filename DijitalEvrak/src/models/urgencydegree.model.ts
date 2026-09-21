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

// Liste görünümünde tam metin yerine baş harfli yuvarlak rozet gösterilirken kullanılır.
export const UrgencyDegreeInitials: Record<UrgencyDegreeEnum, string> = {
  [UrgencyDegreeEnum.Normal]: 'N',
  [UrgencyDegreeEnum.Urgent]: 'A',
  [UrgencyDegreeEnum.VeryUrgent]: 'Ç',
  [UrgencyDegreeEnum.Lightning]: 'Y',
  [UrgencyDegreeEnum.Dated]: 'G',
  [UrgencyDegreeEnum.UrgentTimeLimited]: 'İ'
};

// "degree-tier-N" sınıfları styles.css'te tanımlıdır (düşükten yükseğe premium gradient rozet paleti).
export const UrgencyDegreeBadgeClass: Record<UrgencyDegreeEnum, string> = {
  [UrgencyDegreeEnum.Normal]: 'degree-tier-1',
  [UrgencyDegreeEnum.Dated]: 'degree-tier-2',
  [UrgencyDegreeEnum.Urgent]: 'degree-tier-3',
  [UrgencyDegreeEnum.VeryUrgent]: 'degree-tier-4',
  [UrgencyDegreeEnum.Lightning]: 'degree-tier-5',
  [UrgencyDegreeEnum.UrgentTimeLimited]: 'degree-tier-6'
};
