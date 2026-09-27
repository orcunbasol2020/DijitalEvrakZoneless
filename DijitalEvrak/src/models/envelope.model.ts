export enum EnvelopeStatus {
  Yeni = 1,
  // Zarf, Giden Evrak birimine teslim edildi; dış kuruma henüz çıkmadı.
  EvrakBirimde = 2,
  TeslimEdildi = 3,
  // Zarf, kurum içinde başka bir kullanıcıya zimmetlendi (Zimmetle sekmesi).
  ZimmetDevri = 4,
  // Zarf kargo / posta ile gönderildi (Kargoya Ver sekmesi). Kargonun kendi
  // durumu (Yolda, Teslim Edildi, İade) OutgoingDocumentShipments kaydında izlenir.
  KargoyaVerildi = 5
}

// Zarf birimden çıktı mı: elden teslim edildi ya da kargoya verildi. Bu iki
// durumdaki zarfa evrak eklenmez, yeniden zimmetlenmez ve silinmez.
// Zarf ya elden teslim edilir ya kargolanır, ikisi birden olamaz.
export function isEnvelopeClosed(status: EnvelopeStatus | null | undefined): boolean {
  return status === EnvelopeStatus.TeslimEdildi || status === EnvelopeStatus.KargoyaVerildi;
}

// Zimmet ekranlarındaki mod seçimi (Teslim Al / Zimmetle / Teslim Et / Kargoya Ver)
// sonrası zarfın alacağı durum:
//   Teslim Al   -> Evrak Birimde
//   Zimmetle    -> Zimmet Devri
//   Teslim Et   -> Teslim Edildi
//   Kargoya Ver -> Kargoya Verildi (bu durumu backend kargo Create isteğindeki
//                  envelopeId ile kendisi yazar; UpdateStatus ile gönderilmez)
export function envelopeStatusForZimmetMode(mode: 'self' | 'internal' | 'external' | 'cargo'): EnvelopeStatus {
  switch (mode) {
    case 'external': return EnvelopeStatus.TeslimEdildi;
    case 'cargo': return EnvelopeStatus.KargoyaVerildi;
    case 'internal': return EnvelopeStatus.ZimmetDevri;
    default: return EnvelopeStatus.EvrakBirimde;
  }
}

export const EnvelopeStatusLabels: Record<EnvelopeStatus, string> = {
  [EnvelopeStatus.Yeni]: 'Yeni Kayıt',
  [EnvelopeStatus.EvrakBirimde]: 'Evrak Birimde',
  [EnvelopeStatus.TeslimEdildi]: 'Teslim Edildi',
  [EnvelopeStatus.ZimmetDevri]: 'Zimmet Devri',
  [EnvelopeStatus.KargoyaVerildi]: 'Kargoya Verildi'
};

// "envelope-status-*" sınıfları styles.css'te tanımlıdır; Zarflar listesindeki durum rozeti için.
export const EnvelopeStatusBadgeClass: Record<EnvelopeStatus, string> = {
  [EnvelopeStatus.Yeni]: 'envelope-status-yeni',
  [EnvelopeStatus.EvrakBirimde]: 'envelope-status-birimde',
  [EnvelopeStatus.TeslimEdildi]: 'envelope-status-teslim',
  [EnvelopeStatus.ZimmetDevri]: 'envelope-status-devir',
  [EnvelopeStatus.KargoyaVerildi]: 'envelope-status-kargo'
};

// Zarflar listesindeki durum rozetinde gösterilen Material Symbols ikonu.
export const EnvelopeStatusIcon: Record<EnvelopeStatus, string> = {
  [EnvelopeStatus.Yeni]: 'mark_email_unread',
  [EnvelopeStatus.EvrakBirimde]: 'inventory_2',
  [EnvelopeStatus.TeslimEdildi]: 'task_alt',
  [EnvelopeStatus.ZimmetDevri]: 'swap_horiz',
  [EnvelopeStatus.KargoyaVerildi]: 'local_shipping'
};

export interface EnvelopeModel {
  id: string;
  envelopeNo: string;
  createdByUserId: string;
  // Gideceği yer: dış kurum / yabancı misyon ise externalInstitutionId,
  // kurum içi birim ise targetDepartmentId dolu gelir (ikisi birlikte dolu olmaz).
  externalInstitutionId?: string | null;
  externalInstitutionName?: string;
  targetDepartmentId?: string | null;
  targetDepartmentName?: string;
  // Gönderen (zarfı oluşturan) birim; Zarflar listesi filtresi ve "Ekleyen" sütunu buna bakar.
  departmentId?: string;
  unitName?: string;
  address?: string;
  documentCount:number;
  createdDate?: string;
  status?: EnvelopeStatus;
}

// Zarf etiketinde "Gideceği Yer" üç gruba ayrılır. Yabancı misyon ve dış kurum
// aynı ExternalInstitutions tablosundan gelir (type 1 = Misyon, type 2 = Kurum);
// kurum içi birimler Departments tablosundan gelir.
export type EnvelopeTargetKind = 'department' | 'mission' | 'external';

export const EnvelopeTargetKindLabels: Record<EnvelopeTargetKind, string> = {
  department: 'Kurum İçi Birim',
  mission: 'Yabancı Misyon',
  external: 'Dış Kurum'
};

export const EnvelopeTargetKindIcons: Record<EnvelopeTargetKind, string> = {
  department: 'apartment',
  mission: 'flag',
  external: 'domain'
};

// Zarfın hedef türü: birim id'si doluysa kurum içi; değilse kurum kaydının
// türüne bakılır (tür bilinmiyorsa dış kurum varsayılır).
export function envelopeTargetKind(
  env: Pick<EnvelopeModel, 'targetDepartmentId' | 'externalInstitutionId'> | null | undefined,
  institutionType?: number | null
): EnvelopeTargetKind {
  if (env?.targetDepartmentId) return 'department';
  return institutionType === 1 ? 'mission' : 'external';
}

// Gideceği yerin adı: önce API'nin join'lediği ad, yoksa verilen listelerden çözülür.
export function envelopeTargetName(
  env: Pick<EnvelopeModel, 'targetDepartmentId' | 'targetDepartmentName' | 'externalInstitutionId' | 'externalInstitutionName'> | null | undefined,
  departments: { id: string; name: string }[] = [],
  institutions: { id: string; name: string }[] = []
): string {
  if (!env) return '';
  if (env.targetDepartmentId) {
    return env.targetDepartmentName
      || departments.find(d => d.id?.toLowerCase() === env.targetDepartmentId!.toLowerCase())?.name
      || '';
  }
  return env.externalInstitutionName
    || (env.externalInstitutionId
      ? institutions.find(i => i.id?.toLowerCase() === env.externalInstitutionId!.toLowerCase())?.name
      : '')
    || '';
}
