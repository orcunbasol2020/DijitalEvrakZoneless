import { ChangeDetectionStrategy, Component, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { Router } from '@angular/router';
import GenericModel from '../../../../components/generic-model/generic-model';
import { FlexiGridModule } from 'flexi-grid';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FlexiToastService } from 'flexi-toast';
import { ExternalUserService, ExternalUserModel, initialExternalUser } from '../../../services/external-user';
import { ExternalInstitution, ExternalInstitutionModel } from '../../../services/external-institution';

@Component({
  imports: [
    GenericModel,
    FlexiGridModule,
    FormsModule,
    CommonModule
  ],
  templateUrl: './externaluser.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Externaluser {
  readonly #userService = inject(ExternalUserService);
  readonly #institutionService = inject(ExternalInstitution);
  readonly #toast = inject(FlexiToastService);
  readonly #router = inject(Router);

  readonly result = httpResource<ExternalUserModel[]>(() => "api/ExternalUsers/GetAll");
  readonly data = computed(() => this.result.value() ?? []);
  readonly loading = computed(() => this.result.isLoading());

  readonly institutionsResult = httpResource<ExternalInstitutionModel[]>(() => "api/ExternalInstitutions/GetAll");
  readonly institutions = computed(() => this.institutionsResult.value() ?? []);

  readonly userTypeMap: Record<number, string> = {
    1: 'Standart',
    2: 'Yetkili'
  };

  showFilters = false;
  readonly modalVisible = signal(false);
  readonly saving = signal(false);
  readonly editingId = signal<string | null>(null);

  form: ExternalUserModel = { ...initialExternalUser };

  institutionName(institutionId?: string | null): string {
    if (!institutionId) return '-';
    return this.institutions().find(item => item.id === institutionId)?.name ?? '-';
  }

  openZimmetler(item: ExternalUserModel) {
    this.#router.navigate(['/externaluser', item.id, 'zimmetler']);
  }

  openCreateModal() {
    this.editingId.set(null);
    this.form = { ...initialExternalUser };
    this.modalVisible.set(true);
  }

  openEditModal(item: ExternalUserModel) {
    this.editingId.set(item.id ?? null);
    this.form = { ...item };
    this.modalVisible.set(true);
  }

  closeModal() {
    if (this.saving()) return;
    this.modalVisible.set(false);
  }

  save() {
    if (!this.form.name?.trim() || !this.form.surname?.trim()) {
      this.#toast.showToast('Uyarı', 'Ad ve soyad zorunludur', 'warning');
      return;
    }

    if (!this.form.email?.trim()) {
      this.#toast.showToast('Uyarı', 'E-posta zorunludur', 'warning');
      return;
    }

    if (!this.form.externalInstitutionId) {
      this.#toast.showToast('Uyarı', 'Kurum seçimi zorunludur', 'warning');
      return;
    }

    this.saving.set(true);
    const id = this.editingId();

    const body: Partial<ExternalUserModel> = {
      name: this.form.name,
      surname: this.form.surname,
      email: this.form.email,
      identityNo: this.form.identityNo,
      userType: this.form.userType,
      externalInstitutionId: this.form.externalInstitutionId,
      isActive: this.form.isActive
    };

    const request$ = id
      ? this.#userService.update({ ...body, id })
      : this.#userService.create(body);

    request$.subscribe({
      next: () => {
        this.#toast.showToast('Başarılı', id ? 'Kullanıcı güncellendi' : 'Kullanıcı eklendi', 'success');
        this.saving.set(false);
        this.modalVisible.set(false);
        this.result.reload();
      },
      error: () => {
        this.saving.set(false);
        this.#toast.showToast('Hata', 'İşlem sırasında bir hata oluştu', 'error');
      }
    });
  }

  delete(item: ExternalUserModel) {
    if (!item.id) return;

    this.#toast.showSwal('Sil', `"${item.name} ${item.surname}" kullanıcısını silmek istiyor musunuz?`, 'Sil', () => {
      this.#userService.delete(item.id).subscribe({
        next: () => {
          this.#toast.showToast('Başarılı', 'Kullanıcı silindi', 'success');
          this.result.reload();
        },
        error: () => {
          this.#toast.showToast('Hata', 'Silme işlemi başarısız', 'error');
        }
      });
    });
  }

  onIsActiveChange(item: ExternalUserModel) {
    this.#userService.update({
      id: item.id,
      isActive: item.isActive
    }).subscribe(() => {
      this.result.reload();
    });
  }
}
