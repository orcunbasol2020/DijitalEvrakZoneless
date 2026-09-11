import {
  ChangeDetectionStrategy,
  Component,
  signal,
  ViewEncapsulation,
  computed,
  inject,
  HostListener
} from '@angular/core';
import { httpResource } from '@angular/common/http';
import GenericModel from '../../../components/generic-model/generic-model';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FlexiToastService } from 'flexi-toast';
import { DocumentAllocation } from '../../services/documentallocation';
import { DocumentAssignmentService } from '../../services/documentassignment';
import { AtlasZimmetService } from '../../services/atlas-zimmet';
import { Common } from '../../services/common';
import { UserModel } from '../users/users';
import { DocumentAllocationModel } from '../../models/documentallocation.model';

type ZimmetKaynak = 'EvrakTakip' | 'Atlas';

interface ZimmetRow {
  id: string;
  qrCode?: string;
  documentName?: string;
  documentDate?: string;
  status?: number;
  source: ZimmetKaynak;
}

@Component({
  imports: [
    GenericModel,
    FormsModule,
    CommonModule
  ],
  templateUrl: './zimmetlerim.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Zimmetlerim {

  private readonly allocationService = inject(DocumentAllocation);
  private readonly assignmentService = inject(DocumentAssignmentService);
  private readonly atlasZimmetService = inject(AtlasZimmetService);
  private readonly toast = inject(FlexiToastService);
  private readonly common = inject(Common);

  readonly user = computed(() => this.common.user());

  readonly evrakTakipZimmetleri = signal<ZimmetRow[]>([]);
  readonly atlasZimmetleri = signal<ZimmetRow[]>([]);
  readonly zimmetlerim = computed(() => [
    ...this.evrakTakipZimmetleri(),
    ...this.atlasZimmetleri()
  ]);

  readonly sourceFilter = signal<'all' | ZimmetKaynak>('all');
  readonly filteredZimmetlerim = computed(() => {
    const filter = this.sourceFilter();
    return filter === 'all'
      ? this.zimmetlerim()
      : this.zimmetlerim().filter(item => item.source === filter);
  });

  setSourceFilter(filter: 'all' | ZimmetKaynak): void {
    this.sourceFilter.set(filter);
    this.closeDetail();
  }

  readonly loading = signal(false);

  // "Detay" satırı: seçili evrağın tüm zimmet geçmişini (kimde, ne zaman) gösterir.
  readonly expandedItem = signal<ZimmetRow | null>(null);
  readonly detailHistory = signal<DocumentAllocationModel[]>([]);
  readonly detailLoading = signal(false);

  toggleDetail(item: ZimmetRow): void {
    if (item.source !== 'EvrakTakip') return;

    if (this.isExpanded(item)) {
      this.closeDetail();
      return;
    }

    this.expandedItem.set(item);
    this.detailHistory.set([]);
    this.detailLoading.set(true);

    this.allocationService.getByDocumentId(item.id).subscribe({
      next: (history) => {
        const sorted = [...history]
          .filter(h => !h.isDeleted)
          .sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime());
        this.detailHistory.set(sorted);
        this.detailLoading.set(false);
      },
      error: () => {
        this.detailHistory.set([]);
        this.detailLoading.set(false);
      }
    });
  }

  closeDetail(): void {
    this.expandedItem.set(null);
    this.detailHistory.set([]);
  }

  // Popover dışına tıklanınca kapansın (butonun ve panelin kendi click
  // handler'ları $event.stopPropagation() ile bu listener'ı tetiklemez).
  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.expandedItem()) {
      this.closeDetail();
    }
  }

  isExpanded(item: ZimmetRow): boolean {
    const expanded = this.expandedItem();
    return !!expanded && expanded.id === item.id && expanded.source === item.source;
  }

  readonly totalCount = computed(() => this.zimmetlerim().length);
  readonly evrakTakipCount = computed(() => this.evrakTakipZimmetleri().length);
  readonly atlasCount = computed(() => this.atlasZimmetleri().length);

  readonly usersResult = httpResource<UserModel[]>(() => 'api/Users/GetAll');
  readonly personFilter = signal('');
  readonly personList = computed(() => {
    const query = this.personFilter().trim().toLocaleLowerCase('tr');
    return (this.usersResult.value() ?? [])
      .filter(u => !u.isDeleted && u.isActive && u.id !== this.currentUserId)
      .filter(u => !query || `${u.name} ${u.surname}`.toLocaleLowerCase('tr').includes(query));
  });

  transferModalVisible = false;
  transferLoading = false;
  activeDocId: string | null = null;
  selectedPersonId: string | null = null;

  get currentUserId(): string | undefined {
    return this.user()?.id;
  }

  constructor() {
    this.loadZimmetlerim();
  }

  loadZimmetlerim(): void {
    this.closeDetail();
    const currentUserId = this.currentUserId;
    if (!currentUserId) {
      this.evrakTakipZimmetleri.set([]);
      this.atlasZimmetleri.set([]);
      return;
    }

    this.loading.set(true);
    this.allocationService.getActiveByUserId(currentUserId).subscribe({
      next: (allocations) => {
        const mine: ZimmetRow[] = allocations
          .filter(a => !a.isDeleted)
          .map(a => ({
            id: a.incomingDocumentId,
            qrCode: a.qrCode,
            documentName: a.documentName,
            documentDate: a.documentDate,
            source: 'EvrakTakip' as const
          }));
        this.evrakTakipZimmetleri.set(mine);
        this.loading.set(false);
      },
      error: () => {
        this.evrakTakipZimmetleri.set([]);
        this.loading.set(false);
      }
    });

    this.atlasZimmetService.getMyZimmetler(currentUserId).subscribe({
      next: (docs) => {
        const mapped: ZimmetRow[] = docs.map(doc => ({
          id: doc.id,
          qrCode: doc.qrCode,
          documentName: doc.documentName,
          documentDate: doc.documentDate,
          source: 'Atlas' as const
        }));
        this.atlasZimmetleri.set(mapped);
      },
      error: () => {
        this.atlasZimmetleri.set([]);
      }
    });
  }

  openTransferModal(item: ZimmetRow) {
    if (item.source !== 'EvrakTakip') return;

    this.activeDocId = item.id;
    this.selectedPersonId = null;
    this.personFilter.set('');
    this.transferModalVisible = true;
  }

  closeTransferModal() {
    this.transferModalVisible = false;
    this.activeDocId = null;
    this.selectedPersonId = null;
    this.personFilter.set('');
  }

  confirmTransfer() {
    if (!this.selectedPersonId) {
      this.toast.showToast('Uyarı', 'Lütfen devredilecek personeli seçiniz.', 'warning');
      return;
    }

    if (!this.activeDocId) {
      this.toast.showToast('Hata', 'Evrak bulunamadı.', 'error');
      return;
    }

    this.transferLoading = true;

    // documentlist.ts'teki atama akışıyla aynı API: currentAssignmentUserId'yi
    // bu servis günceller (Zimmetlerim listesi de bu alana göre filtreleniyor).
    this.assignmentService.createAssignment({
      documentId: this.activeDocId,
      userId: this.selectedPersonId
    }).subscribe({
      next: () => {
        this.transferLoading = false;
        this.toast.showToast('Başarılı', 'Zimmet devri tamamlandı', 'success');
        this.closeTransferModal();
        this.loadZimmetlerim();
      },
      error: () => {
        this.transferLoading = false;
        this.toast.showToast('Hata', 'Zimmet devri başarısız', 'error');
      }
    });
  }
}
