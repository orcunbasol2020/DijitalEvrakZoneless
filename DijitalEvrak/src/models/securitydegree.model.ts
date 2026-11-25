export enum SecurityDegreeEnum {
  Unclassified = 1,   // Tasnif Dışı
  Special = 2,         // Özel
  ServiceUseOnly = 3,  // Hizmete Özel
  PersonalUseOnly = 4, // Kişiye Özel
  Confidential = 5,    // Gizli
  TopSecret = 6,       // Çok Gizli
  Crypto = 7           // Kripto
}

export const SecurityDegreeLabels: Record<SecurityDegreeEnum, string> = {
  [SecurityDegreeEnum.Unclassified]: 'Tasnif Dışı',
  [SecurityDegreeEnum.Special]: 'Özel',
  [SecurityDegreeEnum.ServiceUseOnly]: 'Hizmete Özel',
  [SecurityDegreeEnum.PersonalUseOnly]: 'Kişiye Özel',
  [SecurityDegreeEnum.Confidential]: 'Gizli',
  [SecurityDegreeEnum.TopSecret]: 'Çok Gizli',
  [SecurityDegreeEnum.Crypto]: 'Kripto'
};

// Liste rozetinde gösterilen baş harf. Kişiye Özel ve Kripto ikisi de K: rozet rengi ve title'daki tam ad ayırır.
export const SecurityDegreeInitials: Record<SecurityDegreeEnum, string> = {
  [SecurityDegreeEnum.Unclassified]: 'T',
  [SecurityDegreeEnum.Special]: 'Ö',
  [SecurityDegreeEnum.ServiceUseOnly]: 'H',
  [SecurityDegreeEnum.PersonalUseOnly]: 'K',
  [SecurityDegreeEnum.Confidential]: 'G',
  [SecurityDegreeEnum.TopSecret]: 'Ç',
  [SecurityDegreeEnum.Crypto]: 'K'
};

// "degree-tier-N" sınıfları styles.css'te tanımlıdır (düşükten yükseğe premium gradient rozet paleti).
export const SecurityDegreeBadgeClass: Record<SecurityDegreeEnum, string> = {
  [SecurityDegreeEnum.Unclassified]: 'degree-tier-1',
  [SecurityDegreeEnum.Special]: 'degree-tier-2',
  [SecurityDegreeEnum.ServiceUseOnly]: 'degree-tier-3',
  [SecurityDegreeEnum.PersonalUseOnly]: 'degree-tier-4',
  [SecurityDegreeEnum.Confidential]: 'degree-tier-5',
  [SecurityDegreeEnum.TopSecret]: 'degree-tier-6',
  [SecurityDegreeEnum.Crypto]: 'degree-tier-7'
};

// Liste görünümünde tam metin yerine ikon gösterilirken kullanılır (Material Symbols).
export const SecurityDegreeIcons: Record<SecurityDegreeEnum, string> = {
  [SecurityDegreeEnum.Unclassified]: 'public',
  [SecurityDegreeEnum.Special]: 'star',
  [SecurityDegreeEnum.ServiceUseOnly]: 'work',
  [SecurityDegreeEnum.PersonalUseOnly]: 'person',
  [SecurityDegreeEnum.Confidential]: 'lock',
  [SecurityDegreeEnum.TopSecret]: 'gpp_maybe',
  [SecurityDegreeEnum.Crypto]: 'key'
};
