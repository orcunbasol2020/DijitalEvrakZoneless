import { Component, inject, signal, computed, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { RoleService } from '../../../../services/role-service';
import { SearchMenuPipe } from '../../../../pipes/search-menu-pipe';
import { NavigationModel } from '../../../../navigation';
import { Common } from '../../../../services/common';
import { FlexiTooltipDirective } from 'flexi-tooltip';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, SearchMenuPipe, FlexiTooltipDirective],
  templateUrl: './sidebar.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Sidebar {

  private roleService = inject(RoleService);
  private common = inject(Common);
  private router = inject(Router);

  search = signal<string>("");

  navigations = computed(() => this.roleService.getMenu());

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

  toggleCategory(category: string): void {
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

  visibleItems(items: NavigationModel[]): NavigationModel[] {
    const result: NavigationModel[] = [];
    let currentCollapsed = false;

    for (const item of items) {
      if (item.category) {
        currentCollapsed = this.isCategoryCollapsed(item.category);
        result.push(item);
      } else if (!currentCollapsed) {
        result.push(item);
      }
    }

    return result;
  }

  logout(): void {
    this.common.logout();
    this.router.navigateByUrl('/login');
  }

}