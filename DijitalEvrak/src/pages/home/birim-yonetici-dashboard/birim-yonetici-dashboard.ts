import { ChangeDetectionStrategy, Component } from '@angular/core';
import BirimDashboard from '../birim-dashboard/birim-dashboard';

/**
 * Birim Yöneticisi ana sayfa paneli. Şimdilik Birim Evrak Sorumlusu panelini
 * kendi başlığıyla gösterir; yöneticilere özel alanlar bu bileşene eklenecek.
 */
@Component({
  selector: 'app-birim-yonetici-dashboard',
  standalone: true,
  imports: [BirimDashboard],
  templateUrl: './birim-yonetici-dashboard.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class BirimYoneticiDashboard {}
