import { ChangeDetectionStrategy, Component, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { ExternalInstitution, ExternalInstitutionModel, initialExternalInstitution } from '../../../services/external-institution';
import { FlexiToastService } from 'flexi-toast';
import GenericModel from '../../../../components/generic-model/generic-model';
import { FlexiGridModule } from 'flexi-grid';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  imports: [
    GenericModel,
    FlexiGridModule,
    FormsModule,
    CommonModule
  ],
  templateUrl: './external-institutions.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ExternalInstitutions {
  readonly #institutionService = inject(ExternalInstitution);
  readonly #toast = inject(FlexiToastService);

  readonly result = httpResource<ExternalInstitutionModel[]>(() => "api/ExternalInstitutions/GetAll");
  readonly data = computed(() => this.result.value() ?? []);
  readonly loading = computed(() => this.result.isLoading());

  // Modal veya filtre açma durumu
  showFilters = false;
  readonly modalVisible = signal(false);
  readonly saving = signal(false);
  readonly editingId = signal<string | null>(null);

  form: ExternalInstitutionModel = { ...initialExternalInstitution };

  typeMap: any = {
    1: 'Misyon',
    2: 'Kurum',
    3: 'Şahıs'
  };

  // Ebeveyn seçiminde düzenlenen kaydın kendisi listelenmesin
  readonly parentOptions = computed(() =>
    this.data().filter(item => item.id !== this.editingId())
  );

  parentName(parentId?: string | null): string {
    if (!parentId) return '-';
    return this.data().find(item => item.id === parentId)?.name ?? '-';
  }

  openCreateModal() {
    this.editingId.set(null);
    this.form = { ...initialExternalInstitution };
    this.modalVisible.set(true);
  }

  openEditModal(item: ExternalInstitutionModel) {
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
      this.#toast.showToast('Uyarı', 'Kurum adı zorunludur', 'warning');
      return;
    }

    this.saving.set(true);
    const id = this.editingId();

    const request$ = id
      ? this.#institutionService.update({ id, name: this.form.name, type: this.form.type, address: this.form.address, parentId: this.form.parentId })
      : this.#institutionService.create({ name: this.form.name, type: this.form.type, address: this.form.address, parentId: this.form.parentId });

    request$.subscribe({
      next: () => {
        this.#toast.showToast('Başarılı', id ? 'Kurum güncellendi' : 'Kurum eklendi', 'success');
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

  delete(item: ExternalInstitutionModel) {
    if (!item.id) return;

    this.#toast.showSwal('Sil', `"${item.name}" kurumunu silmek istiyor musunuz?`, 'Sil', () => {
      this.#institutionService.delete(item.id).subscribe({
        next: () => {
          this.#toast.showToast('Başarılı', 'Kurum silindi', 'success');
          this.result.reload();
        },
        error: () => {
          this.#toast.showToast('Hata', 'Silme işlemi başarısız', 'error');
        }
      });
    });
  }
}
