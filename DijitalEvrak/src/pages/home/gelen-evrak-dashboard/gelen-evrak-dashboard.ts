import { ChangeDetectionStrategy, Component, inject, signal, ViewEncapsulation } from '@angular/core';
import { IncomingDocumentTodayStats } from '../../../models/dashboard/IncomingDocumentTodayStats.model';
import { IncomingDocumentService } from '../../../services/incomingdocument';
import { CommonModule, DecimalPipe } from '@angular/common';
import { IncomingDocumentLast30DaysStats } from '../../../models/dashboard/IncomingDocument30DaysStats.model';
import { IncomingDocumentPendingScanStats } from '../../../models/dashboard/IncomingDocumentPendingScanStats.model';
import { IncomingDocumentOcrQueueStats } from '../../../models/dashboard/IncomingDocumentOcrQueueStats.model';
import { FlexiToastService } from 'flexi-toast';
import { Router } from '@angular/router';

@Component({
  imports: [
    DecimalPipe,
    CommonModule
  ],
  selector: 'app-gelen-evrak-dashboard',
  standalone: true,
  templateUrl: './gelen-evrak-dashboard.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class GelenEvrakDashboard {
  private router = inject(Router);
  statsSignal = signal<IncomingDocumentTodayStats>({ todayCount: 0, changePercent: 0 });
  last30DaysStatsSignal = signal<IncomingDocumentLast30DaysStats>({ last30DaysCount: 0, changePercent: 0 });
  readonly #toast = inject(FlexiToastService);
  private refreshInterval: any;

  constructor(private incomingDocumentService: IncomingDocumentService) { }

  ngOnInit() {
    this.loadTodayStats();
    this.loadLast30DaysStats();
    this.loadPendingScanStats();
    this.loadOcrQueueStats();

    this.refreshInterval = setInterval(() => {
      this.loadTodayStats();
      this.loadLast30DaysStats();
      this.loadPendingScanStats();
      this.loadOcrQueueStats();
    }, 30000);
  }

  ngOnDestroy() {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
  }

  isLoading = false;

  updateCard() {
    const cards = document.querySelectorAll('.stat-card');

    cards.forEach(card => {
      card.classList.add('updated');
      setTimeout(() => card.classList.remove('updated'), 500);
    });
  }

  async loadTodayStats() {
    this.isLoading = true;
    const stats = await this.incomingDocumentService.loadTodayStats();
    if (stats) this.statsSignal.set(stats);
    this.isLoading = false;
    this.updateCard();
  }

  async loadLast30DaysStats() {
    const stats = await this.incomingDocumentService.loadLast30DaysStats();
    if (stats) this.last30DaysStatsSignal.set(stats);
  }

  pendingScanStatsSignal = signal<IncomingDocumentPendingScanStats>({ pendingScanCount: 0, changePercent: 0 });

  async loadPendingScanStats() {
    const stats = await this.incomingDocumentService.loadPendingScanStats();
    if (stats) this.pendingScanStatsSignal.set(stats);
  }

  ocrQueueStatsSignal = signal<IncomingDocumentOcrQueueStats>({ ocrQueueCount: 0, changePercent: 0 });

  async loadOcrQueueStats() {
    const stats = await this.incomingDocumentService.loadOcrQueueStats();
    //console.log(stats);
    if (stats) this.ocrQueueStatsSignal.set(stats);
  }

  loadAll() {
    this.loadTodayStats();
    this.loadLast30DaysStats();
    this.loadPendingScanStats();
    this.loadOcrQueueStats();
  }

  goDetail(id: string) {
    this.#toast.showToast('Bilgi', 'Belge Detayına Ulaşılamadı.', 'warning');
  }

  goToIncoming() {
    this.router.navigate(['/evrakkayit']);
  }

row1 = { mailSent: false, loading: false };
row2 = { mailSent: true, loading: false };
row3 = { mailSent: false, loading: false };
row4 = { mailSent: false, loading: false };

sendReminder(row: any) {
  if (row.mailSent) return;

  row.loading = true;

  // fake mail gönderme süresi
  setTimeout(() => {
    row.loading = false;
    row.mailSent = true;
  }, 400); // 0.8 saniye = daha gerçekçi
}
}