// Gelen evrakın Atlas'a yayın (aktarım) durumu: evrak üzerindeki submissionStatus alanı
// (backend PublishStatusEnum). Akış durumu (status) ile yayın durumu ayrı tutulur:
// "Yayınla" status'a dokunmaz, submissionStatus'u 2 yapar. 3, 4 ve 5'i Atlas aktarım
// servisi atar; aktarım başarılı olunca release = true ve releaseDate de yazılır.
export enum PublishStatusEnum {
  Yayinlanmadi = 1,
  AktarimSirasinda = 2,
  Aktariliyor = 3,
  Yayinlandi = 4,
  AktarimHatali = 5
}

export const PublishStatusLabels: Record<PublishStatusEnum, string> = {
  [PublishStatusEnum.Yayinlanmadi]: 'Yayınlanmadı',
  [PublishStatusEnum.AktarimSirasinda]: 'Aktarım Sırasında',
  [PublishStatusEnum.Aktariliyor]: 'Aktarılıyor',
  [PublishStatusEnum.Yayinlandi]: 'Yayınlandı',
  [PublishStatusEnum.AktarimHatali]: 'Aktarım Hatalı'
};

// Ayrımdan önce yayın, akış durumuna yazılıyordu (6 Yayınlanma Sırasında, 10 Yayınlandı).
// Veri düzeltmesi çalıştırılana kadar eski kayıtlarda bu değerler görülebilir; yalnızca
// submissionStatus henüz yayına işaret etmiyorsa yedek olarak okunur.
const LEGACY_STATUS_PUBLISHING = 6;
const LEGACY_STATUS_PUBLISHED = 10;

interface PublishFields {
  status?: number | null;
  submissionStatus?: number | null;
  release?: boolean | null;
}

function legacyOnly(doc: PublishFields): boolean {
  return !doc.submissionStatus || doc.submissionStatus === PublishStatusEnum.Yayinlanmadi;
}

/** Atlas'tan başarılı yanıt gelmiş: release == true ya da submissionStatus == 4. */
export function isPublished(doc: PublishFields): boolean {
  if (doc.release === true || doc.submissionStatus === PublishStatusEnum.Yayinlandi) return true;
  return legacyOnly(doc) && doc.status === LEGACY_STATUS_PUBLISHED;
}

/** Yayına gönderildi, sonuç bekleniyor (2 Aktarım Sırasında ya da 3 Aktarılıyor). */
export function isPublishing(doc: PublishFields): boolean {
  if (isPublished(doc)) return false;
  if (doc.submissionStatus === PublishStatusEnum.AktarimSirasinda
    || doc.submissionStatus === PublishStatusEnum.Aktariliyor) return true;
  return legacyOnly(doc) && doc.status === LEGACY_STATUS_PUBLISHING;
}

/**
 * Aktarım kalıcı hata aldı (EYP üretilemedi, Atlas reddetti ya da deneme sınırı doldu);
 * servis yeniden denemez, müdahale gerekir. Geçici hatalarda evrak 2'ye döner, 5 görünmez.
 */
export function isPublishFailed(doc: PublishFields): boolean {
  return !isPublished(doc) && doc.submissionStatus === PublishStatusEnum.AktarimHatali;
}

/** Yayına gönderilmiş mi (submissionStatus >= 2); sonucu ne olursa olsun. */
export function isSentToPublish(doc: PublishFields): boolean {
  return isPublished(doc) || isPublishing(doc) || isPublishFailed(doc);
}

/** Ekranda gösterilecek "Yayın Durumu". */
export function publishStatusOf(doc: PublishFields): PublishStatusEnum {
  if (isPublished(doc)) return PublishStatusEnum.Yayinlandi;
  if (isPublishFailed(doc)) return PublishStatusEnum.AktarimHatali;
  if (isPublishing(doc)) {
    return doc.submissionStatus === PublishStatusEnum.Aktariliyor
      ? PublishStatusEnum.Aktariliyor
      : PublishStatusEnum.AktarimSirasinda;
  }
  return PublishStatusEnum.Yayinlanmadi;
}

export function publishStatusLabel(doc: PublishFields): string {
  return PublishStatusLabels[publishStatusOf(doc)];
}
