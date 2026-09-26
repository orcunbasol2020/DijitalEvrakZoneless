import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, signal } from '@angular/core';

type Direction = 'incoming' | 'outgoing';

/** Anlık Durum kartındaki bir yatay çubuk */
interface StatusBar {
  label: string;
  icon: string;
  value: number;
  total: number;
  tone: 'alert' | 'warning' | 'success' | 'info';
}

interface StatusView {
  total: number;
  totalLabel: string;
  done: number;
  doneLabel: string;
  bars: StatusBar[];
}

// Anlık Durum (veri bağlanana kadar örnek değerler)
const STATUS_VIEWS: Record<Direction, StatusView> = {
  incoming: {
    total: 237, totalLabel: 'gelen evrak', done: 221, doneLabel: 'kaydı tamamlandı',
    bars: [
      { label: 'OCR bekleyen', icon: 'hourglass', value: 26, total: 237, tone: 'alert' },
      { label: 'Kurye bekleyen', icon: 'airplane_ticket', value: 14, total: 112, tone: 'warning' },
      { label: 'Kaydı tamamlanan', icon: 'done_all', value: 221, total: 237, tone: 'success' },
      { label: 'Teslim edilen', icon: 'approval_delegation', value: 56, total: 237, tone: 'info' },
    ],
  },
  outgoing: {
    total: 521, totalLabel: 'giden evrak', done: 367, doneLabel: 'teslim edildi',
    bars: [
      { label: 'Teslim edilen', icon: 'approval_delegation', value: 367, total: 521, tone: 'success' },
      { label: 'Posta', icon: 'mail', value: 156, total: 521, tone: 'info' },
    ],
  },
};

/**
 * Anlık Durum kartı: Yönetici ve Gelen Evrak panellerinde ortak.
 * Başlık (Gelen / Giden sekmeleri) ve yatay çubuklu gövde tek parça;
 * ad-head / ad-status stilleri dashboard.css'ten gelir.
 */
@Component({
  selector: 'status-overview',
  standalone: true,
  templateUrl: './status-overview.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatusOverview {
  readonly statusTab = signal<Direction>('incoming');
  readonly statusView = computed(() => STATUS_VIEWS[this.statusTab()]);

  pct(value: number, total: number): number {
    return total > 0 ? Math.round((value / total) * 100) : 0;
  }
}
