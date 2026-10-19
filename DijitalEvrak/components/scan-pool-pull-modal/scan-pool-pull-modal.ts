import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { ScanFileModel } from '../../src/models/scanneddocument.model';
import {
  SCAN_FILE_TAKEN_TEXT,
  ScannedDocumentService,
  scanPoolErrorMessage,
  scanSourceLabel
} from '../../src/services/scanneddocument';

const fileKey = (f: ScanFileModel) => `${f.source}/${f.fileName}`;

/**
 * "Taranandan Çek" penceresi (Gelen Evraklar).
 * Evrak numarası okutulur/yazılır, taranan belge havuzunda o numarayla aranır (SearchScanPool):
 *  - sonuç yoksa evrak henüz taranmamış ya da etiketsiz taranmıştır,
 *  - tek sonuç önizlemeyle açılır, kullanıcı onaylar,
 *  - birden fazla sonuç aynı evrakın birkaç kez taranmasıdır; otomatik seçilmez, kullanıcı önizleyip seçer.
 * Onayda belge havuzdan alınıp evraka bağlanır (TransferFromScanPool) ve numara `transferred` ile
 * üst bileşene verilir; Evrak Kayıt'a geçiş üst bileşendedir.
 */
@Component({
  selector: 'app-scan-pool-pull-modal',
  imports: [DatePipe],
  templateUrl: './scan-pool-pull-modal.html',
  // Pencere iskeleti (udm-*) Belge Yükle penceresiyle ortaktır
  styleUrls: ['../upload-document-modal/upload-document-modal.css', './scan-pool-pull-modal.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ScanPoolPullModal {
  readonly open = input(false);
  readonly userId = input<string | undefined>(undefined);
  /** Verilirse pencere bu numarayla açılır ve hemen arar (Evrak Kayıt'ta okutulan numara) */
  readonly initialCode = input('');

  readonly transferred = output<string>();
  readonly cancelled = output<void>();

  private readonly service = inject(ScannedDocumentService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly qrInput = viewChild<ElementRef<HTMLInputElement>>('qrInput');

  readonly qrCode = signal('');
  /** Son aranan numara; sonuçlar bu numaraya aittir */
  readonly searchedCode = signal('');
  /** null: henüz aranmadı */
  readonly results = signal<ScanFileModel[] | null>(null);
  readonly selectedKey = signal<string | null>(null);
  readonly searching = signal(false);
  readonly transferring = signal(false);
  readonly error = signal('');

  readonly busy = computed(() => this.searching() || this.transferring());
  readonly selected = computed(() => this.results()?.find(f => fileKey(f) === this.selectedKey()) ?? null);
  readonly previewUrl = computed<SafeResourceUrl | null>(() => {
    const f = this.selected();
    return f ? this.sanitizer.bypassSecurityTrustResourceUrl(this.service.getPdfUrl(f.source, f.fileName) + '#zoom=page-width') : null;
  });
  readonly hasResults = computed(() => !!this.results()?.length);

  readonly fileKey = fileKey;
  readonly sourceLabel = scanSourceLabel;

  constructor() {
    // Her açılışta pencere sıfırlanır ve numara alanı odaklanır
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        const code = this.initialCode().trim();
        this.qrCode.set(code);
        this.searchedCode.set('');
        this.results.set(null);
        this.selectedKey.set(null);
        this.error.set('');
        if (code) this.search();
        else this.focusQrSoon();
      });
    });
  }

  onQrInput(event: Event): void {
    this.qrCode.set((event.target as HTMLInputElement).value);
  }

  async search(): Promise<void> {
    const qrCode = this.qrCode().trim();
    if (!qrCode) {
      this.error.set('Evrak numarasını okutun ya da yazın.');
      return;
    }
    if (this.busy()) return;

    this.searching.set(true);
    this.error.set('');
    this.results.set(null);
    this.selectedKey.set(null);
    this.searchedCode.set(qrCode);
    try {
      const files = await firstValueFrom(this.service.searchScanPool(qrCode)) ?? [];
      this.results.set(files);
      // Tek sonuç doğrudan önizlenir; birden fazla ise kullanıcı seçer
      if (files.length === 1) this.selectedKey.set(fileKey(files[0]));
    } catch (err) {
      console.error(err);
      this.error.set(scanPoolErrorMessage(err, 'Taranan belgeler aranamadı.'));
    } finally {
      this.searching.set(false);
      this.focusQrSoon();
    }
  }

  select(file: ScanFileModel): void {
    if (this.transferring()) return;
    this.selectedKey.set(fileKey(file));
  }

  async confirm(): Promise<void> {
    const file = this.selected();
    const documentNumber = this.searchedCode();
    const userId = this.userId();
    if (!file || !documentNumber || this.busy()) return;
    if (!userId) {
      this.error.set('Kullanıcı bilgisi bulunamadı.');
      return;
    }

    this.transferring.set(true);
    this.error.set('');
    try {
      // Belge havuzdan alınıp evrak takibe kopyalanır; birkaç saniye sürebilir
      await firstValueFrom(this.service.transferScannedDocument(file.source, file.fileName, documentNumber, userId));
      this.transferring.set(false);
      this.transferred.emit(documentNumber);
    } catch (err) {
      console.error(err);
      this.transferring.set(false);
      const message = scanPoolErrorMessage(err);
      // Belge başka kullanıcı tarafından alınmışsa sonuçlar yenilenir; hata yine görünür kalır
      if (message.includes(SCAN_FILE_TAKEN_TEXT)) {
        this.qrCode.set(documentNumber);
        await this.search();
      }
      this.error.set(message);
    }
  }

  cancel(): void {
    if (this.transferring()) return;
    this.cancelled.emit();
  }

  sizeLabel(bytes: number): string {
    const kb = (bytes ?? 0) / 1024;
    return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
  }

  private focusQrSoon(): void {
    setTimeout(() => this.qrInput()?.nativeElement.focus());
  }
}
