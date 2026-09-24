import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  signal,
  ViewEncapsulation,
  computed,
  inject,
  HostListener
} from '@angular/core';
import { httpResource } from '@angular/common/http';
import { Observable } from 'rxjs';
import GenericModel from '../../../components/generic-model/generic-model';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FlexiToastService } from 'flexi-toast';
import { DocumentAllocation } from '../../services/documentallocation';
import { OutgoingDocumentAllocation } from '../../services/outgoingdocumentallocation';
import { Common } from '../../services/common';
import { UserModel } from '../users/users';
import {
  ActiveDocumentModel,
  AllocationSourceEnum,
  AllocationSourceLabels,
  DocumentDirectionEnum,
  DocumentDirectionLabels
} from '../../models/activedocument.model';
import { AllocationStatusEnum, AllocationStatusLabels } from '../../models/allocationstatus.model';

type DirectionFilter = 'all' | DocumentDirectionEnum;
type SortColumn = 'qrCode' | 'documentName' | 'documentDate' | 'documentDirection';

// Geçmiş paneli: gelen (DocumentAllocations) ve giden (OutgoingDocumentAllocations)
// kayıtları aynı biçime indirgenir.
interface HistoryEntry {
  id: string;
  fullName: string;
  isActive: boolean;
  createdDate: string;
  status: AllocationStatusEnum;
}

// DocumentAllocationModel ve OutgoingDocumentAllocationModel'in ortak kesişimi
type HistorySource = HistoryEntry & { isDeleted: boolean };

