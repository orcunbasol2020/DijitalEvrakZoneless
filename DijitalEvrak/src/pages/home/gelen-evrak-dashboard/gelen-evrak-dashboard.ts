import { ChangeDetectionStrategy, Component, signal, ViewEncapsulation } from '@angular/core';
import { IncomingDocumentTodayStats } from '../../../models/dashboard/IncomingDocumentTodayStats.model';
import { IncomingDocumentService } from '../../../services/incomingdocument';
import { CommonModule, DecimalPipe } from '@angular/common';
import { IncomingDocumentLast30DaysStats } from '../../../models/dashboard/IncomingDocument30DaysStats.model';

@Component({
  imports: [
    DecimalPipe,
    CommonModule
  ],
  templateUrl: './gelen-evrak-dashboard.html',
  selector: 'app-gelen-evrak-dashboard',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class GelenEvrakDashboard {

  statsSignal = signal<IncomingDocumentTodayStats>({ todayCount: 0, changePercent: 0 });
  last30DaysStatsSignal = signal<IncomingDocumentLast30DaysStats>({ last30DaysCount: 0, changePercent: 0 });

  private refreshInterval: any;

  constructor(private incomingDocumentService: IncomingDocumentService) { }

  ngOnInit() {
    this.loadTodayStats();
    this.loadLast30DaysStats();

    this.refreshInterval = setInterval(() => {
      this.loadTodayStats();
      this.loadLast30DaysStats();
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

}