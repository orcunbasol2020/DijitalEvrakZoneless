import { Component, inject, signal, computed, ChangeDetectionStrategy, ViewEncapsulation, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { RoleService } from '../../../../services/role-service';
import { SearchMenuPipe } from '../../../../pipes/search-menu-pipe';
import { NavigationModel } from '../../../../navigation';
import { Common } from '../../../../services/common';

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
  readonly isBirimEvrakSorumlusu = computed(() => this.roleService.has('Birim Evrak Sorumlusu'));
  readonly userRoleLabel = computed(() => {
    if (this.isAdmin()) return 'Yönetici';
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
  private readonly expandAllByDefault = this.roleService.has('Birim Evrak Sorumlusu');

  private collapsedCategories = signal<Set<string>>(
    this.expandAllByDefault
      ? new Set<string>()
      : new Set(
          this.roleService.getMenu()
            .map(item => item.category)
            .filter((category): category is string => !!category && category !== Sidebar.DEFAULT_OPEN_CATEGORY)
        )
  );

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
    return item.url === '/scanlist' ? this.pendingCount() : 0;
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
