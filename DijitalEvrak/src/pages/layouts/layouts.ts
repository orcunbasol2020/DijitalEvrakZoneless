import { ChangeDetectionStrategy, Component, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import Breadcrumb from './breadcrumb/breadcrumb';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { navigations } from '../../navigation';
import { SearchMenuPipe } from '../../pipes/search-menu-pipe';
import { FormsModule } from '@angular/forms';
import { Common } from '../../services/common';
import { initialUser } from '../users/users';

@Component({
  imports: [
    Breadcrumb, 
    RouterLink, 
    RouterLinkActive,
    SearchMenuPipe,
    FormsModule,
    RouterOutlet
  ],
  templateUrl: './layouts.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Layouts {
  readonly search = signal<string>("");
  readonly navigations = computed(() => navigations);
  readonly user= computed(() => this.#common.user());
  readonly #common = inject(Common);

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

  
}
