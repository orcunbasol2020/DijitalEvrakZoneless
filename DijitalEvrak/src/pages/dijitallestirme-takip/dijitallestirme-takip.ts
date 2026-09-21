import { ChangeDetectionStrategy, Component, ViewEncapsulation, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import GenericModel from '../../../components/generic-model/generic-model';
import { DigitizationTrackingModel, PipelineStepKey, PipelineStepStatus } from '../../models/digitization-tracking.model';

type OverallStatus = 'completed' | 'processing' | 'error';
type SortColumn = 'documentName' | 'documentType' | 'pageCount' | 'status';

@Component({
  imports: [
    GenericModel,
    CommonModule,
    FormsModule
  ],
  templateUrl: './dijitallestirme-takip.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class DijitallestirmeTakip {

  readonly steps: { key: PipelineStepKey; label: string; icon: string }[] = [
    { key: 'tarama', label: 'Tarama', icon: 'scanner' },
    { key: 'ocr', label: 'OCR', icon: 'document_scanner' },
    { key: 'kayit', label: 'Kayıt', icon: 'save' },
    { key: 'atlas', label: 'Atlas Aktarım', icon: 'cloud_upload' },
  ];

  readonly statusLabelMap: Record<OverallStatus, string> = {
    completed: 'Atlas\'a Aktarıldı',
    processing: 'Devam Ediyor',
    error: 'Hatalı'
  };

  readonly statusBadgeStyle: Record<OverallStatus, string> = {
    completed: 'process-status-badge process-status-completed',
    processing: 'process-status-badge process-status-processing',
    error: 'process-status-badge process-status-error'
  };

  readonly stepIconByStatus: Record<PipelineStepStatus, string> = {
    completed: 'check_circle',
    processing: 'sync',
    error: 'error',
    pending: 'radio_button_unchecked'
  };

  readonly documentTypes = ['Fatura', 'Dilekçe', 'Sözleşme', 'Yazışma'];

  readonly loading = signal(false);

  readonly data = signal<DigitizationTrackingModel[]>([
    {
      id: 1, documentName: 'fatura_1023.pdf', documentType: 'Fatura', pageCount: 2, atlasReferenceNo: 'ATLAS-2026-000451',
      steps: {
        tarama: { status: 'completed', date: '2026-01-26 09:12' },
        ocr: { status: 'completed', date: '2026-01-26 09:14', note: 'Doğruluk oranı: %98' },
        kayit: { status: 'completed', date: '2026-01-26 09:15' },
        atlas: { status: 'completed', date: '2026-01-26 09:16' }
      }
    },
    {
      id: 2, documentName: 'dilekce_334.pdf', documentType: 'Dilekçe', pageCount: 1,
      steps: {
        tarama: { status: 'completed', date: '2026-01-26 10:02' },
        ocr: { status: 'processing', note: 'OCR kuyruğunda işleniyor' },
        kayit: { status: 'pending' },
        atlas: { status: 'pending' }
      }
    },
    {
      id: 3, documentName: 'sozlesme_88.pdf', documentType: 'Sözleşme', pageCount: 4,
      steps: {
        tarama: { status: 'completed', date: '2026-01-25 14:20' },
        ocr: { status: 'error', date: '2026-01-25 14:22', note: 'OCR motoru metin çıkaramadı' },
        kayit: { status: 'pending' },
        atlas: { status: 'pending' }
      }
    },
    {
      id: 4, documentName: 'yazisma_512.pdf', documentType: 'Yazışma', pageCount: 1, atlasReferenceNo: 'ATLAS-2026-000452',
      steps: {
        tarama: { status: 'completed', date: '2026-01-25 08:40' },
        ocr: { status: 'completed', date: '2026-01-25 08:42', note: 'Doğruluk oranı: %95' },
        kayit: { status: 'completed', date: '2026-01-25 08:43' },
        atlas: { status: 'completed', date: '2026-01-25 08:45' }
      }
    },
    {
      id: 5, documentName: 'fatura_1024.pdf', documentType: 'Fatura', pageCount: 3,
      steps: {
        tarama: { status: 'completed', date: '2026-01-24 11:05' },
        ocr: { status: 'completed', date: '2026-01-24 11:08', note: 'Doğruluk oranı: %99' },
        kayit: { status: 'completed', date: '2026-01-24 11:09' },
        atlas: { status: 'error', date: '2026-01-24 11:12', note: 'Atlas EBYS API zaman aşımına uğradı' }
      }
    },
    {
      id: 6, documentName: 'sozlesme_89.pdf', documentType: 'Sözleşme', pageCount: 6,
      steps: {
        tarama: { status: 'completed', date: '2026-01-24 15:30' },
        ocr: { status: 'completed', date: '2026-01-24 15:36', note: 'Doğruluk oranı: %93' },
        kayit: { status: 'processing', note: 'Belge sisteme kaydediliyor' },
        atlas: { status: 'pending' }
      }
    },
    {
      id: 7, documentName: 'dilekce_335.pdf', documentType: 'Dilekçe', pageCount: 2,
      steps: {
        tarama: { status: 'completed', date: '2026-01-23 09:50' },
        ocr: { status: 'error', date: '2026-01-23 09:52', note: 'Görüntü çözünürlüğü yetersiz' },
        kayit: { status: 'pending' },
        atlas: { status: 'pending' }
      }
    },
    {
      id: 8, documentName: 'yazisma_513.pdf', documentType: 'Yazışma', pageCount: 1, atlasReferenceNo: 'ATLAS-2026-000453',
      steps: {
        tarama: { status: 'completed', date: '2026-01-23 13:15' },
        ocr: { status: 'completed', date: '2026-01-23 13:17', note: 'Doğruluk oranı: %97' },
        kayit: { status: 'completed', date: '2026-01-23 13:18' },
        atlas: { status: 'completed', date: '2026-01-23 13:20' }
      }
    },
  ]);

  readonly searchText = signal('');
  readonly statusFilter = signal<OverallStatus | 'all'>('all');
  readonly typeFilter = signal<string>('all');
  readonly dateFilter = signal<string>('');

  readonly sortColumn = signal<SortColumn | null>(null);
  readonly sortDirection = signal<'asc' | 'desc'>('asc');

  readonly expandedId = signal<number | null>(null);

  overallStatus(item: DigitizationTrackingModel): OverallStatus {
    const statuses = this.steps.map(s => item.steps[s.key].status);
    if (statuses.some(s => s === 'error')) return 'error';
    if (statuses.every(s => s === 'completed')) return 'completed';
    return 'processing';
  }

  readonly stats = computed(() => {
    const list = this.data();
    return {
      total: list.length,
      completed: list.filter(d => this.overallStatus(d) === 'completed').length,
      processing: list.filter(d => this.overallStatus(d) === 'processing').length,
      error: list.filter(d => this.overallStatus(d) === 'error').length
    };
  });

  readonly filteredData = computed(() => {
    const search = this.searchText().trim().toLocaleLowerCase('tr');
    const status = this.statusFilter();
    const type = this.typeFilter();
    const date = this.dateFilter();
    const column = this.sortColumn();
    const direction = this.sortDirection();

    const filtered = this.data().filter(item => {
      if (search && !item.documentName.toLocaleLowerCase('tr').includes(search)) return false;
      if (status !== 'all' && this.overallStatus(item) !== status) return false;
      if (type !== 'all' && item.documentType !== type) return false;
      if (date && item.steps.tarama.date && !item.steps.tarama.date.startsWith(date)) return false;
      return true;
    });

    if (!column) return filtered;

    const factor = direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (column === 'pageCount') {
        return (a.pageCount - b.pageCount) * factor;
      }
      if (column === 'status') {
        return this.overallStatus(a).localeCompare(this.overallStatus(b), 'tr') * factor;
      }
      return a[column].localeCompare(b[column], 'tr') * factor;
    });
  });

  readonly hasActiveFilters = computed(() =>
    !!this.searchText().trim() || this.statusFilter() !== 'all' || this.typeFilter() !== 'all' || !!this.dateFilter()
  );

  onSearchTextChange(value: string): void {
    this.searchText.set(value);
    this.currentPage.set(1);
    this.expandedId.set(null);
  }

  onStatusFilterChange(value: OverallStatus | 'all'): void {
    this.statusFilter.set(value);
    this.currentPage.set(1);
    this.expandedId.set(null);
  }

  onTypeFilterChange(value: string): void {
    this.typeFilter.set(value);
    this.currentPage.set(1);
    this.expandedId.set(null);
  }

  onDateFilterChange(value: string): void {
    this.dateFilter.set(value);
    this.currentPage.set(1);
    this.expandedId.set(null);
  }

  resetFilters(): void {
    this.searchText.set('');
    this.statusFilter.set('all');
    this.typeFilter.set('all');
    this.dateFilter.set('');
    this.currentPage.set(1);
    this.expandedId.set(null);
  }

  toggleSort(column: SortColumn): void {
    if (this.sortColumn() === column) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('asc');
    }
    this.currentPage.set(1);
    this.expandedId.set(null);
  }

  sortIcon(column: SortColumn): string {
    if (this.sortColumn() !== column) return 'unfold_more';
    return this.sortDirection() === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  // Sayfalama: zimmetlerim ekranıyla aynı mantık.
  readonly pageSize = 10;
  readonly currentPage = signal(1);

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredData().length / this.pageSize)));

  readonly pagedData = computed(() => {
    const page = Math.min(this.currentPage(), this.totalPages());
    const start = (page - 1) * this.pageSize;
    return this.filteredData().slice(start, start + this.pageSize);
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
    this.filteredData().length === 0 ? 0 : (Math.min(this.currentPage(), this.totalPages()) - 1) * this.pageSize + 1);

  readonly pageRangeEnd = computed(() =>
    Math.min(Math.min(this.currentPage(), this.totalPages()) * this.pageSize, this.filteredData().length));

  goToPage(page: number): void {
    const clamped = Math.min(Math.max(page, 1), this.totalPages());
    if (clamped === this.currentPage()) return;
    this.currentPage.set(clamped);
    this.expandedId.set(null);
  }

  toggleDetail(id: number): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  refresh(): void {
    this.expandedId.set(null);
    this.currentPage.set(1);
    this.loading.set(true);
    setTimeout(() => this.loading.set(false), 400);
  }

  retryStep(item: DigitizationTrackingModel, key: PipelineStepKey): void {
    const current = { ...item.steps[key], status: 'processing' as PipelineStepStatus, note: 'Yeniden deneniyor...' };
    this.data.update(list => list.map(d => d.id === item.id ? { ...d, steps: { ...d.steps, [key]: current } } : d));

    setTimeout(() => {
      this.data.update(list => list.map(d => {
        if (d.id !== item.id) return d;
        return { ...d, steps: { ...d.steps, [key]: { status: 'completed', date: new Date().toISOString().slice(0, 16).replace('T', ' ') } } };
      }));
    }, 800);
  }
}
