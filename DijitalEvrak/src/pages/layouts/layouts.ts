import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal, ViewEncapsulation } from '@angular/core';
import { DatePipe, NgClass } from '@angular/common';
import Breadcrumb from './breadcrumb/breadcrumb';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { navigations } from '../../navigation';
import { SearchMenuPipe } from '../../pipes/search-menu-pipe';
import { FormsModule } from '@angular/forms';
import { Common } from '../../services/common';
import { initialUser } from '../users/users';
import { IncomingDocumentService } from '../../services/incomingdocument';
import { Sidebar } from './sidebar/sidebar/sidebar';
import { RoleService } from '../../services/role-service';
import { DocumentAllocation } from '../../services/documentallocation';
import { getUserAvatar } from '../../services/user-avatar';
import { AllocationRequestService } from '../../services/allocationrequest';
import { LoginReminder } from './login-reminder/login-reminder';
import { SessionTimeout } from './session-timeout/session-timeout';
import { NotificationService } from '../../services/notification';
import { NotificationModel, NotificationTypeEnum, NotificationTypeIcons, NotificationTypeTones } from '../../models/notification.model';

import { DocumentSearchResult, DocumentSearchService } from '../../services/document-search';

@Component({
  imports: [
    Breadcrumb,
    RouterLink,
    RouterLinkActive,
    Sidebar,
    FormsModule,
    RouterOutlet,
    NgClass,
    DatePipe,
    LoginReminder,
    SessionTimeout
  ],
  templateUrl: './layouts.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Layouts {
  readonly search = signal<string>("");
  readonly showSearchResults = signal<boolean>(false);
  readonly activeResultIndex = signal<number>(-1);
  readonly sidebarCollapsed = signal<boolean>(false);
  private static readonly MAX_SEARCH_RESULTS = 6;

  // Üst bar evrak araması: liste ilk odaklanmada bir kez çekilir, sonra tarayıcıda süzülür
  readonly #documentSearch = inject(DocumentSearchService);
  readonly #searchIndex = signal<DocumentSearchResult[]>([]);
  readonly searchLoading = signal<boolean>(false);
  #searchIndexRequested = false;

  readonly searchResults = computed<DocumentSearchResult[]>(() =>
    this.#documentSearch.search(this.#searchIndex(), this.search(), Layouts.MAX_SEARCH_RESULTS)
  );

  #loadSearchIndex(): void {
    if (this.#searchIndexRequested) return;
    this.#searchIndexRequested = true;
    this.searchLoading.set(true);
    this.#documentSearch.index().subscribe({
      next: items => {
        this.#searchIndex.set(items);
        this.searchLoading.set(false);
      },
      error: () => {
        // Bir sonraki odaklanmada yeniden denenir
        this.#searchIndexRequested = false;
        this.searchLoading.set(false);
      }
    });
  }

  onSearchFocus(): void {
    // Önbellek süresi dolmuşsa liste tazelenir (servis içinde kontrol edilir)
    this.#searchIndexRequested = false;
    this.#loadSearchIndex();
    this.onSearchInput(this.search());
  }

  onSearchInput(value: string): void {
    this.search.set(value);
    this.showSearchResults.set(value.trim().length > 0);
    this.activeResultIndex.set(-1);
    if (value.trim()) this.#loadSearchIndex();
  }

  // Gelen evrak her role açık olan Süreçler (salt okunur) ekranında, giden evrak kendi ekranında açılır
  selectSearchResult(result: DocumentSearchResult): void {
    this.search.set('');
    this.showSearchResults.set(false);
    this.activeResultIndex.set(-1);

    if (result.direction === 'in') {
      this.#incomingDocumentService.setSelectedIncomingDocument(result.id);
      this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => this.router.navigate(['/surecler']));
    } else {
      this.router.navigate(['/gidenevrak/outgoing/create', result.id]);
    }
  }

  onSearchBlur(): void {
    setTimeout(() => this.showSearchResults.set(false), 150);
  }

  onSearchKeydown(event: KeyboardEvent): void {
    const results = this.searchResults();
    if (!this.showSearchResults() || results.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeResultIndex.set((this.activeResultIndex() + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeResultIndex.set((this.activeResultIndex() - 1 + results.length) % results.length);
    } else if (event.key === 'Enter' && this.activeResultIndex() >= 0) {
      event.preventDefault();
      this.selectSearchResult(results[this.activeResultIndex()]);
    } else if (event.key === 'Escape') {
      this.showSearchResults.set(false);
      this.activeResultIndex.set(-1);
    }
  }
  readonly navigations = computed(() => navigations);
  readonly user = computed(() => this.#common.user());
  readonly #common = inject(Common);
  readonly #incomingDocumentService = inject(IncomingDocumentService);
  readonly pendingCount = signal<number>(0);
  private readonly router = inject(Router);
  readonly roleService = inject(RoleService);
  readonly isAdmin = computed(() => this.roleService.has('Yönetici'));
  readonly #allocationService = inject(DocumentAllocation);
  readonly transferCount = signal<number>(0);

  // Birim Evrak Sorumlusu: biriminde teslim alınmayı bekleyen evrak sayısı
  readonly isDepartmentOfficer = computed(() => this.roleService.hasBirimEvrakRole());
  readonly departmentPendingCount = signal<number>(0);

  // Zimmet onayı bekleyen evraklar: zil menüsünde yalnız sayısı gösterilir, liste onay ekranındadır
  readonly #allocationRequests = inject(AllocationRequestService);
  readonly approvals = this.#allocationRequests.pendingForMe;

  // Okunmamış bildirimler (onay talebi / hatırlatma hariç; onlar yukarıdaki evrak listesinde)
  readonly #notificationService = inject(NotificationService);
  readonly notifications = this.#notificationService.unreadVisible;
  readonly notificationPreview = computed(() => this.notifications().slice(0, Layouts.NOTIFICATION_PREVIEW));
  private static readonly NOTIFICATION_PREVIEW = 5;

  notificationIcon(n: NotificationModel): string {
    return NotificationTypeIcons[n.type as NotificationTypeEnum] ?? 'notifications';
  }

  notificationTone(n: NotificationModel): string {
    return NotificationTypeTones[n.type as NotificationTypeEnum] ?? 'is-muted';
  }

  openNotification(n: NotificationModel): void {
    const userId = this.user()?.id;
    if (userId) this.#notificationService.open(n, userId);
  }

  // Menü açık kalsın diye tıklama dropdown'a iletilmez
  markAllNotificationsRead(event: Event): void {
    event.stopPropagation();
    const userId = this.user()?.id;
    if (userId) this.#notificationService.markAllAsRead(userId).subscribe();
  }

  readonly totalNotificationCount = computed(() =>
    this.pendingCount() +
    this.departmentPendingCount() +
    this.transferCount() +
    this.approvals().length +
    this.notifications().length
  );

  constructor() {
    this.restoreSidebarMode();
    // Yeni oturumda önceki kullanıcının arama listesi kullanılmasın
    this.#documentSearch.clear();

    const userId = this.user()?.id;

    if (userId) {
      const destroyRef = inject(DestroyRef);
      this.#allocationRequests.startPolling(userId, destroyRef);
      this.#notificationService.startPolling(userId, destroyRef);

      this.#incomingDocumentService
        .getPendingCount(userId)
        .subscribe(c => this.pendingCount.set(c));

      const departmentId = this.user()?.departmentId;
      if (departmentId && this.isDepartmentOfficer()) {
        this.#incomingDocumentService
          .getDepartmentDeliveryStats(departmentId)
          .subscribe(s => this.departmentPendingCount.set(s.pending));
      }

      this.#allocationService
        .getTransferCountByUserId(userId)
        .subscribe(c => this.transferCount.set(c));
    }
  }

  readonly userAvatar = computed(() => getUserAvatar(this.user()));

logout(): void {
  this.#common.logout();
  this.router.navigateByUrl('/login');
}

/**
 * Masaüstünde sol menü tamamen gizlenmek yerine yalnız ikon (mini) moduna daralır;
 * mobilde ise eskisi gibi off-canvas olarak açılıp kapanır.
 */
toggleSidebar(): void {
  this.sidebarCollapsed.update(collapsed => !collapsed);

  if (Layouts.isMobileViewport()) {
    document.body.classList.toggle('sb-toggled', this.sidebarCollapsed());
    return;
  }

  document.body.classList.toggle('sb-mini', this.sidebarCollapsed());
  try {
    localStorage.setItem(Layouts.SIDEBAR_MINI_KEY, this.sidebarCollapsed() ? '1' : '0');
  } catch { /* localStorage kapalıysa tercih kaydedilmez */ }
}

private static readonly SIDEBAR_MINI_KEY = 'sidebar-mini';

private static isMobileViewport(): boolean {
  return window.matchMedia('(max-width: 768px)').matches;
}

private restoreSidebarMode(): void {
  if (Layouts.isMobileViewport()) return;
  let mini = false;
  try {
    mini = localStorage.getItem(Layouts.SIDEBAR_MINI_KEY) === '1';
  } catch { /* localStorage kapalıysa varsayılan (geniş) mod */ }
  this.sidebarCollapsed.set(mini);
  document.body.classList.toggle('sb-mini', mini);
}

public goToPendingScanList() {
  this.#incomingDocumentService.setIncomingDocumentSearchType('pending');
  this.router.navigateByUrl('/scanlist', { skipLocationChange: true }).then(() => {
    this.router.navigate(['/scanlist']);
  });
}


}
