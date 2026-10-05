import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, HostListener, inject, signal, viewChild, ViewEncapsulation } from '@angular/core';
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
import { isSentToPublish } from '../../models/publishstatus.model';

import { DocumentSearchResult, DocumentSearchService } from '../../services/document-search';

interface HighlightPart {
  text: string;
  match: boolean;
}

interface SearchResultView extends DocumentSearchResult {
  noParts: HighlightPart[];
  subjectParts: HighlightPart[];
}

// Metni aranan kelimelerin geçtiği ve geçmediği parçalara böler (Türkçe küçük harf karşılaştırması;
// tr küçültme harf sayısını değiştirmediği için konumlar özgün metinde de geçerlidir)
function highlightParts(text: string, words: string[]): HighlightPart[] {
  if (!text) return [];
  const lowerText = text.toLocaleLowerCase('tr');
  if (lowerText.length !== text.length || !words.length) return [{ text, match: false }];

  const ranges: [number, number][] = [];
  for (const word of words) {
    let from = lowerText.indexOf(word);
    while (from !== -1) {
      ranges.push([from, from + word.length]);
      from = lowerText.indexOf(word, from + word.length);
    }
  }
  if (!ranges.length) return [{ text, match: false }];

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of ranges) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }

  const parts: HighlightPart[] = [];
  let pos = 0;
  for (const [start, end] of merged) {
    if (start > pos) parts.push({ text: text.slice(pos, start), match: false });
    parts.push({ text: text.slice(start, end), match: true });
    pos = end;
  }
  if (pos < text.length) parts.push({ text: text.slice(pos), match: false });
  return parts;
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
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  // 1200px altında kutu gizlidir; ikona basınca başlığın altında açılır
  readonly searchOpen = signal<boolean>(false);

  // Tüm eşleşmeler sayılır, ilk MAX_SEARCH_RESULTS tanesi listelenir
  readonly #searchMatches = computed<DocumentSearchResult[]>(() =>
    this.#documentSearch.search(this.#searchIndex(), this.search(), Number.MAX_SAFE_INTEGER)
  );
  readonly searchMatchCount = computed(() => this.#searchMatches().length);
  readonly searchResults = computed(() => this.#searchMatches().slice(0, Layouts.MAX_SEARCH_RESULTS));

  // Aranan kelimeler evrak no ve konuda vurgulanır
  readonly searchResultViews = computed<SearchResultView[]>(() => {
    const words = this.search().toLocaleLowerCase('tr').split(/\s+/).filter(Boolean);
    return this.searchResults().map(r => ({
      ...r,
      noParts: highlightParts(r.no, words),
      subjectParts: highlightParts(r.subject, words)
    }));
  });

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

  clearSearch(): void {
    this.onSearchInput('');
    this.searchInput()?.nativeElement.focus();
  }

  toggleSearch(): void {
    const open = !this.searchOpen();
    this.searchOpen.set(open);
    if (open) setTimeout(() => this.searchInput()?.nativeElement.focus());
  }

  // Ctrl+K (Mac'te Cmd+K) ya da "/" ile arama kutusuna gidilir; "/" yazı alanındayken çalışmaz
  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent): void {
    const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
    const target = event.target as HTMLElement | null;
    const typing = !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
    if (!isShortcut && !(event.key === '/' && !typing)) return;

    event.preventDefault();
    const input = this.searchInput()?.nativeElement;
    if (!input) return;
    if (!input.offsetParent) this.searchOpen.set(true);
    setTimeout(() => {
      input.focus();
      input.select();
    });
  }

  // Gelen evrak her role açık olan Süreçler (salt okunur) ekranında, giden evrak kendi ekranında açılır
  selectSearchResult(result: DocumentSearchResult): void {
    this.search.set('');
    this.showSearchResults.set(false);
    this.activeResultIndex.set(-1);
    this.searchOpen.set(false);

    if (result.direction === 'in') {
      this.#incomingDocumentService.setSelectedIncomingDocument(result.id);
      this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => this.router.navigate(['/surecler']));
    } else {
      this.router.navigate(['/gidenevrak/outgoing/create', result.id]);
    }
  }

  onSearchBlur(): void {
    setTimeout(() => {
      this.showSearchResults.set(false);
      // Küçük ekranda boş kutu odaktan çıkınca kapanır
      if (!this.search().trim()) this.searchOpen.set(false);
    }, 150);
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (this.showSearchResults()) {
        this.showSearchResults.set(false);
        this.activeResultIndex.set(-1);
      } else {
        this.searchOpen.set(false);
        (event.target as HTMLInputElement).blur();
      }
      return;
    }

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
    } else if (event.key === 'Enter') {
      // Seçili satır yoksa ilk sonuç açılır
      event.preventDefault();
      this.selectSearchResult(results[Math.max(this.activeResultIndex(), 0)]);
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
  // Rozet ve "+N bildirim daha" sunucudaki gerçek sayıdan; önizleme listesi en fazla 50 kayıt çeker
  readonly notificationCount = this.#notificationService.unreadCount;
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

  // Zil menüsünde "Bekleyen İşler" bölümü; Birim Evrak Sorumlusu teslim satırını sıfırken de görür
  readonly hasPendingTasks = computed(() =>
    this.approvals().length > 0 ||
    this.isDepartmentOfficer() ||
    this.pendingCount() > 0 ||
    this.transferCount() > 0
  );

  // Zil rozeti yalnız yapılacak işleri ve okunmamış bildirimleri sayar. Devrettiğiniz zimmetler
  // bilgi amaçlıdır (devredilen evrakların toplamı), menüde görünür ama rozete katılmaz;
  // katılsaydı bir kez devir yapan kullanıcının zili hiç sönmezdi.
  readonly totalNotificationCount = computed(() =>
    this.pendingCount() +
    this.departmentPendingCount() +
    this.approvals().length +
    this.notificationCount()
  );

  readonly bellBadge = computed(() => {
    const count = this.totalNotificationCount();
    return count > 9 ? '9+' : String(count);
  });

  readonly bellLabel = computed(() => {
    const count = this.totalNotificationCount();
    return count > 0 ? `${count} bekleyen işlem` : 'Bekleyen işleminiz yok';
  });

  // Zil sürekli sallanmaz; yalnız sayı arttığında (yeni iş ya da bildirim) bir kez çalar
  readonly bellRinging = signal(false);
  #lastBellCount = 0;
  #bellTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly ringOnIncrease = effect(() => {
    const count = this.totalNotificationCount();
    const increased = count > this.#lastBellCount;
    this.#lastBellCount = count;
    if (!increased || this.#bellTimer) return;
    this.bellRinging.set(true);
    this.#bellTimer = setTimeout(() => {
      this.bellRinging.set(false);
      this.#bellTimer = null;
    }, 1000);
  });

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