@Component({
  imports: [
    GenericModel,
    FormsModule,
    CommonModule
  ],
  templateUrl: './zimmetlerim.html',
  // Kart iskeleti (st-*) Ayarlar, üst kart / arama / boş durum (sp-*) Destek
  // sayfasıyla ortak; zl-* sınıfları bu ekrana özgü
  styleUrls: ['../settings/settings.css', '../support/support.css', './zimmetlerim.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Zimmetlerim {

  private readonly allocationService = inject(DocumentAllocation);
  private readonly outgoingAllocationService = inject(OutgoingDocumentAllocation);
  private readonly toast = inject(FlexiToastService);
  private readonly common = inject(Common);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly Direction = DocumentDirectionEnum;
  readonly Source = AllocationSourceEnum;
  readonly directionLabels = DocumentDirectionLabels;
  readonly sourceLabels = AllocationSourceLabels;
  readonly statusLabels = AllocationStatusLabels;

  readonly user = computed(() => this.common.user());

  // Backend zimmet tarihine göre yeniden eskiye sıralı döner; sayfalama, arama ve
  // sıralama istemci tarafında yapıldığı için tüm kayıtlar tek seferde çekilir.
  readonly zimmetlerim = signal<ActiveDocumentModel[]>([]);

  readonly directionFilter = signal<DirectionFilter>('all');
  readonly searchQuery = signal('');
  readonly sortColumn = signal<SortColumn | null>(null);
  readonly sortDirection = signal<'asc' | 'desc'>('asc');

  readonly filteredZimmetlerim = computed(() => {
    const filter = this.directionFilter();
    const query = this.searchQuery().trim().toLocaleLowerCase('tr');
    const column = this.sortColumn();
    const direction = this.sortDirection();

    const matches = (value?: string | null) => (value ?? '').toLocaleLowerCase('tr').includes(query);

    const filtered = this.zimmetlerim()
      .filter(item => filter === 'all' || item.documentDirection === filter)
      .filter(item => !query
        || matches(item.qrCode)
        || matches(item.documentNo)
        || matches(item.documentName)
        || matches(item.fromName)
        || matches(item.toName));

    if (!column) return filtered;

    const factor = direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (column === 'documentDate') {
        const aTime = a.documentDate ? new Date(a.documentDate).getTime() : 0;
        const bTime = b.documentDate ? new Date(b.documentDate).getTime() : 0;
        return (aTime - bTime) * factor;
      }
      if (column === 'documentDirection') {
        return (a.documentDirection - b.documentDirection) * factor;
      }
      return (a[column] ?? '').localeCompare(b[column] ?? '', 'tr') * factor;
    });
  });

  readonly isFiltering = computed(() => !!this.searchQuery().trim() || this.directionFilter() !== 'all');

  clearFilters(): void {
    this.searchQuery.set('');
    this.directionFilter.set('all');
    this.currentPage.set(1);
    this.closeDetail();
  }

  setDirectionFilter(filter: DirectionFilter): void {
    this.directionFilter.set(filter);
    this.currentPage.set(1);
    this.closeDetail();
  }

  setSearchQuery(query: string): void {
    this.searchQuery.set(query);
    this.currentPage.set(1);
    this.closeDetail();
  }

  toggleSort(column: SortColumn): void {
    if (this.sortColumn() === column) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('asc');
    }
    this.currentPage.set(1);
    this.closeDetail();
  }

  sortIcon(column: SortColumn): string {
    if (this.sortColumn() !== column) return 'unfold_more';
    return this.sortDirection() === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  // Sayfalama: liste uzunsa tabloyu sayfalar.
  readonly pageSize = 10;
  readonly currentPage = signal(1);

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredZimmetlerim().length / this.pageSize)));

  readonly pagedZimmetlerim = computed(() => {
    const page = Math.min(this.currentPage(), this.totalPages());
    const start = (page - 1) * this.pageSize;
    return this.filteredZimmetlerim().slice(start, start + this.pageSize);
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
    this.filteredZimmetlerim().length === 0 ? 0 : (Math.min(this.currentPage(), this.totalPages()) - 1) * this.pageSize + 1);

  readonly pageRangeEnd = computed(() =>
    Math.min(Math.min(this.currentPage(), this.totalPages()) * this.pageSize, this.filteredZimmetlerim().length));

  goToPage(page: number): void {
    const clamped = Math.min(Math.max(page, 1), this.totalPages());
    if (clamped === this.currentPage()) return;
    this.currentPage.set(clamped);
    this.closeDetail();
  }

  readonly loading = signal(false);

  // Atlas kaynaklı zimmetler bu sistemde yönetilmez: devir ve geçmiş kapalıdır.
  isAtlas(item: ActiveDocumentModel): boolean {
    return item.source === AllocationSourceEnum.Atlas;
  }

  // "Geçmiş" paneli: seçili evrağın tüm zimmet geçmişini (kimde, ne zaman) gösterir.
  readonly expandedItem = signal<ActiveDocumentModel | null>(null);
  readonly detailHistory = signal<HistoryEntry[]>([]);
  readonly detailLoading = signal(false);
  // Panel varsayılan olarak butonun altında açılır; alta sığmıyorsa üstüne alınır.
  readonly detailPlacement = signal<'down' | 'up'>('down');

  toggleDetail(item: ActiveDocumentModel): void {
    if (this.isAtlas(item)) return;

    if (this.isExpanded(item)) {
      this.closeDetail();
      return;
    }

    this.expandedItem.set(item);
    this.detailHistory.set([]);
    this.detailLoading.set(true);
    this.detailPlacement.set('down');
    this.placeDetailPopover();

    // Gelen ve giden zimmet kayıtları farklı modellerdir; ortak alanlar üzerinden tek tipe indirgenir.
    const history$: Observable<HistorySource[]> = item.documentDirection === DocumentDirectionEnum.Giden
      ? this.outgoingAllocationService.getByDocumentId(item.documentId)
      : this.allocationService.getByDocumentId(item.documentId);

    history$.subscribe({
      next: (history) => {
        const sorted: HistoryEntry[] = (history ?? [])
          .filter(h => !h.isDeleted)
          .map(h => ({ id: h.id, fullName: h.fullName, isActive: h.isActive, createdDate: h.createdDate, status: h.status }))
          .sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime());
        this.detailHistory.set(sorted);
        this.detailLoading.set(false);
        // Geçmiş yüklenince panel uzar; yerleşim gerçek yüksekliğe göre yeniden ölçülür.
        this.placeDetailPopover();
      },
      error: () => {
        this.detailHistory.set([]);
        this.detailLoading.set(false);
      }
    });
  }

  // Sayfa içeriği sarmalayıcısı (#page-content-wrapper) overflow-x:hidden + contain:layout
  // nedeniyle altına taşan mutlak konumlu paneli kırpar; sayfa kaydırılsa da panel görünmez.
  // Bu yüzden panel render edildikten sonra ölçülür: sarmalayıcının altına taşıyorsa ve
  // üstte yer varsa butonun üstüne alınır; ardından görünüm alanına kaydırılır.
  private placeDetailPopover(): void {
    setTimeout(() => {
      const pop = this.host.nativeElement.querySelector<HTMLElement>('.zl-pop');
      if (!pop) return;

      const anchor = pop.parentElement as HTMLElement | null;
      const clip = (document.getElementById('page-content-wrapper') ?? document.body).getBoundingClientRect();
      const popRect = pop.getBoundingClientRect();
      const anchorRect = (anchor ?? pop).getBoundingClientRect();
      const bottomLimit = Math.min(clip.bottom, window.innerHeight);

      if (this.detailPlacement() === 'down' && popRect.bottom > bottomLimit) {
        const fitsAbove = anchorRect.top - popRect.height >= Math.max(clip.top, 0);
        if (fitsAbove) {
          this.detailPlacement.set('up');
        }
      }

      // Yön belirlendikten sonra panel görünür alana getirilir (gerekirse sayfa kayar).
      setTimeout(() => pop.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    });
  }

  closeDetail(): void {
    this.expandedItem.set(null);
    this.detailHistory.set([]);
    this.detailPlacement.set('down');
  }

  // Panel dışına tıklanınca kapansın (butonun ve panelin kendi click
  // handler'ları $event.stopPropagation() ile bu listener'ı tetiklemez).
  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.expandedItem()) {
      this.closeDetail();
    }
  }

  isExpanded(item: ActiveDocumentModel): boolean {
    return this.expandedItem()?.allocationId === item.allocationId;
  }

  readonly totalCount = computed(() => this.zimmetlerim().length);
  readonly incomingCount = computed(() =>
    this.zimmetlerim().filter(i => i.documentDirection === DocumentDirectionEnum.Gelen).length);
  readonly outgoingCount = computed(() =>
    this.zimmetlerim().filter(i => i.documentDirection === DocumentDirectionEnum.Giden).length);

  readonly usersResult = httpResource<UserModel[]>(() => 'api/Users/GetAll');
  readonly personFilter = signal('');
  readonly personList = computed(() => {
    const query = this.personFilter().trim().toLocaleLowerCase('tr');
    return (this.usersResult.value() ?? [])
      .filter(u => !u.isDeleted && u.isActive && u.id !== this.currentUserId)
      .filter(u => !query || `${u.name} ${u.surname}`.toLocaleLowerCase('tr').includes(query));
  });

  readonly transferModalVisible = signal(false);
  readonly transferLoading = signal(false);
  readonly selectedPersonId = signal<string | null>(null);
  readonly transferItem = signal<ActiveDocumentModel | null>(null);

  // Devir penceresindeki avatar: ad ve soyadın baş harfleri
  initials(p: UserModel): string {
    return `${p.name?.[0] ?? ''}${p.surname?.[0] ?? ''}`.toLocaleUpperCase('tr');
  }

  get currentUserId(): string | undefined {
    return this.user()?.id;
  }

  constructor() {
    this.loadZimmetlerim();
  }

  loadZimmetlerim(): void {
    this.closeDetail();
    this.currentPage.set(1);
    const currentUserId = this.currentUserId;
    if (!currentUserId) {
      this.zimmetlerim.set([]);
      return;
    }

    this.loading.set(true);
    this.allocationService.getActiveDocumentsByUserId(currentUserId).subscribe({
      next: (res) => {
        this.zimmetlerim.set(res?.items ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.zimmetlerim.set([]);
        this.loading.set(false);
      }
    });
  }

  openTransferModal(item: ActiveDocumentModel) {
    if (this.isAtlas(item)) return;

    this.transferItem.set(item);
    this.selectedPersonId.set(null);
    this.personFilter.set('');
    this.transferModalVisible.set(true);
  }

  closeTransferModal() {
    this.transferModalVisible.set(false);
    this.transferItem.set(null);
    this.selectedPersonId.set(null);
    this.personFilter.set('');
  }

  // Zimmet devri: kişiden kişiye geçtiği için status Devir (2) yazılır.
  // Gelen evrakta backend yeni kayıt açılınca eskisini pasife çeker; giden evrakta
  // reallocate önce mevcut aktif zimmetleri kapatıp sonra yenisini oluşturur.
  async confirmTransfer() {
    const personId = this.selectedPersonId();
    if (!personId) {
      this.toast.showToast('Uyarı', 'Lütfen devredilecek personeli seçiniz.', 'warning');
      return;
    }

    const item = this.transferItem();
    const createdUserId = this.currentUserId;
    if (!item || !createdUserId) {
      this.toast.showToast('Hata', 'Evrak bulunamadı.', 'error');
      return;
    }

    this.transferLoading.set(true);

    try {
      if (item.documentDirection === DocumentDirectionEnum.Giden) {
        await this.outgoingAllocationService.reallocate({
          outgoingDocumentId: item.documentId,
          userId: personId,
          createdUserId,
          status: AllocationStatusEnum.Devir,
          userType: 1
        });
      } else {
        await new Promise<void>((resolve, reject) =>
          this.allocationService.createAllocation({
            incomingDocumentId: item.documentId,
            userId: personId,
            createdUserId,
            status: AllocationStatusEnum.Devir,
            userType: 1
          }).subscribe({ next: () => resolve(), error: reject })
        );
      }

      this.transferLoading.set(false);
      this.toast.showToast('Başarılı', 'Zimmet devri tamamlandı', 'success');
      this.closeTransferModal();
      this.loadZimmetlerim();
    } catch {
      this.transferLoading.set(false);
      this.toast.showToast('Hata', 'Zimmet devri başarısız', 'error');
    }
  }
}
