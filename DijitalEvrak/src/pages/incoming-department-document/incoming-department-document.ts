import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { FlexiToastService } from 'flexi-toast';
import GenericModel from '../../../components/generic-model/generic-model';
import { IncomingDocumentService } from '../../services/incomingdocument';
import { DocumentAllocation } from '../../services/documentallocation';
import { Common } from '../../services/common';
import { ExternalInstitution, ExternalInstitutionModel } from '../../services/external-institution';
import { IncomingDocumentModel } from '../../models/incoming-document/incoming-document.model';
import { DocumentAllocationModel } from '../../models/documentallocation.model';
import { AllocationStatusEnum, AllocationStatusLabels } from '../../models/allocationstatus.model';
import { SecurityDegreeBadgeClass, SecurityDegreeIcons, SecurityDegreeLabels } from '../../models/securitydegree.model';
import { UrgencyDegreeBadgeClass, UrgencyDegreeInitials, UrgencyDegreeLabels } from '../../models/urgencydegree.model';

// Gelen evrak durumları (backend DocumentStatusEnum): 6 Yayınlanma Sırasında, 10 Yayınlandı.
const STATUS_YAYIN_SIRASINDA = 6;
const STATUS_YAYINLANDI = 10;

type ListFilter = 'all' | 'published' | 'publishing' | 'inprocess';
type SortColumn = 'qrCode' | 'subject' | 'documentDate';

/**
 * Birim Gelen Evrakları: Birim Evrak Sorumlusu'nun kendi birimine gelen evrakları
 * izlediği, Gelen Evraklar (scanlist) ekranının salt okunur ve hafif sürümü.
 * Evrak kaydı, personel atama, silme ya da OCR süzgeçleri yoktur; birim evrakları
 * listelenir, süreç akışına ve zimmet ekranına geçilir, zimmet geçmişi popup'ta okunur.
 */