// "Atananlar": kullanıcıya atanmış, henüz yayına gönderilmemiş gelen evraklar (Tarama Listesi'nin
// "bekleyenler" süzgeciyle aynı kural). Tek evrak varsa doğrudan Evrak Kayıt açılır; evrak zaten
// kullanıcıya atanmış olduğu için İşleme Al adımı yoktur. Birden fazlaysa liste açılır.
public goToPendingAssigned() {
  const userId = this.user()?.id;
  if (!userId) return;
  const departmentId = this.roleService.hasAny(['Yönetici', 'Gelen Evrak']) ? undefined : this.user()?.departmentId;
  this.#incomingDocumentService.getAllIncomingDocuments(departmentId).subscribe({
    next: docs => {
      const mine = (docs ?? []).filter(d => d.currentAssignmentUserId === userId && !isSentToPublish(d));
      if (mine.length === 1 && mine[0].id) {
        this.#incomingDocumentService.setSelectedIncomingDocument(mine[0].id);
        this.#incomingDocumentService.setIncomingDocumentUpdateType('1');
        this.router.navigate(['/evrakkayit']);
      } else {
        this.goToPendingScanList();
      }
    },
    error: () => this.goToPendingScanList()
  });
}

public goToPendingScanList() {
  this.#incomingDocumentService.setIncomingDocumentSearchType('pending');
  this.router.navigateByUrl('/scanlist', { skipLocationChange: true }).then(() => {
    this.router.navigate(['/scanlist']);
  });
}


}
