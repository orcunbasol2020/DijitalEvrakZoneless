import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, ViewEncapsulation } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { Router } from '@angular/router';
import GenericModel from '../../../../components/generic-model/generic-model';
import { FlexiGridModule } from 'flexi-grid';
import { FormControl, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FlexiToastService } from 'flexi-toast';
import { ExternalUserService, ExternalUserModel, initialExternalUser } from '../../../services/external-user';
import { ExternalInstitution, INSTITUTION_MIN_SEARCH, institutionSearch } from '../../../services/external-institution';
import { ExternalInstitutionId } from '../../../models/ids';
import { SimpleAutocompleteComponent } from '../../simpleautocomplete/simpleautocomplete';

@Component({
  imports: [
    GenericModel,
    FlexiGridModule,
    FormsModule,
    CommonModule,
    SimpleAutocompleteComponent
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

  // Kurumlar (~160.000) indirilmez. Personel cevabında kurum adı olmadığı için listedeki kurumların
  // adları tek tek alınır (personel sayısı az); kurum seçici sunucuda arar.
  readonly #institutionNames = signal(new Map<ExternalInstitutionId, string>());
  readonly institutionSearch = institutionSearch();
  readonly institutionMinSearch = INSTITUTION_MIN_SEARCH;
  readonly institutionOptions = computed(() =>
    this.institutionSearch.options().map(i => ({ id: i.id, name: i.name })));
  readonly institutionControl = new FormControl<{ id: ExternalInstitutionId; name: string } | null>(null);

  constructor() {
    effect(() => {
      const known = this.#institutionNames();
      const missing = new Set<ExternalInstitutionId>();
      for (const u of this.data()) {
        const id = u.externalInstitutionId;
        if (id !== null && id !== undefined && !known.has(id)) missing.add(id);
      }
      for (const id of missing) this.#loadInstitutionName(id);
    });
  }

  #requestedNames = new Set<ExternalInstitutionId>();
  #loadInstitutionName(id: ExternalInstitutionId): void {
    if (this.#requestedNames.has(id)) return;
    this.#requestedNames.add(id);
    this.#institutionService.getExternalInstitutionById(id).subscribe({
      next: (inst) => this.#institutionNames.update(m => new Map(m).set(id, inst?.name ?? '-')),
      // Kaynakta kapatılmış / bulunamayan kurum
      error: () => this.#institutionNames.update(m => new Map(m).set(id, '-')),
    });
  }

  readonly userTypeMap: Record<number, string> = {
    1: 'Standart',
    2: 'Yetkili'
  };

  showFilters = false;
  readonly modalVisible = signal(false);
  readonly saving = signal(false);
  readonly editingId = signal<string | null>(null);

  form: ExternalUserModel = { ...initialExternalUser };

  institutionName(institutionId?: ExternalInstitutionId | null): string {
    if (institutionId === null || institutionId === undefined) return '-';
    return this.#institutionNames().get(institutionId) ?? '…';
  }

  openZimmetler(item: ExternalUserModel) {
    this.#router.navigate(['/externaluser', item.id, 'zimmetler']);
  }

  openCreateModal() {
    this.editingId.set(null);
    this.form = { ...initialExternalUser };
    this.institutionControl.setValue(null);
    this.modalVisible.set(true);
  }

  openEditModal(item: ExternalUserModel) {
    this.editingId.set(item.id ?? null);
    this.form = { ...item };
    const id = item.externalInstitutionId;
    this.institutionControl.setValue(id !== null && id !== undefined ? { id, name: this.institutionName(id) } : null);
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

    const institution = this.institutionControl.value;
    this.form.externalInstitutionId = institution?.id ?? null;
    if (!institution) {
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
        if (institution) this.#institutionNames.update(m => new Map(m).set(institution.id, institution.name));
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
