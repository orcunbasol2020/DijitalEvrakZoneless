import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'print-envelope-label',
  standalone: true,
  templateUrl: './print-envelope-label.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PrintEnvelopeLabel {
  @Input() data: any;
}