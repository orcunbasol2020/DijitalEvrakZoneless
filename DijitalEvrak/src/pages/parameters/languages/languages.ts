import { ChangeDetectionStrategy, Component, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { FlexiGridModule } from 'flexi-grid';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FlexiToastService } from 'flexi-toast';
import GenericModel from '../../../../components/generic-model/generic-model';
import { Language, LanguageModel, initialLanguage } from '../../../services/language';

@Component({
  imports: [
    GenericModel,
    FlexiGridModule,
    FormsModule,
    CommonModule
  ],
  templateUrl: './languages.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Languages {
  readonly #languageService = inject(Language);
  readonly #toast = inject(FlexiToastService);

  readonly result = httpResource<LanguageModel[]>(() => "api/Languages/GetAll", {});
  readonly data = computed(() => this.result.value() ?? []);
  readonly loading = computed(() => this.result.isLoading());

  showFilters = false;
  readonly modalVisible = signal(false);
  readonly saving = signal(false);
  readonly editingId = signal<string | null>(null);

  form: LanguageModel = { ...initialLanguage };

  openCreateModal() {
    this.editingId.set(null);
    this.form = { ...initialLanguage };
    this.modalVisible.set(true);
  }

  openEditModal(item: LanguageModel) {
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
      this.#toast.showToast('Uyarı', 'Dil adı zorunludur', 'warning');
      return;
    }

    this.saving.set(true);
    const id = this.editingId();

    const request$ = id
      ? this.#languageService.update({ id, name: this.form.name, ocrSupport: this.form.ocrSupport, isActive: this.form.isActive })
      : this.#languageService.create({ name: this.form.name, ocrSupport: this.form.ocrSupport, isActive: this.form.isActive });

    request$.subscribe({
      next: () => {
        this.#toast.showToast('Başarılı', id ? 'Dil güncellendi' : 'Dil eklendi', 'success');
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

  toggleActive(item: LanguageModel) {
    if (!item.id) return;

    this.#languageService.update({ id: item.id, isActive: item.isActive }).subscribe({
      error: () => {
        item.isActive = !item.isActive;
        this.#toast.showToast('Hata', 'Durum güncellenemedi', 'error');
      }
    });
  }

  delete(item: LanguageModel) {
    if (!item.id) return;

    this.#toast.showSwal('Sil', `"${item.name}" dilini silmek istiyor musunuz?`, 'Sil', () => {
      this.#languageService.delete(item.id!).subscribe({
        next: () => {
          this.#toast.showToast('Başarılı', 'Dil silindi', 'success');
          this.result.reload();
        },
        error: () => {
          this.#toast.showToast('Hata', 'Silme işlemi başarısız', 'error');
        }
      });
    });
  }
}
