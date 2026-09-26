import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

interface PendingStage {
  name: string;
  value: number;
}

/**
 * Bekleyenler: aşamalara göre bekleyen evrak sayıları.
 * Tek bileşim çubuğu (aşamaların payı) + açıklama listesi (sayı ve yüzde).
 * pc-* stilleri dashboard.css'ten gelir.
 */
@Component({
  selector: 'pending-chart',
  standalone: true,
  templateUrl: './pending-chart.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PendingChart {
  private readonly pendingData: PendingStage[] = [
    { name: 'Kurum içinde teslim alınmayı bekleyen', value: 32 },
    { name: 'Teslim alınmayı bekleyen notalar', value: 9 },
    { name: 'Posta / kargo bekleyen', value: 7 },
    { name: 'Dış kuruma gönderilmeyi bekleyen', value: 5 }
  ];

  /** Çoktan aza sıralı */
  readonly stages = [...this.pendingData].sort((a, b) => b.value - a.value);
  readonly total = this.stages.reduce((sum, s) => sum + s.value, 0);

  /** Petrol rampası: en yüksek aşama en koyu (sistemin lacivert-petrol dili) */
  private readonly palette = ['#0c4a6e', '#0369a1', '#0ea5e9', '#7dd3fc', '#bae6fd'];

  color(index: number): string {
    return this.palette[Math.min(index, this.palette.length - 1)];
  }

  /** Toplam içindeki pay (ipucu) */
  share(stage: PendingStage): number {
    return this.total > 0 ? Math.round((stage.value / this.total) * 100) : 0;
  }

  shareTitle(stage: PendingStage): string {
    return `Bekleyenlerin %${this.share(stage)}'i`;
  }
}
