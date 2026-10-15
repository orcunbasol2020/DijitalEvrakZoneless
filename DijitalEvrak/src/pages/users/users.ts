import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { FlexiGridFilterDataModel, FlexiGridModule } from 'flexi-grid';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import GenericModel from '../../../components/generic-model/generic-model';
import { UserService } from '../../services/user';
import { Common } from '../../services/common';
import { isRoleVisible, normalizeRoleName, roleIcon, RoleService } from '../../services/role-service';
import { RoleModel } from './role/role';
import { DepartmentId } from '../../models/ids';

// Kullanıcılar kaynak sistemden (ComAuthorizationUser) gelir, bizde salt okunurdur; yalnızca roller atanır.
export interface UserModel{
  id?: string;
  name: string;
  surname: string;
  email: string;
  /** AD kullanıcı adı (ör. "ayse.yilmaz"), "HITIT\" öneki olmadan */
  userName: string;
  /** Birimi tanımsız kullanıcılarda null */
  departmentId: DepartmentId | null;
  departmentName: string;
  departmentShortName: string;
  /** Unvan (ör. "Sözleşmeli Bilişim Personeli"); kaynak döküm gelmeyen kullanıcılarda null, o zaman hiçbir şey gösterilmez */
  titleName?: string | null;
  /** false: pasif, girişi engellenmiş ya da kurumdan ayrılmış */
  isActive: boolean;
  isDeleted: boolean;
  /** Kullanıcının etkin rolleri; yalnızca Users/GetAll doldurur (GetById'de null gelir). */
  roles?: UserRoleRef[] | null;
}

export interface UserRoleRef {
  id: string;
  name: string;
}

/** Listede gösterilen satır: rol adları ızgara araması ve Excel çıktısı için tek metne çevrilir. */
type UserRow = UserModel & { roleNames: string };

/** Arama en az bu kadar karakterle sunucuya gider */
const MIN_SEARCH = 2;
const SEARCH_DEBOUNCE_MS = 300;

export const initialUser:UserModel = {
  name: "",
  surname: "",
  email: "",
  userName: "",
  departmentId: null,
  departmentName: "",
  departmentShortName: "",
  isActive: true,
  isDeleted: false,
}

@Component({
  imports: [
    GenericModel,
    FlexiGridModule,
    RouterLink,
    FormsModule
  ],
  templateUrl: './users.html',
  // Roller sayfasıyla aynı kart başlığı: kart iskeleti (st-*) ve başlık araçları (zl-*) paylaşılır.
  styleUrls: [
    '../settings/settings.css',
    '../zimmetlerim/zimmetlerim.css',
    './users.css'
  ],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Users {
  readonly #userService = inject(UserService);
  readonly #common = inject(Common);
  readonly #roleService = inject(RoleService);

  // Kaynakta ~10.000 kullanıcı var. Arama yokken bu sistemde rolü olanlar listelenir; rol verilecek
  // kişi arama kutusundan bulunur (ad, soyad ya da kullanıcı adı, sunucuda aranır).
  readonly search = signal('');
  readonly #searchTerm = signal('');
  #searchTimer?: ReturnType<typeof setTimeout>;
  readonly searching = computed(() => this.#searchTerm().length >= MIN_SEARCH);

  /** Boş: tüm roller; aksi halde rol id'si (sunucuda süzülür) */
  readonly roleFilter = signal<string>('');

  /** Giriş yapan kullanıcının birimi; birimi yoksa Birimim butonu gösterilmez */
  readonly ownDepartmentId = computed(() => this.#common.user()?.departmentId ?? null);
  /** Açıkken yalnızca kendi birimindeki personel listelenir (rolü olmayanlar dahil, sunucuda süzülür) */
  readonly onlyOwnDepartment = signal(false);
  readonly departmentFilter = computed(() => this.onlyOwnDepartment() ? this.ownDepartmentId() : null);
  /** Yönetici, Birimim'de alt birimlerin (parentId zinciri) personelini de görür; diğerleri yalnızca kendi birimini */
  readonly includeSubDepartments = this.#roleService.has('Yönetici');

  readonly result = httpResource<UserModel[]>(() => {
    const term = this.#searchTerm();
    return this.#userService.listUrl({
      search: term.length >= MIN_SEARCH ? term : null,
      // Birim süzgecinde birimin tüm personeli gelir; aksi halde arama yokken yalnızca rolü olanlar
      onlyWithRoles: term.length < MIN_SEARCH && !this.departmentFilter(),
      departmentId: this.departmentFilter(),
      includeSubDepartments: !!this.departmentFilter() && this.includeSubDepartments,
      roleId: this.roleFilter() || null,
    });
  });
  readonly loading = computed(() => this.result.isLoading());

  readonly rolesResult = httpResource<RoleModel[]>(() => "api/Roles/GetAll");
  readonly roleOptions = computed(() =>
    (this.rolesResult.value() ?? [])
      .filter(r => r.isActive && !r.isDeleted && r.id && isRoleVisible(normalizeRoleName(r.name)))
      .map(r => ({ id: r.id!, name: normalizeRoleName(r.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr')));

  readonly data = computed<UserRow[]>(() =>
    (this.result.value() ?? []).map(u => {
      const roles = (u.roles ?? [])
        .map(r => ({ ...r, name: normalizeRoleName(r.name) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      return { ...u, roles, roleNames: roles.map(r => r.name).join(', ') };
    }));

  /** Birimi sütununun seçmeli filtresi: listedeki kullanıcıların birimleri, alfabetik. */
  readonly departmentFilterData = computed<FlexiGridFilterDataModel[]>(() =>
    [...new Set(this.data().map(u => u.departmentName).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'tr'))
      .map(name => ({ value: name, name })));
  showFilters = false;

  onSearch(value: string): void {
    this.search.set(value);
    clearTimeout(this.#searchTimer);
    this.#searchTimer = setTimeout(() => this.#searchTerm.set(value.trim()), SEARCH_DEBOUNCE_MS);
  }

  clearSearch(): void {
    clearTimeout(this.#searchTimer);
    this.search.set('');
    this.#searchTerm.set('');
  }

  roleIcon(name: string): string {
    return roleIcon(name);
  }
}
