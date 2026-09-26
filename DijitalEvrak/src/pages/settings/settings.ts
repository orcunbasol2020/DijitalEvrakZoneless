import { ChangeDetectionStrategy, Component, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { RouterLink } from '@angular/router';
import GenericModel from '../../../components/generic-model/generic-model';
import { Common } from '../../services/common';
import { RoleService } from '../../services/role-service';

type Theme = 'light' | 'dark';

// Hesap kartında gösterilen en fazla yetki rozeti; kalanı "+N daha" olarak profile yönlenir
const MAX_VISIBLE_ROLES = 6;

@Component({
  imports: [
    GenericModel,
    RouterLink
  ],
  templateUrl: './settings.html',
  // Üst kart (sp-hero) Destek sayfasıyla ortak
  styleUrls: ['../support/support.css', './settings.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Settings {
  readonly #common = inject(Common);
  readonly #roleService = inject(RoleService);

  readonly user = computed(() => this.#common.user());

  // Roller oturum açılırken localStorage'a yazılır; kullanıcı sinyali değişince yeniden okunur
  readonly roles = computed(() => {
    this.user();
    return this.#roleService.roles;
  });
  readonly visibleRoles = computed(() => this.roles().slice(0, MAX_VISIBLE_ROLES));
  readonly hiddenRoleCount = computed(() => Math.max(0, this.roles().length - MAX_VISIBLE_ROLES));

  readonly theme = signal<Theme>(
    localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'
  );

  setTheme(theme: Theme) {
    this.theme.set(theme);
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-bs-theme', theme);
    localStorage.setItem('theme', theme);
  }
}
