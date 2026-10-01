import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { FlexiGridFilterDataModel, FlexiGridModule } from 'flexi-grid';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import GenericModel from '../../../components/generic-model/generic-model';
import { UserService } from '../../services/user';
import { normalizeRoleName } from '../../services/role-service';
import { RoleModel } from './role/role';

export interface UserModel{
  id?: string;
  name: string;
  surname: string;
  email: string;
  userName: string;
  departmentId: string;
  departmentName: string;
  departmentShortName: string;
  isActive: boolean;
  isDeleted: boolean;
  createDate: string;
  updateDate: string;
  password?: string;
  /** Kullanıcının etkin rolleri; yalnızca Users/GetAll doldurur (GetById'de null gelir). */
  roles?: UserRoleRef[] | null;
}

export interface UserRoleRef {
  id: string;
  name: string;
}

/** Listede gösterilen satır: rol adları ızgara araması ve Excel çıktısı için tek metne çevrilir. */
type UserRow = UserModel & { roleNames: string };

/** Rol rozetlerinin simgeleri; listede olmayan roller varsayılan simgeyle gösterilir. */
const ROLE_ICONS: Record<string, string> = {
  'Admin': 'admin_panel_settings',
  'Yönetici': 'shield_person',
  'Birim Yöneticisi': 'supervisor_account',
  'Birim Evrak Sorumlusu': 'badge',
  'Gelen Evrak': 'move_to_inbox',
  'Giden Evrak': 'outbox',
  'Ön Kayıt': 'app_registration',
  'Misyon Yetkilisi': 'flag',
  'Misyon Evrak Sorumlusu': 'public',
  'Kurye': 'local_shipping',
  'Kurye Takip': 'share_location',
};

/** Rol filtresinde "rolü olmayan kullanıcılar" seçeneği. */
const NO_ROLE = 'none';

export const initialUser:UserModel = {
  name: "",
  surname: "",
  email: "",
  userName: "",
  departmentId: "",
  departmentName: "",
  departmentShortName: "",
  isActive: true,
  isDeleted: false,
  createDate: "",
  updateDate: "",
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
  readonly result = httpResource<UserModel[]>(() => "api/Users/GetAll");
  readonly loading = computed(() => this.result.isLoading());

  readonly rolesResult = httpResource<RoleModel[]>(() => "api/Roles/GetAll");
  readonly roleOptions = computed(() =>
    (this.rolesResult.value() ?? [])
      .filter(r => r.isActive && !r.isDeleted && r.id)
      .map(r => ({ id: r.id!.toLowerCase(), name: normalizeRoleName(r.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr')));

  readonly NO_ROLE = NO_ROLE;
  /** Boş: tüm kullanıcılar; NO_ROLE: rolü olmayanlar; aksi halde rol id'si (küçük harf). */
  readonly roleFilter = signal<string>('');

  private readonly rows = computed<UserRow[]>(() =>
    (this.result.value() ?? []).map(u => ({
      ...u,
      roles: (u.roles ?? []).map(r => ({ ...r, name: normalizeRoleName(r.name) })),
      roleNames: (u.roles ?? []).map(r => normalizeRoleName(r.name)).join(', ')
    })));

  // Users/GetAll id'leri büyük harfle, Roles/GetAll küçük harfle döndürüyor; karşılaştırma küçük harfle yapılır.
  readonly data = computed(() => {
    const filter = this.roleFilter();
    const rows = this.rows();
    if (!filter) return rows;
    if (filter === NO_ROLE) return rows.filter(u => !u.roles?.length);
    return rows.filter(u => u.roles?.some(r => r.id.toLowerCase() === filter));
  });
  /** Birimi sütununun seçmeli filtresi: listedeki kullanıcıların birimleri, alfabetik. */
  readonly departmentFilterData = computed<FlexiGridFilterDataModel[]>(() =>
    [...new Set(this.rows().map(u => u.departmentName).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'tr'))
      .map(name => ({ value: name, name })));
  showFilters = false;
  readonly #userService = inject(UserService);

  roleIcon(name: string): string {
    return ROLE_ICONS[name] ?? 'verified_user';
  }

  changeIsAdmin(data:UserRow){
    this.#userService.update(this.toUpdatePayload(data)).subscribe(() => {
      this.result.reload();
    });
  }

  changeIsActive(data:UserRow){
    this.#userService.update(this.toUpdatePayload(data)).subscribe(() => {
      this.result.reload();
    });
  }

  /** Satıra eklenen rol alanları güncelleme isteğine gönderilmez. */
  private toUpdatePayload({ roles, roleNames, ...user }: UserRow) {
    return user as Partial<UserModel> & { id: string };
  }
}
