import { ChangeDetectionStrategy, Component, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpContext, httpResource } from '@angular/common/http';
import GenericModel from '../../../../components/generic-model/generic-model';
import { FlexiToastService } from 'flexi-toast';
import { isRoleVisible, isSystemRole, normalizeRoleName, roleIcon } from '../../../services/role-service';
import { SKIP_ERROR_TOAST } from '../../../interceptors/error-interceptor';
import { incomingErrorMessage } from '../../../services/incomingdocument';

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

// Hata mesajını sayfa kendisi gösterir (backend'in Message / Errors alanı); genel toast çıkmaz
const quiet = () => ({ context: new HttpContext().set(SKIP_ERROR_TOAST, true) });

type StatusFilter = 'all' | 'active' | 'passive';

@Component({
  imports: [
    GenericModel,
    FormsModule,
    CommonModule
  ],
  templateUrl: './role.html',
  // Zimmetlerim ekranının görsel dili: kart iskeleti (st-*), boş durum (sp-*)
  // ve tablo / istatistik / modal (zl-*) setleri paylaşılır.
  styleUrls: [
    '../../settings/settings.css',
    '../../support/support.css',
    '../../zimmetlerim/zimmetlerim.css',
    './role.css'
  ],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Role {
  readonly result = httpResource<RoleModel[]>(() => "api/Roles/GetAll", {});
  // Silinmiş roller listelenmez (backend GetAll onları da döner)
  readonly data = computed(() => (this.result.value() ?? []).filter(r => !r.isDeleted));
  readonly loading = computed(() => this.result.isLoading());
  readonly #toast = inject(FlexiToastService);
  readonly #http = inject(HttpClient);

  // Aktif/pasif geçişi sunucuya gidene kadar ekranda anında görünsün diye
  // yerel olarak tutulur; hata olursa geri alınır.
  readonly #activeOverrides = signal<Record<string, boolean>>({});

  isActive(item: RoleModel): boolean {
    const override = item.id ? this.#activeOverrides()[item.id] : undefined;
    return override ?? item.isActive;
  }

  // ---- Rol görünümü: Kullanıcılar ve rol atama ekranlarıyla aynı ad, simge ve açıklama ----
  label(item: RoleModel): string {
    return normalizeRoleName(item.name ?? '');
  }

  icon(item: RoleModel): string {
    return roleIcon(this.label(item));
  }

  /** Rol atama ekranında ve rol süzgecinde gösterilir mi (Admin gizli) */
  visible(item: RoleModel): boolean {
    return isRoleVisible(this.label(item));
  }

  /** Menü / sayfa yetkilerinde kullanılan roller silinemez */
  deletable(item: RoleModel): boolean {
    return !isSystemRole(this.label(item));
  }

  // ---- Filtre / arama ----
  // Sayfa aktif rollerle açılır; Tümü / Pasif başlıktaki süzgeçten seçilir
  readonly statusFilter = signal<StatusFilter>('active');
  readonly searchQuery = signal('');
  readonly sortDirection = signal<'asc' | 'desc'>('asc');

  readonly totalCount = computed(() => this.data().length);
  readonly activeCount = computed(() => this.data().filter(r => this.isActive(r)).length);
  readonly passiveCount = computed(() => this.totalCount() - this.activeCount());

  readonly isFiltering = computed(() => !!this.searchQuery().trim() || this.statusFilter() !== 'all');

  readonly filteredRoles = computed(() => {
    const q = this.searchQuery().trim().toLocaleLowerCase('tr-TR');
    const status = this.statusFilter();
    const dir = this.sortDirection() === 'asc' ? 1 : -1;

    return this.data()
      .filter(r => status === 'all' || (status === 'active') === this.isActive(r))
      .filter(r => !q || this.label(r).toLocaleLowerCase('tr-TR').includes(q))
      .sort((a, b) => this.label(a).localeCompare(this.label(b), 'tr-TR') * dir);
  });

  setStatusFilter(value: StatusFilter): void {
    this.statusFilter.set(value);
    this.currentPage.set(1);
  }

  setSearchQuery(value: string): void {
    this.searchQuery.set(value);
    this.currentPage.set(1);
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.statusFilter.set('all');
    this.currentPage.set(1);
  }

  toggleSort(): void {
    this.sortDirection.update(d => d === 'asc' ? 'desc' : 'asc');
  }

  // ---- Sayfalama ----
  readonly pageSize = 10;
  readonly currentPage = signal(1);

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredRoles().length / this.pageSize)));

  readonly pagedRoles = computed(() => {
    const page = Math.min(this.currentPage(), this.totalPages());
    const start = (page - 1) * this.pageSize;
    return this.filteredRoles().slice(start, start + this.pageSize);
  });

  readonly pageNumbers = computed(() => {
    const total = this.totalPages();
    const current = Math.min(this.currentPage(), total);
    const delta = 2;
    const from = Math.max(1, current - delta);
    const to = Math.min(total, current + delta);
    const range: number[] = [];
    for (let i = from; i <= to; i++) range.push(i);
    return range;
  });

  readonly pageRangeStart = computed(() =>
    this.filteredRoles().length === 0 ? 0 : (Math.min(this.currentPage(), this.totalPages()) - 1) * this.pageSize + 1);

  readonly pageRangeEnd = computed(() =>
    Math.min(Math.min(this.currentPage(), this.totalPages()) * this.pageSize, this.filteredRoles().length));

  goToPage(page: number): void {
    this.currentPage.set(Math.min(Math.max(page, 1), this.totalPages()));
  }

  refresh(): void {
    this.#activeOverrides.set({});
    this.result.reload();
  }

  // ---- Ekle / düzenle penceresi ----
  readonly modalVisible = signal(false);
  readonly saving = signal(false);
  readonly editingId = signal<string | null>(null);
  /** Sistem rolünün adı değiştirilemez: menü ve sayfa yetkileri rol adıyla eşleşir */
  readonly nameLocked = signal(false);

  form: RoleModel = { ...initialRole };

  openCreateModal() {
    this.editingId.set(null);
    this.nameLocked.set(false);
    this.form = { ...initialRole };
    this.modalVisible.set(true);
  }

  openEditModal(item: RoleModel) {
    this.editingId.set(item.id ?? null);
    this.nameLocked.set(isSystemRole(item.name ?? ''));
    this.form = { ...item, isActive: this.isActive(item) };
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
      ? this.#http.post('api/Roles/Update', { id, name: this.form.name, isActive: this.form.isActive }, quiet())
      : this.#http.post('api/Roles/Create', { name: this.form.name, isActive: this.form.isActive }, quiet());

    request$.subscribe({
      next: () => {
        this.#toast.showToast('Başarılı', id ? 'Rol güncellendi' : 'Rol eklendi', 'success');
        this.saving.set(false);
        this.modalVisible.set(false);
        this.refresh();
      },
      error: (err) => {
        this.saving.set(false);
        this.#toast.showToast('Hata', incomingErrorMessage(err, 'İşlem sırasında bir hata oluştu'), 'error');
      }
    });
  }

  toggleActive(item: RoleModel) {
    if (!item.id) return;
    const id = item.id;
    const previous = this.isActive(item);
    const next = !previous;

    this.#activeOverrides.update(o => ({ ...o, [id]: next }));

    this.#http.post('api/Roles/Update', { id, name: item.name, isActive: next }, quiet()).subscribe({
      error: (err) => {
        this.#activeOverrides.update(o => ({ ...o, [id]: previous }));
        this.#toast.showToast('Hata', incomingErrorMessage(err, 'Durum güncellenemedi'), 'error');
      }
    });
  }

  /** Silme sunucuda işaretlemedir (isDeleted); role sahip kullanıcı varsa sunucu reddeder. */
  deleteRole(item: RoleModel) {
    if (!item.id || !this.deletable(item)) return;
    const id = item.id;
    this.#toast.showSwal('Rolü Sil', `"${this.label(item)}" rolü silinsin mi? Silinen rol atama ekranında görünmez.`, 'Sil', () => {
      this.#http.post('api/Roles/Delete', { id }, quiet()).subscribe({
        next: () => {
          this.#toast.showToast('Başarılı', 'Rol silindi', 'success');
          this.refresh();
        },
        error: (err) => this.#toast.showToast('Hata', incomingErrorMessage(err, 'Rol silinemedi'), 'error')
      });
    });
  }
}
