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
import { NotificationService } from '../../services/notification';
import { NotificationModel, NotificationTypeEnum, NotificationTypeIcons, NotificationTypeTones } from '../../models/notification.model';

type DocumentSearchStatus = 'beklemede' | 'işlemde' | 'tamamlandı';
type DocumentSearchType = 'dahili' | 'harici';

interface DocumentSearchResult {
  belgeNo: string;
  tarih: string;
  konu: string;
  birim: string;
  durum: DocumentSearchStatus;
  tur: DocumentSearchType;
}

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
    LoginReminder
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
  private static readonly TEST_DOCUMENT_ID = '51550714-6b02-4003-9ba3-f705592bfea8';

  private readonly dummyDocuments: DocumentSearchResult[] = [
    { belgeNo: '2026-001-001', tarih: '02.01.2026', konu: 'Personel izin talebi', birim: 'İnsan Kaynakları', durum: 'tamamlandı', tur: 'dahili' },
    { belgeNo: '2026-001-002', tarih: '03.01.2026', konu: 'Bütçe revizyon yazısı', birim: 'Mali İşler', durum: 'işlemde', tur: 'dahili' },
    { belgeNo: '2026-001-003', tarih: '05.01.2026', konu: 'Dış yazışma - protokol', birim: 'Dış İlişkiler', durum: 'beklemede', tur: 'harici' },
    { belgeNo: '2026-001-004', tarih: '07.01.2026', konu: 'Toplantı tutanağı', birim: 'Genel Sekreterlik', durum: 'tamamlandı', tur: 'dahili' },
    { belgeNo: '2026-002-001', tarih: '12.01.2026', konu: 'Satın alma onayı', birim: 'Mali İşler', durum: 'beklemede', tur: 'dahili' },
    { belgeNo: '2026-002-002', tarih: '14.01.2026', konu: 'Araç tahsis talebi', birim: 'İdari İşler', durum: 'işlemde', tur: 'dahili' },
    { belgeNo: '2026-003-001', tarih: '20.01.2026', konu: 'Basın açıklaması taslağı', birim: 'Basın Müşavirliği', durum: 'tamamlandı', tur: 'dahili' },
    { belgeNo: '2026-003-002', tarih: '22.01.2026', konu: 'Büyükelçilik nota yazışması', birim: 'Dış İlişkiler', durum: 'işlemde', tur: 'harici' },
  ];

  readonly searchResults = computed<DocumentSearchResult[]>(() => {
    const term = this.search().trim().toLocaleLowerCase('tr');
    if (!term) {
      return [];
    }
    return this.dummyDocuments
      .filter(d => d.belgeNo.toLocaleLowerCase('tr').includes(term))
      .slice(0, Layouts.MAX_SEARCH_RESULTS);
  });

  readonly statusLabels: Record<DocumentSearchStatus, string> = {
    beklemede: 'Ön Kayıt',
    işlemde: 'İşlemde',
    tamamlandı: 'Aktarıldı',
  };

  readonly typeIcons: Record<DocumentSearchType, string> = {
    dahili: 'description',
    harici: 'public',
  };

  readonly typeIconClasses: Record<DocumentSearchType, string> = {
    dahili: '',
    harici: 'search-autocomplete-icon-harici',
  };

  readonly statusBadgeClasses: Record<DocumentSearchStatus, string> = {
    beklemede: 'badge-soft-warning',
    işlemde: 'badge-soft-info',
    tamamlandı: 'badge-soft-fume',
  };

  onSearchInput(value: string): void {
    this.search.set(value);
    this.showSearchResults.set(value.trim().length > 0);
    this.activeResultIndex.set(-1);
  }

  selectSearchResult(result: DocumentSearchResult): void {
    this.search.set(result.belgeNo);
    this.showSearchResults.set(false);
    this.activeResultIndex.set(-1);

    // Test amaçlı: dummy arama sonuçları gerçek bir belge numarasına karşılık gelmediği için
    // tıklandığında sabit bir test kaydı (2026 nolu evrak) evrakkayit ekranında açılır.
    this.#incomingDocumentService.setSelectedIncomingDocument(Layouts.TEST_DOCUMENT_ID);
    this.#incomingDocumentService.setIncomingDocumentUpdateType('1');
    this.router.navigate(['/evrakkayit']);
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
