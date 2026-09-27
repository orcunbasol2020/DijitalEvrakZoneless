import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { QRCodeComponent } from 'angularx-qrcode';

// Zarf etiketi: ekranda (canlı önizleme, popup'lar) ve PDF çıktısında aynı
// tasarımın tek yerden gelmesi için ortak bileşen. Görünüm styles.css'teki
// .envelope-label sınıflarıdır (mavi üst şerit, gönderen / alıcı kutuları).
@Component({
  selector: 'app-envelope-label',
  standalone: true,
  imports: [CommonModule, QRCodeComponent],
  templateUrl: './envelope-label.html',
  styleUrls: ['./envelope-label.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EnvelopeLabelComponent {
  readonly envelopeNo = input<string | null | undefined>('');
  readonly receiverName = input<string | null | undefined>('');
  // 'department': kurum içi birim (adres yerine "Kurum içi dağıtım" yazılır)
  readonly receiverKind = input<'department' | 'mission' | 'external'>('external');
  readonly unitName = input<string | null | undefined>('');
  readonly address = input<string | null | undefined>('');
  readonly senderDepartment = input<string | null | undefined>('');
  readonly documentCount = input<number | null | undefined>(null);
  readonly date = input<string | Date | null | undefined>(null);
  // Kayıt öncesi taslak: QR ve numara yerine yer tutucu gösterilir.
  readonly draft = input(false);
  // Üstteki mavi vurgu şeridi (zimmet ekranlarındaki popup'larda kapalı).
  readonly accent = input(true);
  // html2pdf'in yakalayacağı kök eleman id'si (yalnızca yazdırılacak kopyada verilir).
  readonly printId = input<string | null>(null);

  readonly isDepartment = computed(() => this.receiverKind() === 'department');
  readonly qrData = computed(() => this.envelopeNo() || '');
}
