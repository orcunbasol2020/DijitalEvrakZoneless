import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal, ViewEncapsulation } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Observable, finalize } from 'rxjs';
import GenericModel from '../../../components/generic-model/generic-model';
import { Common } from '../../services/common';
import { AllocationRequestService } from '../../services/allocationrequest';
import {
  AllocationRequestActionResult,
  AllocationRequestActionResultEnum,
  AllocationRequestActionResultLabels,
  AllocationRequestModel,
  MessageResponse,
  allocationRequestOperationLabel
} from '../../models/allocationrequest.model';
import { AllocationStatusEnum } from '../../models/allocationstatus.model';
import { NotificationService } from '../../services/notification';
import { NotificationModel, NotificationTypeEnum, NotificationTypeIcons, NotificationTypeTones } from '../../models/notification.model';

// Onayımı bekleyenler (alıcı) / gönderdiklerim (devreden veya işlemi yapan)
type ApprovalTab = 'bekleyen' | 'gonderilen' | 'bildirimler';
type NoteAction = 'reject' | 'cancel';

interface FailedRow {
  label: string;
  reason: string;
}

// Zimmet Onayları: kurum içi Devir / Teslim talepleri. Alıcı evrakları tek tek ya da
// toplu onaylar / reddeder; devreden bekleyen taleplerini izler ve geri çeker.
// Onaylanan satır listeden düşer; ayrıca başarı bildirimi gösterilmez.
@Component({
  imports: [GenericModel, CommonModule, FormsModule],
  templateUrl: './zimmet-onaylari.html',
  // Kart iskeleti (st-*), üst kart / arama / boş durum (sp-*) ve liste (zl-*) Zimmetlerim ile ortak
  styleUrls: ['../settings/settings.css', '../support/support.css', '../zimmetlerim/zimmetlerim.css', './zimmet-onaylari.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class ZimmetOnaylari implements OnInit {
  private readonly common = inject(Common);
  private readonly requestService = inject(AllocationRequestService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notificationService = inject(NotificationService);

  readonly operationLabel = allocationRequestOperationLabel;
  readonly Teslim = AllocationStatusEnum.Teslim;

  readonly activeTab = signal<ApprovalTab>('bekleyen');
  readonly searchQuery = signal('');

  // Onayımı bekleyenler ortak listeden gelir (zil ve sol menü rozetiyle aynı)
  readonly incoming = this.requestService.pendingForMe;
  readonly incomingLoading = signal(false);

  readonly sent = signal<AllocationRequestModel[]>([]);
  readonly sentLoading = signal(false);

  readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  readonly processing = signal(false);

  // İşlenemeyen talepler (sonuç kodu 1 dışındakiler) listenin üstünde gösterilir
  readonly failedRows = signal<FailedRow[]>([]);

  // Red / iptal penceresi: isteğe bağlı ortak gerekçe
  readonly noteAction = signal<NoteAction | null>(null);
  readonly noteIds = signal<string[]>([]);
  readonly noteText = signal('');
  static readonly NOTE_MAX = 1000;
  readonly noteMax = ZimmetOnaylari.NOTE_MAX;

  readonly loading = computed(() => {
    const tab = this.activeTab();
    if (tab === 'bekleyen') return this.incomingLoading();
    if (tab === 'gonderilen') return this.sentLoading();
    return this.notificationsLoading();
  });

  readonly currentList = computed<AllocationRequestModel[]>(() => {
    const tab = this.activeTab();
    if (tab === 'bekleyen') return this.incoming();
    if (tab === 'gonderilen') return this.sent();
    return [];
  });

  // ---- Bildirimler sekmesi: tüm bildirimler, okunmamışlar vurgulu ----
  readonly notifications = signal<NotificationModel[]>([]);
  readonly notificationsLoading = signal(false);
  // Zil rozetiyle aynı okunmamış sayısı (onay talebi / hatırlatma hariç)
  readonly unreadCount = computed(() => this.notificationService.unreadVisible().length);
  // Okundu bilgisi ortak listeden okunur; böylece zilde okunan burada da okunmuş görünür
  private readonly unreadIds = computed(() => new Set(this.notificationService.unread().map(n => n.id)));

  readonly filteredNotifications = computed(() => {
    const term = this.searchQuery().trim().toLocaleLowerCase('tr');
    const list = this.notifications();
    if (!term) return list;
    return list.filter(n => [n.title, n.message].some(v => (v ?? '').toLocaleLowerCase('tr').includes(term)));
  });

  isUnread(n: NotificationModel): boolean {
    return !n.isRead && this.unreadIds().has(n.id);
  }

  notificationIcon(n: NotificationModel): string {
    return NotificationTypeIcons[n.type as NotificationTypeEnum] ?? 'notifications';
  }

  notificationTone(n: NotificationModel): string {
    return NotificationTypeTones[n.type as NotificationTypeEnum] ?? 'is-muted';
  }

  openNotification(n: NotificationModel): void {
    const userId = this.userId;
    if (!userId) return;
    // Bildirimler sekmesine yönlendiren türlerde yalnızca okundu işaretlenir
    this.notificationService.open(n, userId);
    this.notifications.update(list => list.map(x => x.id === n.id ? { ...x, isRead: true } : x));
  }

  markAllRead(): void {
    const userId = this.userId;
    if (!userId) return;
    this.notificationService.markAllAsRead(userId).subscribe();
    this.notifications.update(list => list.map(x => ({ ...x, isRead: true })));
  }

  private loadNotifications(): void {
    const userId = this.userId;
    if (!userId) return;
    this.notificationsLoading.set(true);
    this.notificationService.refreshUnread(userId).subscribe();
    this.notificationService.getByUserId(userId, false, ZimmetOnaylari.NOTIFICATION_TAKE)
      .pipe(finalize(() => this.notificationsLoading.set(false)))
      .subscribe({
        next: list => this.notifications.set(list),
        error: err => console.error('Bildirimler alınamadı:', err)
      });
  }

  private static readonly NOTIFICATION_TAKE = 100;

  readonly filteredList = computed(() => {
    const term = this.searchQuery().trim().toLocaleLowerCase('tr');
    const list = this.currentList();
    if (!term) return list;
    return list.filter(r =>
      [r.qrCode, r.orginalNo, r.subject, r.requestedByFullName, r.fromUserFullName, r.toUserFullName]
        .some(v => (v ?? '').toLocaleLowerCase('tr').includes(term)));
  });

  readonly selectedInView = computed(() => {
    const selected = this.selectedIds();
    return this.filteredList().filter(r => selected.has(r.id));
  });

  readonly allInViewSelected = computed(() => {
    const list = this.filteredList();
    return list.length > 0 && this.selectedInView().length === list.length;
  });

  get userId(): string | undefined {
    return this.common.user()?.id;
  }

  // ?sekme=gonderilen|bildirimler: zil menüsünden sayfa açıkken gelinirse de sekme değişir
  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const sekme = params.get('sekme');
      this.setTab(sekme === 'gonderilen' || sekme === 'bildirimler' ? sekme : 'bekleyen');
    });
    this.reload();
  }

  reload(): void {
    this.loadIncoming();
    this.loadSent();
    this.loadNotifications();
  }

  private loadIncoming(): void {
    const userId = this.userId;
    if (!userId) return;
    this.incomingLoading.set(true);
    this.requestService.refreshPendingForMe(userId)
      .pipe(finalize(() => this.incomingLoading.set(false)))
      .subscribe();
  }

  private loadSent(): void {
    const userId = this.userId;
    if (!userId) return;
    this.sentLoading.set(true);
    this.requestService.getSentByUserId(userId, true)
      .pipe(finalize(() => this.sentLoading.set(false)))
      .subscribe({
        next: list => this.sent.set(list),
        error: err => console.error('Gönderilen zimmet talepleri alınamadı:', err)
      });
  }

  setTab(tab: ApprovalTab): void {
    if (this.activeTab() === tab) return;
    this.activeTab.set(tab);
    this.selectedIds.set(new Set());
    this.failedRows.set([]);
  }

  setSearchQuery(value: string): void {
    this.searchQuery.set(value ?? '');
  }

  isSelected(row: AllocationRequestModel): boolean {
    return this.selectedIds().has(row.id);
  }

  toggleRow(row: AllocationRequestModel): void {
    this.selectedIds.update(set => {
      const next = new Set(set);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  }

  toggleAll(): void {
    const all = this.allInViewSelected();
    this.selectedIds.update(set => {
      const next = new Set(set);
      for (const r of this.filteredList()) {
        if (all) next.delete(r.id);
        else next.add(r.id);
      }
      return next;
    });
  }

  docLabel(row: AllocationRequestModel): string {
    return row.qrCode || row.orginalNo || row.documentName || '-';
  }

  // Devreden: talebi açan kişi; zimmet sahibi başkaysa (ör. Yönetici adına işlem) ayrıca gösterilir
  showHolder(row: AllocationRequestModel): boolean {
    return !!row.fromUserFullName && row.fromUserFullName !== row.requestedByFullName;
  }

  // ---- Onay ----
  approve(ids: string[]): void {
    const userId = this.userId;
    if (!userId || !ids.length || this.processing()) return;
    this.run(this.requestService.approveBulk(ids, userId), ids);
  }

  approveSelected(): void {
    this.approve(this.selectedInView().map(r => r.id));
  }

  // ---- Red / iptal: gerekçe penceresi ----
  openNote(action: NoteAction, ids: string[]): void {
    if (!ids.length || this.processing()) return;
    this.noteAction.set(action);
    this.noteIds.set(ids);
    this.noteText.set('');
  }

  openNoteForSelected(action: NoteAction): void {
    this.openNote(action, this.selectedInView().map(r => r.id));
  }

  closeNote(): void {
    if (this.processing()) return;
    this.noteAction.set(null);
    this.noteIds.set([]);
    this.noteText.set('');
  }

  confirmNote(): void {
    const userId = this.userId;
    const action = this.noteAction();
    const ids = this.noteIds();
    if (!userId || !action || !ids.length) return;

    const note = this.noteText().trim().slice(0, ZimmetOnaylari.NOTE_MAX) || null;
    const request$ = action === 'reject'
      ? this.requestService.rejectBulk(ids, userId, note)
      : this.requestService.cancelBulk(ids, userId, note);

    this.run(request$, ids, () => {
      this.noteAction.set(null);
      this.noteIds.set([]);
      this.noteText.set('');
    });
  }

  readonly noteTitle = computed(() => this.noteAction() === 'reject' ? 'Zimmeti Reddet' : 'Talebi Geri Çek');

  readonly noteRows = computed(() => {
    const ids = new Set(this.noteIds());
    return this.currentList().filter(r => ids.has(r.id));
  });

  // Toplu işlem: talep başına sonuç kodu okunur. Başarılı ve zaten kapanmış talepler
  // listeden düşer (liste yeniden çekilir); işlenemeyenler nedenleriyle üstte listelenir.
  private run(
    request$: Observable<MessageResponse<AllocationRequestActionResult[]>>,
    ids: string[],
    onDone?: () => void
  ): void {
    const rowsById = new Map(this.currentList().map(r => [r.id, r]));
    this.processing.set(true);
    this.failedRows.set([]);

    request$.pipe(finalize(() => this.processing.set(false))).subscribe({
      next: res => {
        const results = Array.isArray(res?.data) ? res.data : [];
        const failed: FailedRow[] = [];

        if (!results.length) {
          failed.push({ label: `${ids.length} talep`, reason: res?.message || 'Talepler işlenemedi' });
        }

        for (const r of results) {
          if (Number(r.result) === AllocationRequestActionResultEnum.Basarili) continue;
          const row = rowsById.get(r.requestId);
          failed.push({
            label: row ? this.docLabel(row) : r.requestId,
            reason: r.message || AllocationRequestActionResultLabels[r.result as AllocationRequestActionResultEnum] || 'İşlenemedi'
          });
        }

        this.failedRows.set(failed);
        this.selectedIds.update(set => {
          const next = new Set(set);
          for (const id of ids) next.delete(id);
          return next;
        });
        onDone?.();
        this.reload();
      },
      error: err => {
        console.error('Zimmet talebi işlemi başarısız:', err);
        this.failedRows.set([{ label: `${ids.length} talep`, reason: 'Sunucuya ulaşılamadı; lütfen tekrar deneyin.' }]);
      }
    });
  }
}
