import { ChangeDetectionStrategy, Component, ViewEncapsulation, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import GenericModel from '../../../components/generic-model/generic-model';

export enum OcrStatus {
  Basarili = 1,
  Isleniyor = 2,
  Hatali = 3
}

export interface OcrTakipModel {
  id: number;
  documentName: string;
  documentType: string;
  status: OcrStatus;
  ocrDate: string;
  pageCount: number;
  confidence?: number;
  errorMessage?: string;
}

type SortColumn = 'documentName' | 'documentType' | 'status' | 'ocrDate' | 'pageCount';

@Component({
  imports: [
    GenericModel,
    CommonModule,
    FormsModule
  ],
  templateUrl: './ocrtakip.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Ocrtakip {

  readonly statusLabelMap: Record<OcrStatus, string> = {
    [OcrStatus.Basarili]: 'Başarılı',
    [OcrStatus.Isleniyor]: 'İşleniyor',
    [OcrStatus.Hatali]: 'Hatalı'
  };

  readonly statusBadgeStyle: Record<OcrStatus, string> = {
    [OcrStatus.Basarili]: 'process-status-badge process-status-completed',
    [OcrStatus.Isleniyor]: 'process-status-badge process-status-processing',
    [OcrStatus.Hatali]: 'process-status-badge process-status-error'
  };

  readonly statusIconMap: Record<OcrStatus, string> = {
    [OcrStatus.Basarili]: 'check_circle',
    [OcrStatus.Isleniyor]: 'sync',
    [OcrStatus.Hatali]: 'error'
  };

  readonly documentTypes = ['Fatura', 'Dilekçe', 'Sözleşme', 'Yazışma'];

  readonly loading = signal(false);

  readonly data = signal<OcrTakipModel[]>([
    { id: 1, documentName: 'fatura_1023.pdf', documentType: 'Fatura', status: OcrStatus.Basarili, ocrDate: '2026-01-26', pageCount: 2, confidence: 98 },
    { id: 2, documentName: 'dilekce_334.pdf', documentType: 'Dilekçe', status: OcrStatus.Isleniyor, ocrDate: '2026-01-26', pageCount: 1 },
    { id: 3, documentName: 'sozlesme_88.pdf', documentType: 'Sözleşme', status: OcrStatus.Hatali, ocrDate: '2026-01-25', pageCount: 4, errorMessage: 'OCR motoru metin çıkaramadı' },
    { id: 4, documentName: 'yazisma_512.pdf', documentType: 'Yazışma', status: OcrStatus.Basarili, ocrDate: '2026-01-25', pageCount: 1, confidence: 95 },
    { id: 5, documentName: 'fatura_1024.pdf', documentType: 'Fatura', status: OcrStatus.Basarili, ocrDate: '2026-01-24', pageCount: 3, confidence: 99 },
    { id: 6, documentName: 'sozlesme_89.pdf', documentType: 'Sözleşme', status: OcrStatus.Isleniyor, ocrDate: '2026-01-24', pageCount: 6 },
    { id: 7, documentName: 'dilekce_335.pdf', documentType: 'Dilekçe', status: OcrStatus.Hatali, ocrDate: '2026-01-23', pageCount: 2, errorMessage: 'Görüntü çözünürlüğü yetersiz' },
    { id: 8, documentName: 'yazisma_513.pdf', documentType: 'Yazışma', status: OcrStatus.Basarili, ocrDate: '2026-01-23', pageCount: 1, confidence: 97 },
  ]);

  readonly searchText = signal('');
  readonly statusFilter = signal<OcrStatus | 'all'>('all');
  readonly typeFilter = signal<string>('all');
  readonly dateFilter = signal<string>('');

  readonly sortColumn = signal<SortColumn | null>(null);
  readonly sortDirection = signal<'asc' | 'desc'>('asc');

  readonly expandedId = signal<number | null>(null);

  readonly stats = computed(() => {
    const list = this.data();
    return {
      total: list.length,
      success: list.filter(d => d.status === OcrStatus.Basarili).length,
      processing: list.filter(d => d.status === OcrStatus.Isleniyor).length,
      failed: list.filter(d => d.status === OcrStatus.Hatali).length
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
      if (status !== 'all' && item.status !== status) return false;
      if (type !== 'all' && item.documentType !== type) return false;
      if (date && item.ocrDate !== date) return false;
      return true;
    });

    if (!column) return filtered;

    const factor = direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (column === 'ocrDate') {
        return (new Date(a.ocrDate).getTime() - new Date(b.ocrDate).getTime()) * factor;
      }
      if (column === 'pageCount' || column === 'status') {
        return (a[column] - b[column]) * factor;
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

  onStatusFilterChange(value: OcrStatus | 'all'): void {
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
}
