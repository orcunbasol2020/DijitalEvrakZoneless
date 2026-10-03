import { ChangeDetectionStrategy, Component, signal, viewChild, ViewEncapsulation } from '@angular/core';
import { IncomingDocumentTodayStats } from '../../../models/dashboard/IncomingDocumentTodayStats.model';
import { IncomingDocumentService } from '../../../services/incomingdocument';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { IncomingDocumentLast30DaysStats } from '../../../models/dashboard/IncomingDocument30DaysStats.model';
import { IncomingDocumentPendingScanStats } from '../../../models/dashboard/IncomingDocumentPendingScanStats.model';
import { IncomingDocumentOcrQueueStats } from '../../../models/dashboard/IncomingDocumentOcrQueueStats.model';
import { RouterLink } from '@angular/router';
import { StatusOverview } from '../status-overview/status-overview';
import { SmartRouting } from '../smart-routing/smart-routing';
import { Currentdocument } from '../currentdocument/currentdocument';
import { DeliveryPending } from '../delivery-pending/delivery-pending';

@Component({
  imports: [
    DecimalPipe,
    DatePipe,
    CommonModule,
    RouterLink,
    StatusOverview,
    SmartRouting,
    Currentdocument,
    DeliveryPending
  ],
  selector: 'app-gelen-evrak-dashboard',
  standalone: true,
  templateUrl: './gelen-evrak-dashboard.html',
  styleUrl: '../dashboard.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class GelenEvrakDashboard {
  // Üst şerit
  readonly today = new Date();
  readonly lastUpdated = signal(new Date());

  statsSignal = signal<IncomingDocumentTodayStats>({ todayCount: 0, changePercent: 0 });
  last30DaysStatsSignal = signal<IncomingDocumentLast30DaysStats>({ last30DaysCount: 0, changePercent: 0 });
  private refreshInterval: any;
  private readonly recentCard = viewChild(Currentdocument);
  private readonly deliveryCard = viewChild(DeliveryPending);

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
    const cards = document.querySelectorAll('.ad-stat');

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
    this.lastUpdated.set(new Date());
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
    this.recentCard()?.reload();
    this.loadTodayStats();
    this.loadLast30DaysStats();
    this.loadPendingScanStats();
    this.loadOcrQueueStats();
    this.deliveryCard()?.reload();
  }
}