export enum DocumentTypeEnum {
  Yazi = 1,
  ServisNotu = 2,
  OlurBelgesi = 3,
  MakamOluru = 4,
  Genelge = 5,
  EYazi = 6,
  Nota = 7,
  GenelYazi = 8,
  NatoHizmeteOzelYazi = 9,
  Mektup = 10,
  ENota = 11,
  NatoTasnifDisiYazi = 12,
  NatoHizmeteOzelEYazi = 13,
  NatoTasnifDisiEYazi = 14,
  DosyaNotu = 15,
  EpostaDokuman = 16,
  HizmetOluru = 17
}

export const DocumentTypeLabels: Record<DocumentTypeEnum, string> = {
  [DocumentTypeEnum.Yazi]: 'Yazı',
  [DocumentTypeEnum.ServisNotu]: 'Servis Notu',
  [DocumentTypeEnum.OlurBelgesi]: 'Olur Belgesi',
  [DocumentTypeEnum.MakamOluru]: 'Makam Oluru',
  [DocumentTypeEnum.Genelge]: 'Genelge',
  [DocumentTypeEnum.EYazi]: 'e-Yazı',
  [DocumentTypeEnum.Nota]: 'Nota',
  [DocumentTypeEnum.GenelYazi]: 'Genel Yazı',
  [DocumentTypeEnum.NatoHizmeteOzelYazi]: 'Nato Hizmete Özel Yazı',
  [DocumentTypeEnum.Mektup]: 'Mektup',
  [DocumentTypeEnum.ENota]: 'e-Nota',
  [DocumentTypeEnum.NatoTasnifDisiYazi]: 'Nato Tasnif Dışı Yazı',
  [DocumentTypeEnum.NatoHizmeteOzelEYazi]: 'Nato Hizmete Özel e-Yazı',
  [DocumentTypeEnum.NatoTasnifDisiEYazi]: 'Nato Tasnif Dışı e-Yazı',
  [DocumentTypeEnum.DosyaNotu]: 'Dosya Notu',
  [DocumentTypeEnum.EpostaDokuman]: 'Eposta Doküman',
  [DocumentTypeEnum.HizmetOluru]: 'Hizmet Oluru'
};
