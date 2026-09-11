import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { QRCodeComponent } from 'angularx-qrcode';

@Component({
  selector: 'print-envelope-label',
  standalone: true,
  imports: [QRCodeComponent],
  templateUrl: './print-envelope-label.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PrintEnvelopeLabel {
  @Input() data: any;
}