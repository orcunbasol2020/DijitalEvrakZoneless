import { ChangeDetectionStrategy, Component, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { FlexiGridModule } from 'flexi-grid';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import GenericModel from '../../../../components/generic-model/generic-model';
import { FlexiToastService } from 'flexi-toast';

export interface RoleModel {
  id?: string;
  name: string;
  isActive: boolean;
  isDeleted: boolean;
  createdDate: string;
  updateDate: string;
}

export const initialRole: RoleModel = {
  name: '',
  isActive: true,
  isDeleted: false,
  createdDate: '',
  updateDate: '',
};

@Component({
  imports: [
    GenericModel,
    FlexiGridModule,
    FormsModule,
    CommonModule
  ],
  templateUrl: './role.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Role {
  readonly result = httpResource<RoleModel[]>(() => "api/Roles/GetAll", {});
  readonly data = computed(() => this.result.value() ?? []);
  readonly loading = computed(() => this.result.isLoading());
  readonly #toast = inject(FlexiToastService);
  readonly #http = inject(HttpClient);

  showFilters = false;
  readonly modalVisible = signal(false);
  readonly saving = signal(false);
  readonly editingId = signal<string | null>(null);

  form: RoleModel = { ...initialRole };

  openCreateModal() {
    this.editingId.set(null);
    this.form = { ...initialRole };
    this.modalVisible.set(true);
  }

  openEditModal(item: RoleModel) {
    this.editingId.set(item.id ?? null);
    this.form = { ...item };
    this.modalVisible.set(true);
  }

  closeModal() {
    if (this.saving()) return;
    this.modalVisible.set(false);
  }

  save() {
    if (!this.form.name?.trim()) {
      this.#toast.showToast('Uyarı', 'Rol adı zorunludur', 'warning');
      return;
    }

    this.saving.set(true);
    const id = this.editingId();

    const request$ = id
      ? this.#http.post('api/Roles/Update', { id, name: this.form.name, isActive: this.form.isActive })
      : this.#http.post('api/Roles/Create', { name: this.form.name, isActive: this.form.isActive });

    request$.subscribe({
      next: () => {
        this.#toast.showToast('Başarılı', id ? 'Rol güncellendi' : 'Rol eklendi', 'success');
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

  toggleActive(item: RoleModel) {
    if (!item.id) return;

    this.#http.post('api/Roles/Update', { id: item.id, isActive: item.isActive }).subscribe({
      error: () => {
        item.isActive = !item.isActive;
        this.#toast.showToast('Hata', 'Durum güncellenemedi', 'error');
      }
    });
  }
}


