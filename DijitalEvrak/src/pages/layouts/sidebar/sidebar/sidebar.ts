import { Component, inject, signal, computed, ChangeDetectionStrategy, ViewEncapsulation, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { RoleService } from '../../../../services/role-service';
import { SearchMenuPipe } from '../../../../pipes/search-menu-pipe';
import { NavigationModel } from '../../../../navigation';
import { Common } from '../../../../services/common';
import { AllocationRequestService } from '../../../../services/allocationrequest';

interface NavGroup {
  category: string | null;
  /** Kategori adının Türkçe kurallarına göre büyük harfli hali (CSS text-transform "i" harfini bozar). */
  label: string;
  items: NavigationModel[];
}

interface MiniTooltip {
  text: string;
  top: number;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [FormsModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Sidebar {

  private roleService = inject(RoleService);
  private common = inject(Common);
  private router = inject(Router);
  private readonly allocationRequests = inject(AllocationRequestService);
  private readonly searchPipe = new SearchMenuPipe();

  /** Header'daki bildirim sayacıyla aynı kaynak; "Gelen Evraklar" menüsünün yanında rozet olarak gösterilir. */
  readonly pendingCount = input<number>(0);

  /** "Takip Sistemi" harf harf dağıtılarak "DİJİTAL EVRAK" başlığıyla aynı genişliğe yayılır. */
  readonly subtitleChars = 'Takip Sistemi'.split('');

  search = signal<string>("");
  readonly isSearching = computed(() => this.search().trim().length > 0);

  navigations = computed(() => this.roleService.getMenu());

  readonly user = computed(() => this.common.user());
  readonly userFullName = computed(() => `${this.user()?.name ?? ''} ${this.user()?.surname ?? ''}`.trim());
  readonly userInitials = computed(() => {
    const u = this.user();
    const first = (u?.name ?? '').trim().charAt(0);
    const last = (u?.surname ?? '').trim().charAt(0);
    return `${first}${last}`.toLocaleUpperCase('tr') || '?';
  });
  readonly isAdmin = computed(() => this.roleService.has('Yönetici'));
  readonly isBirimEvrakSorumlusu = computed(() => this.roleService.hasBirimEvrakRole());
  readonly userRoleLabel = computed(() => {
    if (this.isAdmin()) return 'Yönetici';
    if (this.roleService.has('Birim Yöneticisi')) return 'Birim Yöneticisi';
    if (this.isBirimEvrakSorumlusu()) return 'Birim Evrak Sorumlusu';
    return this.roleService.roles[0] ?? '';
  });

  /** Menü öğeleri kategori bazında gruplanır; arama varken filtre uygulanır. */
  readonly groups = computed<NavGroup[]>(() => {
    const items = this.searchPipe.transform(this.navigations(), this.search());
    const groups: NavGroup[] = [];
    let current: NavGroup | null = null;

    for (const item of items) {
      if (item.category) {
        current = { category: item.category, label: item.category.toLocaleUpperCase('tr'), items: [] };
        groups.push(current);
        continue;
      }
      if (!current) {
        current = { category: null, label: '', items: [] };
        groups.push(current);
      }
      current.items.push(item);
    }

    return groups;
  });

  private static readonly DEFAULT_OPEN_CATEGORY = 'Gelen Evrak';

  // Birim Evrak Sorumlusu'nun menüsü kısa olduğundan tüm kategoriler açık başlar
  // ve kategoriler birbirinden bağımsız açılıp kapanır (akordeon davranışı yok).
  private readonly expandAllByDefault = this.roleService.hasBirimEvrakRole();

  private collapsedCategories = signal<Set<string>>(
    this.expandAllByDefault
      ? new Set<string>()
      : new Set(
          this.roleService.getMenu()
            .map(item => item.category)
            .filter((category): category is string => !!category && category !== Sidebar.DEFAULT_OPEN_CATEGORY)
        )
  );

  constructor() {
    // Sayfa yenilendiğinde ya da menü dışından (kontrol paneli kısayolları vb.) bir sayfaya
    // gidildiğinde, o sayfanın bulunduğu kategori açık gelir; varsayılan kategoriye dönülmez.
    this.expandCategoryOf(this.router.url);
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(e => this.expandCategoryOf(e.urlAfterRedirects));
  }

  /** Adresle en uzun eşleşen menü öğesinin kategorisi (alt sayfalar da üst menünün kategorisine düşer). */
  private categoryOfUrl(url: string): string | null {
    const path = url.split(/[?#]/)[0];
    let category: string | null = null;
    let best: { category: string | null; length: number } | null = null;

    for (const item of this.roleService.getMenu()) {
      if (item.category) { category = item.category; continue; }
      if (!item.url || item.url === '/') continue;
      const matches = path === item.url || path.startsWith(item.url + '/');
      if (matches && (!best || item.url.length > best.length)) {
        best = { category, length: item.url.length };
      }
    }
    return best?.category ?? null;
  }

  private expandCategoryOf(url: string): void {
    const category = this.categoryOfUrl(url);
    if (!category || !this.isCategoryCollapsed(category)) return;

    if (this.expandAllByDefault) {
      this.collapsedCategories.update(current => {
        const next = new Set(current);
        next.delete(category);
        return next;
      });
      return;
    }

    const allCategories = this.navigations()
      .map(item => item.category)
      .filter((c): c is string => !!c);
    this.collapsedCategories.set(new Set(allCategories.filter(c => c !== category)));
  }

  isCategoryCollapsed(category: string): boolean {
    return this.collapsedCategories().has(category);
  }

  /** Arama yapılırken tüm gruplar açık gösterilir ki sonuçlar gizli kalmasın. */
  isGroupCollapsed(group: NavGroup): boolean {
    return !!group.category && !this.isSearching() && this.isCategoryCollapsed(group.category);
  }

  toggleCategory(category: string): void {
    if (this.isSearching()) return;

    if (this.expandAllByDefault) {
      this.collapsedCategories.update(current => {
        const next = new Set(current);
        next.has(category) ? next.delete(category) : next.add(category);
        return next;
      });
      return;
    }

    const allCategories = this.navigations()
      .map(item => item.category)
      .filter((c): c is string => !!c);

    this.collapsedCategories.update(current => {
      const wasCollapsed = current.has(category);
      return wasCollapsed
        ? new Set(allCategories.filter(c => c !== category))
        : new Set(allCategories);
    });
  }

  badgeFor(item: NavigationModel): number {
    if (item.url === '/scanlist') return this.pendingCount();
    // Zimmet onayı bekleyen evrak sayısı (zil menüsüyle aynı liste)
    if (item.url === '/zimmet-onaylari') return this.allocationRequests.pendingForMe().length;
    return 0;
  }

  // ----- Mini (yalnız ikon) mod tooltip'i -----
  // Sidebar overflow-y:auto olduğundan içeride absolute tooltip kırpılır;
  // bunun yerine position:fixed tek bir tooltip elemanı kullanılır.
  readonly miniTooltip = signal<MiniTooltip | null>(null);

  showMiniTooltip(event: MouseEvent, text: string | undefined): void {
    if (!text || !document.body.classList.contains('sb-mini')) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.miniTooltip.set({ text, top: rect.top + rect.height / 2 });
  }

  hideMiniTooltip(): void {
    this.miniTooltip.set(null);
  }

  logout(): void {
    this.common.logout();
    this.router.navigateByUrl('/login');
  }

}
