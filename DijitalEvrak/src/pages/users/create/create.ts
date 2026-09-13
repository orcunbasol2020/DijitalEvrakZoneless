import { ChangeDetectionStrategy, Component, computed, effect, HostListener, inject, linkedSignal, resource, signal, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { httpResource } from '@angular/common/http';
import GenericModel from '../../../../components/generic-model/generic-model';
import { forkJoin, lastValueFrom, Observable } from 'rxjs';
import { initialUser, UserModel } from '../users';
import { RoleModel } from '../role/role';
import { ActivatedRoute, CanDeactivateFn, Router } from '@angular/router';
import { FlexiToastService } from 'flexi-toast';
import { FormControl, FormsModule, NgForm, ReactiveFormsModule, Validators } from '@angular/forms';
import { BreadcrumbModel } from '../../layouts/breadcrumb/breadcrumb';
import { UserService } from '../../../services/user';
import { Department, DepartmentModel } from '../../../services/department';
import { UserRoleService } from '../../../services/user-role';
import { SimpleAutocompleteComponent } from '../../simpleautocomplete/simpleautocomplete';

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

@Component({
  imports: [
    GenericModel,
    FormsModule,
    ReactiveFormsModule,
    CommonModule,
    SimpleAutocompleteComponent
  ],
  templateUrl: './create.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Create {
  readonly id = signal<string | undefined>(undefined);

  readonly result = resource({
    params: () => this.id(),
    loader: async ({ params }) => {
      var res = await lastValueFrom(this.#userService.getById(params!));
      this.initialSnapshot.set(JSON.stringify(res));
      this.breadcrumbs.update(prev => [...prev,
      { title: res.userName, url: `/users/edit/${params}`, icon: 'edit' },]);
      return res;
    }
  });

  readonly departmentsResult = resource({
    loader: async () => await lastValueFrom(this.#departmentService.getDepartments())
  });
  readonly departments = computed(() => this.departmentsResult.value() ?? []);

  readonly rolesResult = httpResource<RoleModel[]>(() => "api/Roles/GetAll", {});
  readonly assignableRoles = computed(() =>
    (this.rolesResult.value() ?? []).filter(r => r.isActive && !r.isDeleted));

  readonly userRoleNamesResult = resource({
    params: () => this.id(),
    loader: async ({ params }) => await lastValueFrom(this.#userRoleService.getRolesByUserId(params!))
  });

  readonly initialSelectedRoleIds = computed(() => {
    const names = new Set(this.userRoleNamesResult.value() ?? []);
    return new Set(this.assignableRoles().filter(r => names.has(r.name)).map(r => r.id!));
  });

  readonly selectedRoleIds = linkedSignal(() => this.initialSelectedRoleIds());

  readonly data = linkedSignal(() => this.result.value() ?? { ...initialUser });
  readonly #userService = inject(UserService);
  readonly #departmentService = inject(Department);
  readonly #userRoleService = inject(UserRoleService);
  readonly #activated = inject(ActivatedRoute);
  readonly isEdit = computed(() => !!this.id());
  readonly title = computed(() => this.isEdit() ? 'Kullanıcı Güncelle' : 'Kullanıcı Ekle');
  readonly btnName = computed(() => this.isEdit() ? 'Güncelle' : 'Kaydet');
  readonly #router = inject(Router);
  readonly #toast = inject(FlexiToastService);
  readonly breadcrumbs = signal<BreadcrumbModel[]>([
    { title: 'Kullanıcılar', url: '/users', icon: 'group' },
  ]);

  readonly loadingUser = computed(() => this.isEdit() && this.result.isLoading());
  readonly saving = signal(false);
  readonly savingRoles = signal(false);
  password = '';

  readonly initialSnapshot = signal<string>(JSON.stringify(initialUser));
  readonly isDirty = computed(() => {
    const userDirty = JSON.stringify(this.data()) !== this.initialSnapshot();
    const rolesDirty = !setsEqual(this.selectedRoleIds(), this.initialSelectedRoleIds());
    return userDirty || !!this.password || rolesDirty;
  });

  readonly formError = signal<string | null>(null);
  readonly userNameError = signal<string | null>(null);
  readonly emailError = signal<string | null>(null);

  readonly departmentControl = new FormControl<DepartmentModel | null>(null, Validators.required);

  constructor() {
    this.#activated.params.subscribe(res => {
      if (res['id']) {
        this.id.set(res['id']);
      } else {
        this.breadcrumbs.update(prev => [...prev,
        { title: 'Ekle', url: '/users/create', icon: 'add' },])
      }
    });

    effect(() => {
      const departments = this.departments();
      const currentId = this.data().departmentId;
      const match = departments.find(d => d.id === currentId) ?? null;
      if (this.departmentControl.value?.id !== match?.id) {
        this.departmentControl.setValue(match, { emitEvent: false });
      }
    });

    this.departmentControl.valueChanges.subscribe(value => {
      this.data.update(prev => ({ ...prev, departmentId: value?.id ?? '' }));
    });
  }

  cancel() {
    if (this.isDirty() && !confirm('Kaydedilmemiş değişiklikleriniz var. Sayfadan çıkmak istediğinize emin misiniz?')) {
      return;
    }
    this.#router.navigateByUrl('/users');
  }

  canDeactivate(): boolean {
    if (!this.isDirty()) return true;
    return confirm('Kaydedilmemiş değişiklikleriniz var. Sayfadan çıkmak istediğinize emin misiniz?');
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    if (this.isDirty()) {
      event.preventDefault();
      event.returnValue = true;
    }
  }

  private extractErrorMessage(err: any, fallback: string): string {
    return err?.error?.message || err?.error?.title || (typeof err?.error === 'string' ? err.error : null) || fallback;
  }

  private handleSaveError(err: any, fallback: string) {
    this.userNameError.set(null);
    this.emailError.set(null);
    this.formError.set(null);

    const message = this.extractErrorMessage(err, fallback);
    const lower = message.toLocaleLowerCase('tr');

    if (lower.includes('kullanıcı adı') || lower.includes('username')) {
      this.userNameError.set(message);
    } else if (lower.includes('mail') || lower.includes('email')) {
      this.emailError.set(message);
    } else {
      this.formError.set(message);
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

  save(form: NgForm) {
    if (!this.departmentControl.value) {
      this.departmentControl.markAsTouched();
    }
    if (!form.valid || !this.departmentControl.value || this.saving()) return;

    this.formError.set(null);
    this.userNameError.set(null);
    this.emailError.set(null);

    this.data.update((prev) =>
      ({ ...prev, fullName: `${prev.name} ${prev.surname}`, departmentId: this.departmentControl.value?.id ?? '' }));

    this.saving.set(true);

    if (!this.id()) {
      this.#userService.create({ ...this.data(), password: this.password }).subscribe({
        next: (createdUser) => {
          this.saving.set(false);
          this.password = '';
          this.initialSnapshot.set(JSON.stringify(this.data()));
          this.#toast.showToast("Başarılı", "Kullanıcı başarıyla kaydedildi");

          const newId = createdUser?.id;
          if (newId) {
            this.#router.navigateByUrl(`/users/edit/${newId}`);
          } else {
            this.#router.navigateByUrl("/users");
          }
        },
        error: (err) => {
          this.saving.set(false);
          this.handleSaveError(err, "Kullanıcı kaydedilirken bir hata oluştu");
        }
      });
    } else {
      const updatePayload = { ...this.data(), id: this.id()! };
      console.log('[DEBUG update payload]', JSON.stringify(updatePayload));
      this.#userService.update(updatePayload).subscribe({
        next: (res) => {
          console.log('[DEBUG update response]', JSON.stringify(res));
          this.saving.set(false);
          this.initialSnapshot.set(JSON.stringify(this.data()));
          this.#toast.showToast("Başarılı", "Kullanıcı başarıyla güncellendi");
        },
        error: (err) => {
          this.saving.set(false);
          this.handleSaveError(err, "Kullanıcı güncellenirken bir hata oluştu");
        }
      });
    }
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
