import { ChangeDetectionStrategy, Component, ViewEncapsulation, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import GenericModel from '../../../components/generic-model/generic-model';
import { DeliveryPending } from '../home/delivery-pending/delivery-pending';

/** Teslim Alınmayı Bekleyen Evraklar: Gelen Evrak panelindeki kartın tüm birimleri gösteren hali.
 *  Üst şerit ve özet kartları listenin verisini okur; veri bir kez, liste bileşeninde yüklenir. */
@Component({
  imports: [GenericModel, DeliveryPending, DatePipe],
  templateUrl: './teslim-bekleyenler.html',
  // Arama kutusu (sp-*) Destek, sıralama / sayfalama / kompakt arama (zl-*) Zimmetlerim ile ortak
  styleUrls: ['../home/dashboard.css', '../support/support.css', '../zimmetlerim/zimmetlerim.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class TeslimBekleyenler {
  readonly list = viewChild(DeliveryPending);
}