@Component({
  imports: [
    GenericModel,
    CommonModule,
    FormsModule
  ],
  templateUrl: './incoming-department-document.html',
  // Kart iskeleti (st-*) Ayarlar, üst kart / arama / boş durum (sp-*) Destek,
  // istatistik kutuları / tablo / sayfalama (zl-*) Zimmetlerim, zimmet geçmişi
  // popup'ı (zh-*) Gelen Evraklar ekranıyla ortak; idd-* sınıfları bu ekrana özgü.
  styleUrls: [
    '../settings/settings.css',
    '../support/support.css',
    '../zimmetlerim/zimmetlerim.css',
    '../scanlist/scanlist.css',
    './incoming-department-document.css'
  ],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class IncomingDepartmentDocument {
  private readonly incomingDocumentService = inject(IncomingDocumentService);
  private readonly allocationService = inject(DocumentAllocation);
  private readonly toast = inject(FlexiToastService);
  private readonly common = inject(Common);
  private readonly router = inject(Router);
  private readonly externalInstitutionService = inject(ExternalInstitution);

  readonly user = computed(() => this.common.user());

  // Liste giriş yapan kullanıcının birimiyle sınırlıdır; birim bilgisi yoksa istek atılmaz.
  readonly departmentId = computed(() => this.user()?.departmentId || null);
  readonly departmentName = computed(() =>
    this.user()?.departmentName || this.user()?.departmentShortName || 'Birim'
  );

  readonly documents = signal<IncomingDocumentModel[]>([]);
  readonly loading = signal(false);

  // "Nereden" sütunu: evrakın externalInstitutionId'si dış kurum adına çevrilir (Evrak Kayıt'taki
  // Nereden alanının karşılığı). Dış kurum listesi bir kez çekilir.
  readonly externalInstitutions = signal<ExternalInstitutionModel[]>([]);
  readonly externalInstitutionMap = computed(() => {
    const map: Record<string, string> = {};
    for (const d of this.externalInstitutions()) {
      if (d.id) map[d.id.toLowerCase()] = d.name;
    }
    return map;
  });

  externalInstitutionNameOf(doc: IncomingDocumentModel): string {
    const id = doc.externalInstitutionId?.toLowerCase();
    return (id && this.externalInstitutionMap()[id]) || '';
  }

  // Gizlilik derecesi: ikonlu yuvarlak rozet (Giden Evraklar listesiyle aynı; degree-tier-* styles.css)
  readonly securityDegreeMap: Record<number, string> = SecurityDegreeLabels;
  readonly securityDegreeIconMap: Record<number, string> = SecurityDegreeIcons;
  readonly securityDegreeBadgeClassMap: Record<number, string> = SecurityDegreeBadgeClass;

  // İvedilik derecesi: baş harfli yuvarlak rozet (Giden Evraklar listesiyle aynı; degree-tier-* styles.css)
  readonly urgencyDegreeMap: Record<number, string> = UrgencyDegreeLabels;
  readonly urgencyDegreeInitialMap: Record<number, string> = UrgencyDegreeInitials;
  readonly urgencyDegreeBadgeClassMap: Record<number, string> = UrgencyDegreeBadgeClass;

  // ---- Filtre / arama / sıralama (istemci tarafı) ----
  readonly listFilter = signal<ListFilter>('all');
  readonly searchQuery = signal('');
  readonly sortColumn = signal<SortColumn | null>(null);
  readonly sortDirection = signal<'asc' | 'desc'>('asc');

  isPublished(doc: IncomingDocumentModel): boolean {
    return doc.status === STATUS_YAYINLANDI;
  }

  isPublishing(doc: IncomingDocumentModel): boolean {
    return doc.status === STATUS_YAYIN_SIRASINDA;
  }

  // Yayınlanmamış ve yayın sırasında olmayan evraklar kayıt / işlem aşamasındadır.
  isInProcess(doc: IncomingDocumentModel): boolean {
    return !this.isPublished(doc) && !this.isPublishing(doc);
  }

  statusLabel(doc: IncomingDocumentModel): string {
    if (this.isPublished(doc)) return 'Yayınlandı';
    if (this.isPublishing(doc)) return 'Yayınlanma Sırasında';
    return 'İşlemde';
  }

  statusIcon(doc: IncomingDocumentModel): string {
    if (this.isPublished(doc)) return 'check_circle';
    if (this.isPublishing(doc)) return 'hourglass_bottom';
    return 'pending';
  }

  statusClass(doc: IncomingDocumentModel): string {
    if (this.isPublished(doc)) return 'is-published';
    if (this.isPublishing(doc)) return 'is-publishing';
    return 'is-inprocess';
  }

  readonly filteredRows = computed(() => {
    const filter = this.listFilter();
    const query = this.searchQuery().trim().toLocaleLowerCase('tr');
    const column = this.sortColumn();
    const direction = this.sortDirection();

    const matches = (value?: string | null) => (value ?? '').toLocaleLowerCase('tr').includes(query);

    const filtered = this.documents()
      .filter(doc => {
        switch (filter) {
          case 'published': return this.isPublished(doc);
          case 'publishing': return this.isPublishing(doc);
          case 'inprocess': return this.isInProcess(doc);
          default: return true;
        }
      })
      .filter(doc => !query
        || matches(doc.qrCode)
        || matches(doc.orginalNo)
        || matches(doc.subject)
        || matches(this.externalInstitutionNameOf(doc)));

    if (!column) return filtered;

    const factor = direction === 'asc' ? 1 : -1;
    const time = (value?: string | Date | null) => value ? new Date(value).getTime() : 0;

    return [...filtered].sort((a, b) => {
      if (column === 'documentDate') {
        return (time(a[column]) - time(b[column])) * factor;
      }
      return (a[column] ?? '').localeCompare(b[column] ?? '', 'tr') * factor;
    });
  });

  readonly isFiltering = computed(() => !!this.searchQuery().trim() || this.listFilter() !== 'all');

  readonly totalCount = computed(() => this.documents().length);
  readonly publishedCount = computed(() => this.documents().filter(d => this.isPublished(d)).length);
  readonly publishingCount = computed(() => this.documents().filter(d => this.isPublishing(d)).length);
  readonly inProcessCount = computed(() => this.documents().filter(d => this.isInProcess(d)).length);

  setListFilter(filter: ListFilter): void {
    this.listFilter.set(filter);
    this.currentPage.set(1);
  }

  setSearchQuery(query: string): void {
    this.searchQuery.set(query);
    this.currentPage.set(1);
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.listFilter.set('all');
    this.currentPage.set(1);
  }

  toggleSort(column: SortColumn): void {
    if (this.sortColumn() === column) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('asc');
    }
    this.currentPage.set(1);
  }

  sortIcon(column: SortColumn): string {
    if (this.sortColumn() !== column) return 'unfold_more';
    return this.sortDirection() === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  // ---- Sayfalama ----
  readonly pageSize = 10;
  readonly currentPage = signal(1);

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredRows().length / this.pageSize)));

  readonly pagedRows = computed(() => {
    const page = Math.min(this.currentPage(), this.totalPages());
    const start = (page - 1) * this.pageSize;
    return this.filteredRows().slice(start, start + this.pageSize);
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
    this.filteredRows().length === 0 ? 0 : (Math.min(this.currentPage(), this.totalPages()) - 1) * this.pageSize + 1);

  readonly pageRangeEnd = computed(() =>
    Math.min(Math.min(this.currentPage(), this.totalPages()) * this.pageSize, this.filteredRows().length));

  goToPage(page: number): void {
    const clamped = Math.min(Math.max(page, 1), this.totalPages());
    if (clamped === this.currentPage()) return;
    this.currentPage.set(clamped);
  }

  constructor() {
    this.loadDocuments();
    this.externalInstitutionService.getExternalInstitutions().subscribe({
      next: (res) => this.externalInstitutions.set(res ?? []),
      error: (err) => console.error('Dış kurumlar yüklenemedi:', err)
    });
  }

  // Evraklar backend'de departmentId ile süzülür (IncomingDocuments/GetAll?departmentId=).
  loadDocuments(): void {
    const departmentId = this.departmentId();
    if (!departmentId) {
      this.documents.set([]);
      return;
    }

    this.loading.set(true);
    this.currentPage.set(1);

    this.incomingDocumentService.getAllIncomingDocuments(departmentId).subscribe({
      next: (docs) => {
        // En yeni kayıt üstte; kullanıcı sütun başlığından sıralamayı değiştirebilir.
        const sorted = [...(docs ?? [])].sort((a, b) =>
          new Date(b.createdDate ?? 0).getTime() - new Date(a.createdDate ?? 0).getTime());
        this.documents.set(sorted);
        this.loading.set(false);
      },
      error: () => {
        this.documents.set([]);
        this.loading.set(false);
        this.toast.showToast('Hata', 'Birim evrakları yüklenemedi.', 'error');
      }
    });
  }

  goToProcess(id?: string): void {
    if (!id) return;
    this.incomingDocumentService.setSelectedIncomingDocument(id);
    this.router.navigate(['/surecler']);
  }

  goToZimmet(id?: string): void {
    if (!id) return;
    this.incomingDocumentService.setZimmetIncomingDocument(id);
    this.router.navigate(['/zimmet']);
  }

  // ---- Zimmet Geçmişi popup ----
  // Gelen Evraklar ekranındaki popup'ın aynısı: evrakın mevcut ve geçmiş
  // zimmetleri salt okunur bir zaman çizelgesinde gösterilir.
  readonly zimmetHistoryVisible = signal(false);
  readonly zimmetHistoryLoading = signal(false);
  readonly zimmetHistoryDoc = signal<IncomingDocumentModel | null>(null);
  readonly zimmetHistory = signal<DocumentAllocationModel[]>([]);
  readonly activeZimmet = computed(() => this.zimmetHistory().find(h => h.isActive) ?? null);
  readonly zimmetHistoryExpanded = signal(true);
  readonly allocationStatusLabels: Record<number, string> = AllocationStatusLabels;

  readonly allocationStatusIcons: Record<number, string> = {
    [AllocationStatusEnum.IlkKayit]: 'post_add',
    [AllocationStatusEnum.Devir]: 'swap_horiz',
    [AllocationStatusEnum.Teslim]: 'handshake',
    [AllocationStatusEnum.Arsiv]: 'inventory_2',
    [AllocationStatusEnum.TeslimAlindi]: 'move_to_inbox',
    [AllocationStatusEnum.KargoyaVerildi]: 'local_shipping'
  };

  readonly allocationStatusClass: Record<number, string> = {
    [AllocationStatusEnum.IlkKayit]: 'is-ilkkayit',
    [AllocationStatusEnum.Devir]: 'is-devir',
    [AllocationStatusEnum.Teslim]: 'is-teslim',
    [AllocationStatusEnum.Arsiv]: 'is-arsiv',
    [AllocationStatusEnum.TeslimAlindi]: 'is-teslimalindi',
    [AllocationStatusEnum.KargoyaVerildi]: 'is-kargo'
  };

  initials(fullName?: string | null): string {
    const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    const first = parts[0].charAt(0);
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return `${first}${last}`.toLocaleUpperCase('tr');
  }

  openZimmetHistory(item: IncomingDocumentModel): void {
    if (!item.id) return;
    this.zimmetHistoryDoc.set(item);
    this.zimmetHistory.set([]);
    this.zimmetHistoryExpanded.set(true);
    this.zimmetHistoryVisible.set(true);
    this.zimmetHistoryLoading.set(true);

    this.allocationService.getByDocumentId(item.id).subscribe({
      next: (history) => {
        // Aktif zimmet en üstte, ardından en yeniden eskiye.
        const sorted = (history ?? [])
          .filter(h => !h.isDeleted)
          .sort((a, b) => {
            if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
            return new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime();
          });
        this.zimmetHistory.set(sorted);
        this.zimmetHistoryLoading.set(false);
      },
      error: (err) => {
        console.error('Zimmet geçmişi alınamadı:', err);
        this.zimmetHistoryLoading.set(false);
        this.toast.showToast('Hata', 'Zimmet geçmişi alınamadı', 'error');
      }
    });
  }

  closeZimmetHistory(): void {
    this.zimmetHistoryVisible.set(false);
  }

  toggleZimmetHistoryExpanded(): void {
    this.zimmetHistoryExpanded.update(v => !v);
  }
}
