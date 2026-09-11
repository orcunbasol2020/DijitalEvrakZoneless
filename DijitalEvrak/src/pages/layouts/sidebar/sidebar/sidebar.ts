import { Component, inject, signal, computed, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { RoleService } from '../../../../services/role-service';
import { SearchMenuPipe } from '../../../../pipes/search-menu-pipe';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, SearchMenuPipe],
  templateUrl: './sidebar.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Sidebar {

  private roleService = inject(RoleService);

  search = signal<string>("");

  navigations = computed(() => this.roleService.getMenu());

}