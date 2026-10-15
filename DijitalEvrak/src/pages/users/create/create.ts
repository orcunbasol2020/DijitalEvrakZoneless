import { ChangeDetectionStrategy, Component, computed, HostListener, inject, linkedSignal, resource, signal, ViewEncapsulation } from '@angular/core';
import { httpResource } from '@angular/common/http';
import GenericModel from '../../../../components/generic-model/generic-model';
import { forkJoin, lastValueFrom, Observable } from 'rxjs';
import { RoleModel } from '../role/role';
import { ActivatedRoute, CanDeactivateFn, Router } from '@angular/router';
import { FlexiToastService } from 'flexi-toast';
import { BreadcrumbModel } from '../../layouts/breadcrumb/breadcrumb';
import { UserService } from '../../../services/user';
import { UserRoleService } from '../../../services/user-role';
import { isRoleVisible, normalizeRoleName, roleDescription, roleIcon } from '../../../services/role-service';

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

/**
 * Kullanıcı rolleri. Kullanıcılar kaynak sistemden (ComAuthorizationUser) gelir: ad, e-posta, birim ve
 * aktiflik burada yalnızca gösterilir. Bu sistemde yönetilen tek şey rol atamasıdır.
 */
@Component({
  imports: [GenericModel],
  templateUrl: './create.html',
  styleUrl: './create.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Create {
  readonly #userService = inject(UserService);
  readonly #userRoleService = inject(UserRoleService);
  readonly #router = inject(Router);
  readonly #toast = inject(FlexiToastService);

  readonly id = signal<string | undefined>(undefined);

  readonly result = resource({
    params: () => this.id(),
    loader: async ({ params }) => {
      const res = await lastValueFrom(this.#userService.getById(params!));
      this.breadcrumbs.update(prev => [...prev.slice(0, 1),
      { title: res.userName, url: `/users/edit/${params}`, icon: 'manage_accounts' }]);
      return res;
    }
  });
  readonly user = computed(() => this.result.value());
  readonly loadingUser = computed(() => this.result.isLoading());

  readonly rolesResult = httpResource<RoleModel[]>(() => "api/Roles/GetAll", {});
  readonly assignableRoles = computed(() =>
    (this.rolesResult.value() ?? [])
      .filter(r => r.isActive && !r.isDeleted && isRoleVisible(normalizeRoleName(r.name)))
      .map(r => {
        const label = normalizeRoleName(r.name);
        return { ...r, label, icon: roleIcon(label), description: roleDescription(label) };
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'tr')));

  readonly userRoleNamesResult = resource({
    params: () => this.id(),
    loader: async ({ params }) => await lastValueFrom(this.#userRoleService.getRolesByUserId(params!))
  });

  readonly initialSelectedRoleIds = computed(() => {
    const names = new Set(this.userRoleNamesResult.value() ?? []);
    return new Set(this.assignableRoles().filter(r => names.has(r.name)).map(r => r.id!));
  });

  readonly selectedRoleIds = linkedSignal(() => this.initialSelectedRoleIds());
  readonly savingRoles = signal(false);
  readonly isDirty = computed(() => !setsEqual(this.selectedRoleIds(), this.initialSelectedRoleIds()));
  readonly selectedCount = computed(() => this.selectedRoleIds().size);

  readonly breadcrumbs = signal<BreadcrumbModel[]>([
    { title: 'Kullanıcılar', url: '/users', icon: 'group' },
  ]);

  constructor() {
    inject(ActivatedRoute).params.subscribe(res => this.id.set(res['id']));
  }

  back() {
    if (this.isDirty() && !confirm('Kaydedilmemiş rol değişiklikleriniz var. Sayfadan çıkmak istediğinize emin misiniz?')) {
      return;
    }
    this.#router.navigateByUrl('/users');
  }

  canDeactivate(): boolean {
    if (!this.isDirty()) return true;
    return confirm('Kaydedilmemiş rol değişiklikleriniz var. Sayfadan çıkmak istediğinize emin misiniz?');
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    if (this.isDirty()) {
      event.preventDefault();
      event.returnValue = true;
    }
  }

  isRoleSelected(roleId: string): boolean {
    return this.selectedRoleIds().has(roleId);
  }

  toggleRole(roleId: string, checked: boolean) {
    this.selectedRoleIds.update(prev => {
      const next = new Set(prev);
      if (checked) next.add(roleId); else next.delete(roleId);
      return next;
    });
  }

  saveRoles() {
    const userId = this.id();
    if (!userId || this.savingRoles()) return;

    const current = this.selectedRoleIds();
    const initial = this.initialSelectedRoleIds();
    const toRemove = [...initial].filter(roleId => !current.has(roleId));

    const requests: Observable<any>[] = [];
    if (current.size > 0) {
      requests.push(this.#userRoleService.assignRoles(userId, [...current]));
    }
    toRemove.forEach(roleId => requests.push(this.#userRoleService.removeRole(userId, roleId)));

    if (requests.length === 0) {
      this.#toast.showToast("Bilgi", "Rollerde bir değişiklik yok");
      return;
    }

    this.savingRoles.set(true);

    forkJoin(requests).subscribe({
      next: () => {
        this.savingRoles.set(false);
        this.#toast.showToast("Başarılı", "Roller güncellendi");
        this.userRoleNamesResult.reload();
      },
      error: () => {
        this.savingRoles.set(false);
        this.#toast.showToast("Hata", "Roller güncellenirken bir hata oluştu", "error");
      }
    });
  }
}

export const canDeactivateCreate: CanDeactivateFn<Create> = (component) => component.canDeactivate();
