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
    [OcrStatus.Basarili]: 'bg-success-subtle text-success border border-success-subtle',
    [OcrStatus.Isleniyor]: 'bg-warning-subtle text-dark border border-warning-subtle',
    [OcrStatus.Hatali]: 'bg-danger-subtle text-danger border border-danger-subtle'
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

    return this.data().filter(item => {
      if (search && !item.documentName.toLocaleLowerCase('tr').includes(search)) return false;
      if (status !== 'all' && item.status !== status) return false;
      if (type !== 'all' && item.documentType !== type) return false;
      if (date && item.ocrDate !== date) return false;
      return true;
    });
  });

  readonly hasActiveFilters = computed(() =>
    !!this.searchText().trim() || this.statusFilter() !== 'all' || this.typeFilter() !== 'all' || !!this.dateFilter()
  );

  resetFilters(): void {
    this.searchText.set('');
    this.statusFilter.set('all');
    this.typeFilter.set('all');
    this.dateFilter.set('');
  }

  toggleDetail(id: number): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  refresh(): void {
    this.expandedId.set(null);
    this.loading.set(true);
    setTimeout(() => this.loading.set(false), 400);
  }
}
