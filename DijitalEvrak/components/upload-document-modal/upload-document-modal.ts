import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  effect,
  input,
  output,
  signal
} from '@angular/core';
import { IncomingDocumentModel } from '../../src/models/incoming-document/incoming-document.model';

// Tarayıcı hattı dışında belge yükleme yetkisi olan roller: yöneticiler ve evrak
// kaydı yapan "Gelen Evrak" rolü. Birim Evrak Sorumlusu bu işlemi yapamaz.
export const UPLOAD_DOCUMENT_ROLES = ['Yönetici', 'Gelen Evrak'];

const ALLOWED_EXTENSIONS = ['.pdf'];
const MAX_SIZE_BYTES = 20 * 1024 * 1024;

/**
 * "Belge Yükle" penceresi.
 * Henüz taranmamış bir ön kayıt evrakına dosya (PDF) yüklenir; dosya seçimi
 * ve doğrulama burada, sunucuya gönderim ise `confirmed` ile üst bileşende
 * yapılır. Ön Kayıtlar ve QR Okut ekranları aynı pencereyi kullanır.
 */
@Component({
  selector: 'app-upload-document-modal',
  templateUrl: './upload-document-modal.html',
  styleUrl: './upload-document-modal.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UploadDocumentModal {
  // Pencere yalnızca bir evrak verildiğinde görünür
  readonly document = input<IncomingDocumentModel | null>(null);
  readonly loading = input(false);

  readonly confirmed = output<File>();
  readonly cancelled = output<void>();

  readonly file = signal<File | null>(null);
  readonly error = signal('');
  readonly dragging = signal(false);

  readonly acceptAttr = ALLOWED_EXTENSIONS.join(',');
  readonly maxSizeLabel = `${MAX_SIZE_BYTES / (1024 * 1024)} MB`;

  readonly subtitle = computed(() => {
    const doc = this.document();
    if (!doc) return '';
    return `${doc.qrCode || '-'}${doc.orginalNo ? ' · ' + doc.orginalNo : ''}`;
  });

  readonly fileSizeLabel = computed(() => {
    const f = this.file();
    if (!f) return '';
    const kb = f.size / 1024;
    return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
  });

  constructor() {
    // Her açılışta seçim sıfırlanır
    effect(() => {
      this.document();
      this.file.set(null);
      this.error.set('');
      this.dragging.set(false);
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = input.files?.[0] ?? null;
    input.value = '';
    this.pick(picked);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!this.loading()) this.dragging.set(true);
  }

  onDragLeave(): void {
    this.dragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    if (this.loading()) return;
    this.pick(event.dataTransfer?.files?.[0] ?? null);
  }

  private pick(picked: File | null): void {
    if (!picked) return;

    const extension = picked.name.slice(picked.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      this.file.set(null);
      this.error.set('Yalnızca PDF dosyası yüklenebilir.');
      return;
    }

    if (picked.size > MAX_SIZE_BYTES) {
      this.file.set(null);
      this.error.set(`Dosya boyutu ${this.maxSizeLabel} sınırını geçemez.`);
      return;
    }

    this.error.set('');
    this.file.set(picked);
  }

  clearFile(): void {
    if (this.loading()) return;
    this.file.set(null);
    this.error.set('');
  }

  cancel(): void {
    if (this.loading()) return;
    this.cancelled.emit();
  }

  confirm(): void {
    const f = this.file();
    if (this.loading() || !f) return;
    this.confirmed.emit(f);
  }
}
