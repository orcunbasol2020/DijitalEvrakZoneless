import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Common } from '../../../services/common';
import { IncomingDocumentService } from '../../../services/incomingdocument';
import { OutgoingDocumentService } from '../../../services/outgoingdocument';
import { DocumentAllocation } from '../../../services/documentallocation';
import { IncomingDocumentTodayStats } from '../../../models/dashboard/IncomingDocumentTodayStats.model';

@Component({
  selector: 'app-birim-dashboard',
  standalone: true,
  imports: [CommonModule, DecimalPipe, RouterLink],
  templateUrl: './birim-dashboard.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class BirimDashboard implements OnInit {
  private readonly common = inject(Common);
  private readonly incomingDocumentService = inject(IncomingDocumentService);
  private readonly outgoingDocumentService = inject(OutgoingDocumentService);
  private readonly documentAllocation = inject(DocumentAllocation);

  readonly user = computed(() => this.common.user());

  readonly statsSignal = signal<IncomingDocumentTodayStats>({ todayCount: 0, changePercent: 0 });

  readonly outgoingResult = this.outgoingDocumentService.getAll();
  readonly outgoingCount = computed(() => this.outgoingResult.value()?.length ?? 0);

  readonly zimmetCount = signal<number>(0);

  ngOnInit() {
    this.loadAll();
  }

  loadAll() {
    const userId = this.user()?.id;

    this.incomingDocumentService.loadTodayStats().then(stats => {
      if (stats) this.statsSignal.set(stats);
    });

    this.outgoingResult.reload();

    if (userId) {
      this.documentAllocation.getActiveByUserId(userId).subscribe(list => this.zimmetCount.set(list?.length ?? 0));
    }
  }
}
