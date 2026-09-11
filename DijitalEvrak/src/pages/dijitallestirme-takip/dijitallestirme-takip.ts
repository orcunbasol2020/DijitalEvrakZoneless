import { ChangeDetectionStrategy, Component, ViewEncapsulation, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import GenericModel from '../../../components/generic-model/generic-model';
import { DigitizationTrackingModel, PipelineStepKey, PipelineStepStatus } from '../../models/digitization-tracking.model';

type OverallStatus = 'completed' | 'processing' | 'error';

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
    completed: 'bg-success-subtle text-success border border-success-subtle',
    processing: 'bg-warning-subtle text-dark border border-warning-subtle',
    error: 'bg-danger-subtle text-danger border border-danger-subtle'
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

    return this.data().filter(item => {
      if (search && !item.documentName.toLocaleLowerCase('tr').includes(search)) return false;
      if (status !== 'all' && this.overallStatus(item) !== status) return false;
      if (type !== 'all' && item.documentType !== type) return false;
      if (date && item.steps.tarama.date && !item.steps.tarama.date.startsWith(date)) return false;
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
