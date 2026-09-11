import { ChangeDetectionStrategy, Component, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { RouterLink } from '@angular/router';
import GenericModel from '../../../components/generic-model/generic-model';
import { Common } from '../../services/common';

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

  readonly userAvatar = computed(() => {
    const name = this.user()?.name ?? '';

    switch (name) {
      case 'Bülent':
        return 'assets/images/personel/bulent.jpg';
      case 'Tahsin':
        return 'assets/images/personel/tahsin.jpg';
      default:
        return 'assets/images/personel/oral.jpg';
    }
  });

  readonly theme = signal<Theme>(
    localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'
  );

  setTheme(theme: Theme) {
    this.theme.set(theme);
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }
}
