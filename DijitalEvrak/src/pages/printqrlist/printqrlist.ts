import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, ViewEncapsulation } from '@angular/core';
import { QRCodeComponent } from 'angularx-qrcode';




@Component({
  imports: [
    CommonModule,
    QRCodeComponent
  ],
  selector: 'printqrlist',
  templateUrl: './printqrlist.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Printqrlist {
  @Input() data : string[] = [];
  
}
