import { ChangeDetectionStrategy, Component, Input, OnInit, signal, ViewEncapsulation } from '@angular/core';

import { QRCodeComponent } from 'angularx-qrcode';


@Component({
  selector: 'print-petition',
  standalone: true,
  imports: [
    QRCodeComponent
  ],
  templateUrl: './print-petition.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class PrintPetition implements OnInit {

  @Input() data: any;
  scannedDocumentNo = signal<string | null>(null);

  fullName = '';
  tckn = '';
  applicationNo = '';
  barcode = '';
  today = new Date().toLocaleDateString('tr-TR');

  ngOnInit() {
    if (this.data) {
      this.fullName = this.data.fullName;
      this.tckn = this.data.tckn;
      this.applicationNo = this.data.applicationNo;
      this.barcode = this.data.barcode;
    }
  }
}
