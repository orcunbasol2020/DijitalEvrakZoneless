export enum SecurityDegreeEnum {
  Unclassified = 1,   // Tasnif Dışı
  Special = 2,         // Özel
  ServiceUseOnly = 3,  // Hizmete Özel
  PersonalUseOnly = 4, // Kişiye Özel
  Confidential = 5,    // Gizli
  TopSecret = 6        // Çok Gizli
}

export const SecurityDegreeLabels: Record<SecurityDegreeEnum, string> = {
  [SecurityDegreeEnum.Unclassified]: 'Tasnif Dışı',
  [SecurityDegreeEnum.Special]: 'Özel',
  [SecurityDegreeEnum.ServiceUseOnly]: 'Hizmete Özel',
  [SecurityDegreeEnum.PersonalUseOnly]: 'Kişiye Özel',
  [SecurityDegreeEnum.Confidential]: 'Gizli',
  [SecurityDegreeEnum.TopSecret]: 'Çok Gizli'
};

export const SecurityDegreeBadgeClass: Record<SecurityDegreeEnum, string> = {
  [SecurityDegreeEnum.Unclassified]: 'bg-secondary-subtle text-secondary border border-secondary-subtle',
  [SecurityDegreeEnum.Special]: 'bg-info-subtle text-info border border-info-subtle',
  [SecurityDegreeEnum.ServiceUseOnly]: 'bg-warning-subtle text-warning border border-warning-subtle',
  [SecurityDegreeEnum.PersonalUseOnly]: 'bg-warning text-dark',
  [SecurityDegreeEnum.Confidential]: 'bg-danger',
  [SecurityDegreeEnum.TopSecret]: 'bg-dark'
};
