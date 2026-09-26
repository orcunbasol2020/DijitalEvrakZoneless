import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Akıllı Havale bilgi kartı: Yönetici ve Gelen Evrak panellerinde ortak.
 * ad-head / ad-ai stilleri dashboard.css'ten gelir.
 */
@Component({
  selector: 'smart-routing',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './smart-routing.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SmartRouting {
  // Veri bağlanana kadar örnek değerler
  readonly engine = 'Cosine Similarity';
  readonly version = 'v1.0';
  readonly suggestedToday = 14;
  readonly acceptRate = 86;
}
