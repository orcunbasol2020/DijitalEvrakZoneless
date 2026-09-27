import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { EnvelopeLabelComponent } from '../envelope/envelope-label/envelope-label';

// Yazdırma önizlemesindeki zarf etiketi; görsel ortak app-envelope-label bileşeninden gelir.
@Component({
  selector: 'print-envelope-label',
  standalone: true,
  imports: [EnvelopeLabelComponent],
  templateUrl: './print-envelope-label.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PrintEnvelopeLabel {
  @Input() data: any;
}
