import { ChangeDetectionStrategy, Component, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { RouterLink } from '@angular/router';
import GenericModel from '../../../components/generic-model/generic-model';
import { Common } from '../../services/common';
import { getUserAvatar } from '../../services/user-avatar';

type Theme = 'light' | 'dark';

@Component({
  imports: [
    GenericModel,
    RouterLink
  ],
  templateUrl: './settings.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Settings {
  readonly #common = inject(Common);
  readonly user = computed(() => this.#common.user());

  readonly userAvatar = computed(() => getUserAvatar(this.user(), 'assets/images/personel/oral.jpg'));

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
