import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal, ViewEncapsulation } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';
import { Common } from '../../../services/common';
import { RoleService } from '../../../services/role-service';
import { IncomingDocumentService } from '../../../services/incomingdocument';
import { AllocationRequestService } from '../../../services/allocationrequest';
import { allocationRequestOperationLabel } from '../../../models/allocationrequest.model';
import { NotificationService } from '../../../services/notification';
import { NotificationModel, NotificationTypeEnum, NotificationTypeIcons, NotificationTypeTones } from '../../../models/notification.model';

interface DeliveryStats {
  pending: number;
  total: number;
}

// Girişten hemen sonra açılan tek hatırlatma popup'ı. Birden fazla hatırlatma aynı
// anda üst üste açılmasın diye hepsi burada bölüm bölüm toplanır; yalnızca içeriği
// olan bölüm görünür, hiçbiri yoksa popup açılmaz:
//  - Zimmet onayınızı bekleyen evraklar (her kullanıcı), evraklar tek tek listelenir
//  - Teslim alınmayı bekleyen birim evrakları (Birim Evrak Sorumlusu)
//  - Okunmamış bildirimler (talebiniz onaylandı, reddedildi, geri çekildi…)
// Popup her girişte bir kez açılır: login bayrağı bırakır, burada okunup silinir.
@Component({
  selector: 'app-login-reminder',
  imports: [DatePipe],
  templateUrl: './login-reminder.html',
  styleUrl: './login-reminder.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginReminder implements OnInit {
  static readonly LOGIN_FLAG = 'loginReminderPopup';
  private static readonly APPROVAL_PREVIEW = 5;

  private readonly common = inject(Common);
  private readonly roleService = inject(RoleService);
  private readonly incomingDocumentService = inject(IncomingDocumentService);
  private readonly allocationRequests = inject(AllocationRequestService);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);

  readonly visible = signal(false);
  readonly user = computed(() => this.common.user());
  readonly operationLabel = allocationRequestOperationLabel;

  // Zimmet onayları: ortak listeden (onaylandıkça zil ve menü rozetiyle birlikte güncellenir)
  readonly approvals = this.allocationRequests.pendingForMe;
  readonly approvalPreview = computed(() => this.approvals().slice(0, LoginReminder.APPROVAL_PREVIEW));
  readonly approvalMore = computed(() => this.approvals().length - this.approvalPreview().length);

  // Birim teslim bekleyenler: Birim Gelen Evrakları ekranındaki "Teslim Alınmayı Bekleyenler" süzgeciyle aynı sayım
  readonly delivery = signal<DeliveryStats | null>(null);
  readonly deliveryPercent = computed(() => {
    const d = this.delivery();
    return d?.total ? Math.round((d.pending / d.total) * 100) : 0;
  });

  // Okunmamış bildirimler (onaylandı, reddedildi, geri çekildi…); onay talebi bildirimleri hariç
  readonly notifications = this.notificationService.unreadVisible;
  readonly notificationPreview = computed(() => this.notifications().slice(0, LoginReminder.NOTIFICATION_PREVIEW));
  readonly notificationMore = computed(() => this.notifications().length - this.notificationPreview().length);
  private static readonly NOTIFICATION_PREVIEW = 5;

  readonly hasApprovals = computed(() => this.approvals().length > 0);
  readonly hasDelivery = computed(() => (this.delivery()?.pending ?? 0) > 0);
  readonly hasNotifications = computed(() => this.notifications().length > 0);
  readonly sectionCount = computed(() =>
    [this.hasApprovals(), this.hasDelivery(), this.hasNotifications()].filter(Boolean).length);

  readonly title = computed(() => {
    if (this.sectionCount() > 1) return 'Bekleyen İşleriniz';
    if (this.hasApprovals()) return 'Zimmet Onayınızı Bekleyen Evraklar';
    if (this.hasDelivery()) return 'Teslim Alınmayı Bekleyen Evraklar';
    return 'Okunmamış Bildirimleriniz';
  });

  notificationIcon(n: NotificationModel): string {
    return NotificationTypeIcons[n.type as NotificationTypeEnum] ?? 'notifications';
  }

  notificationTone(n: NotificationModel): string {
    return NotificationTypeTones[n.type as NotificationTypeEnum] ?? 'is-muted';
  }

  ngOnInit(): void {
    const userId = this.user()?.id;
    if (!userId || !LoginReminder.consumeLoginFlag()) return;

    const departmentId = this.user()?.departmentId;
    const delivery$ = departmentId && this.roleService.hasBirimEvrakRole()
      ? this.incomingDocumentService.getAllIncomingDocuments(departmentId).pipe(
          map(docs => {
            const list = (docs ?? []).filter(d => !d.isDeleted);
            return { pending: list.filter(d => d.status !== 3).length, total: list.length };
          }),
          catchError(err => {
            console.error('Teslim bekleyen evraklar alınamadı:', err);
            return of(null);
          }))
      : of(null);

    // İki kaynak da gelince tek seferde karar verilir; böylece popup içerik eklenerek büyümez
    forkJoin({
      approvals: this.allocationRequests.refreshPendingForMe(userId),
      notifications: this.notificationService.refreshUnread(userId),
      delivery: delivery$
    }).subscribe(({ approvals, delivery }) => {
      this.delivery.set(delivery);
      if (approvals.length > 0 || (delivery?.pending ?? 0) > 0 || this.hasNotifications()) this.visible.set(true);
    });
  }

  private static consumeLoginFlag(): boolean {
    try {
      if (sessionStorage.getItem(LoginReminder.LOGIN_FLAG) !== '1') return false;
      sessionStorage.removeItem(LoginReminder.LOGIN_FLAG);
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    this.visible.set(false);
  }

  goToApprovals(): void {
    this.visible.set(false);
    this.router.navigate(['/zimmet-onaylari']);
  }

  goToNotifications(): void {
    this.visible.set(false);
    this.router.navigate(['/zimmet-onaylari'], { queryParams: { sekme: 'bildirimler' } });
  }

  goToPendingDocuments(): void {
    this.visible.set(false);
    this.router.navigate(['/incomingDepartmentDocument'], { queryParams: { filtre: 'teslim-bekleyen' } });
  }
}
