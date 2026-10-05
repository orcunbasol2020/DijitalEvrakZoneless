// Uygulama içi bildirim (api/Notifications). Şimdilik tümü gelen evrak zimmet onayıyla ilgili.
export interface NotificationModel {
  id: string;
  type: NotificationTypeEnum;
  title: string;
  message: string;
  // Zimmet talebinin Id'si; birden fazla evrağı kapsayan toplu bildirimde boş
  relatedEntityId?: string | null;
  incomingDocumentId?: string | null;
  isRead: boolean;
  readDate?: string | null;
  createdDate: string;
}

// GetByUserId sayfalı kullanımı (page / pageSize gönderilince). unreadCount arama ve tür
// filtresinden bağımsızdır; onay talebi / hatırlatma (tür 1, 2) hariç tüm okunmamışları sayar.
export interface NotificationPageModel {
  items: NotificationModel[];
  totalCount: number;
  unreadCount: number;
  page: number;
  pageSize: number;
}

export enum NotificationTypeEnum {
  ZimmetOnayTalebi = 1,
  ZimmetOnayHatirlatma = 2,
  ZimmetOnaylandi = 3,
  ZimmetReddedildi = 4,
  ZimmetTalebiIptal = 5,
  ZimmetOnayGecikme = 6,
  ZimmetTalebiGecersiz = 7,
  ZimmetSerhliKabul = 8
}

// Tür 1 ve 2 "onayınızı bekleyen evraklar"ı haber verir. Bu evraklar zil menüsünde ve
// girişteki popup'ta zaten tek tek listelendiği için bildirim listelerinde tekrar gösterilmez;
// talep sonuçlanınca backend bu bildirimleri kendisi okundu sayar.
export const APPROVAL_REQUEST_NOTIFICATION_TYPES = [
  NotificationTypeEnum.ZimmetOnayTalebi,
  NotificationTypeEnum.ZimmetOnayHatirlatma
];

export function isApprovalRequestNotification(n: NotificationModel): boolean {
  const type = Number(n.type);
  return type === NotificationTypeEnum.ZimmetOnayTalebi || type === NotificationTypeEnum.ZimmetOnayHatirlatma;
}

export const NotificationTypeIcons: Record<NotificationTypeEnum, string> = {
  [NotificationTypeEnum.ZimmetOnayTalebi]: 'assignment_turned_in',
  [NotificationTypeEnum.ZimmetOnayHatirlatma]: 'notifications_active',
  [NotificationTypeEnum.ZimmetOnaylandi]: 'task_alt',
  [NotificationTypeEnum.ZimmetReddedildi]: 'block',
  [NotificationTypeEnum.ZimmetTalebiIptal]: 'undo',
  [NotificationTypeEnum.ZimmetOnayGecikme]: 'schedule',
  [NotificationTypeEnum.ZimmetTalebiGecersiz]: 'link_off',
  [NotificationTypeEnum.ZimmetSerhliKabul]: 'rule'
};

// Renk tonu (is-*): onay yeşil, red kırmızı, gecikme ve şerhli kabul kehribar, diğerleri mavi / gri
export const NotificationTypeTones: Record<NotificationTypeEnum, string> = {
  [NotificationTypeEnum.ZimmetOnayTalebi]: 'is-info',
  [NotificationTypeEnum.ZimmetOnayHatirlatma]: 'is-info',
  [NotificationTypeEnum.ZimmetOnaylandi]: 'is-ok',
  [NotificationTypeEnum.ZimmetReddedildi]: 'is-fail',
  [NotificationTypeEnum.ZimmetTalebiIptal]: 'is-muted',
  [NotificationTypeEnum.ZimmetOnayGecikme]: 'is-warn',
  [NotificationTypeEnum.ZimmetTalebiGecersiz]: 'is-muted',
  // Kabul edildi ama şerh var: devredenin dikkatine
  [NotificationTypeEnum.ZimmetSerhliKabul]: 'is-warn'
};
