import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { UserPhotoOwner, UserPhotoService } from '../../services/user-photo';

/**
 * Kullanıcının profil resmi. Resim yoksa (photoVersion null) ya da yüklenemezse içerik (ng-content) gösterilir:
 * her ekran kendi baş harf / simge yedeğini içine koyar. Boyut ve yuvarlaklık çağıran kabın (ör. .avatar,
 * .us-avatar) sınıfından gelir; kap overflow: hidden olmalı.
 *
 *   <span class="avatar">
 *     <app-user-photo [user]="user()"><span class="avatar-fallback avatar-initials">AY</span></app-user-photo>
 *   </span>
 */
@Component({
  selector: 'app-user-photo',
  template: `
    @if (src(); as s) {
      <img [src]="s" [alt]="alt()" draggable="false" />
    } @else {
      <ng-content />
    }
  `,
  styles: `
    :host { display: contents; }
    img { display: block; width: 100%; height: 100%; object-fit: cover; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserPhoto {
  readonly user = input<UserPhotoOwner | null | undefined>();
  readonly alt = input('');

  readonly #photos = inject(UserPhotoService);
  readonly src = computed(() => this.#photos.photoUrl(this.user()));
}
