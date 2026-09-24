import { ChangeDetectionStrategy, Component, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import GenericModel from '../../../../components/generic-model/generic-model';
import { Common } from '../../../services/common';
import { httpResource } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RoleService, normalizeRoleName } from '../../../services/role-service';
import { getUserAvatar, getUserInitials } from '../../../services/user-avatar';

export interface RoleModel {
  id?: string;
  name: string;
  isActive: boolean;
  isDeleted: boolean;
  createdDate: string;
  updateDate: string;
  hasRole?: boolean;
}

// Rol listesi filtresi: tümü / hesapta tanımlı / tanımlı olmayan
type RoleFilter = 'all' | 'granted' | 'missing';

@Component({
  imports: [
    GenericModel,
    FormsModule,
    RouterLink
  ],
  templateUrl: './profile.html',
  // Üst kart ve kart iskeleti (st-*) Ayarlar, arama / boş durum / iletişim bloğu (sp-*)
  // Destek sayfasıyla ortak; pf-* sınıfları bu ekrana özgü
  styleUrls: ['../../settings/settings.css', '../../support/support.css', './profile.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Profile {
  readonly #common = inject(Common);
  readonly #roleService = inject(RoleService);

  readonly search = signal<string>('');
  readonly filter = signal<RoleFilter>('all');
  readonly user = computed(() => this.#common.user());
  // Eşleşen profil resmi yoksa başka birinin fotoğrafı yerine baş harfler gösterilir.
  readonly userAvatar = computed(() => getUserAvatar(this.user()));
  readonly userInitials = computed(() => getUserInitials(this.user()));

  readonly result = httpResource<RoleModel[]>(() => "api/Roles/GetAll", {});
  readonly data = computed(() =>
    // Rol adı ekranda düzeltilmiş yazımla gösterilir (ör. backend'deki "Ön Kayit" → "Ön Kayıt")
    (this.result.value() ?? []).map(r => ({ ...r, name: normalizeRoleName(r.name), hasRole: this.#roleService.has(r.name) }))
  );
  readonly loading = computed(() => this.result.isLoading());
  readonly activeRoleCount = computed(() => this.data().filter(r => r.hasRole).length);
  readonly coveragePct = computed(() => {
    const total = this.data().length;
    return total ? Math.round((this.activeRoleCount() / total) * 100) : 0;
  });

  // Sahip olunan roller önce, ardından ada göre; arama ve segment filtresi uygulanır
  readonly filteredRoles = computed(() => {
    const term = this.search().trim().toLocaleLowerCase('tr');
    const filter = this.filter();

    return this.data()
      .filter(r => filter === 'all' || (filter === 'granted') === !!r.hasRole)
      .filter(r => !term || r.name.toLocaleLowerCase('tr').includes(term))
      .sort((a, b) => Number(!!b.hasRole) - Number(!!a.hasRole) || a.name.localeCompare(b.name, 'tr'));
  });

  clearFilters() {
    this.search.set('');
    this.filter.set('all');
  }
}
