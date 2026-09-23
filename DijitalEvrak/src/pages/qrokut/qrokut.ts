import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, inject, OnInit, OnDestroy, signal, ViewChild, ViewEncapsulation } from '@angular/core';
import GenericModel from '../../../components/generic-model/generic-model';
import { CommonModule } from '@angular/common';
import { FlexiToastService } from 'flexi-toast';
import { Router, RouterModule } from '@angular/router';
import { IncomingDocumentService } from '../../services/incomingdocument';

type ScanResult = { code: string; kind: 'notfound' | 'notscanned' };

@Component({
  imports: [
    GenericModel,
    CommonModule,
    RouterModule
  ],
  templateUrl: './qrokut.html',
  // Görsel dil Ön Kayıt / Giden Evrak Teslim Al ekranlarıyla aynı; ortak zm-*
  // sınıfları zimmet.css'ten, durum şeridi (ok-status) onkayit.css'ten gelir.
  styleUrls: ['../gidenevrak/zimmet/zimmet.css', '../onkayit/onkayit.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Qrokut implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('qrInput') qrInput?: ElementRef<HTMLInputElement>;
  // QR okutma alanı odaktayken "Okumaya Hazır" durumunu gösterir.
  qrActive = false;
  // Sorgu sürerken tekrar okutma yok sayılır ve spinner gösterilir.
  readonly loading = signal(false);
  // Son okutulan numara ve yönlendirme yapılamadıysa nedeni.
  readonly lastCode = signal<string | null>(null);
  readonly lastResult = signal<ScanResult | null>(null);

  private incomingDocumentService = inject(IncomingDocumentService);
  readonly #toast = inject(FlexiToastService);
  private readonly router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private buffer: string = '';
  private keydownHandler: any;

  ngOnInit() {
    this.keydownHandler = (e: KeyboardEvent) => {
      this.handleKeydown(e);
    };
    // sadece bu component çalışırken aktif
    window.addEventListener('keydown', this.keydownHandler);
  }

  ngAfterViewInit(): void {
    this.focusQrInputSoon();
  }

  // başka componentlere geçince listener kaldırılır
  ngOnDestroy() {
    window.removeEventListener('keydown', this.keydownHandler);
  }

  // Odak bir form alanındayken (QR alanının kendisi dahil) tuşlar tampona
  // alınmaz; alan kendi keydown olayıyla Enter'ı işler.
  private handleKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;

    if (e.key === 'Enter') {
      this.redirectEvrakKayit(this.buffer.trim());
      this.buffer = '';
    } else if (e.key.length === 1) {
      this.buffer += e.key;
    }
  }

  private focusQrInputSoon() {
    setTimeout(() => this.qrInput?.nativeElement.focus());
  }

  // QR alanına yazıp / okutup Enter'a basılınca çalışır; alan temizlenir.
  onQrKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    event.preventDefault();

    const input = event.target as HTMLInputElement;
    const value = input.value.trim();
    if (!value) return;

    this.redirectEvrakKayit(value);
    input.value = '';
  }

  reset() {
    this.lastCode.set(null);
    this.lastResult.set(null);
    this.buffer = '';
    this.focusQrInputSoon();
  }

  // QR okunduğunda: evrak varsa ve taranmışsa kayıt ekranına geçilir,
  // aksi halde neden geçilemediği sol panelde gösterilir.
  redirectEvrakKayit(result: string) {
    if (this.loading()) return;

    if (!result) {
      this.#toast.showToast(
        'Bilgi',
        'Lütfen QR Kodu Okutunuz veya Belge Numarasını Girerek Enter Tuşuna Basınız.',
        'warning'
      );
      return;
    }

    this.lastCode.set(result);
    this.lastResult.set(null);
    this.loading.set(true);
    // QR okuyucu native window 'keydown' olayı üzerinden tetiklendiğinde OnPush
    // bileşen otomatik işaretlenmiyor; spinner'ın hemen görünmesi için elle bildirilir.
    this.cdr.markForCheck();

    this.incomingDocumentService.GetByQrCode(result).subscribe({
      next: doc => {
        if (!doc) {
          this.lastResult.set({ code: result, kind: 'notfound' });
          this.#toast.showToast(
            'Belge bulunamadı',
            'Girilen QR koda ait herhangi bir belge bulunamadı.',
            'error'
          );
          this.finishLoading();
          return;
        }

        if (!doc.documentName) {
          this.lastResult.set({ code: result, kind: 'notscanned' });
          this.#toast.showToast(
            "Belge henüz taranmamış",
            "Tarama işlemi tamamlandıktan sonra belge kayıt ekranına geçiş yapabilirsiniz."
          );
          this.finishLoading();
          return;
        }

        this.loading.set(false);
        this.incomingDocumentService.setSelectedIncomingDocument(result);
        this.incomingDocumentService.setIncomingDocumentUpdateType("2");
        this.router.navigate(['/evrakkayit']);
      },
      error: () => {
        this.#toast.showToast('Hata', 'Evrak sorgulanamadı.', 'error');
        this.finishLoading();
      }
    });
  }

  private finishLoading() {
    this.loading.set(false);
    this.cdr.markForCheck();
    this.focusQrInputSoon();
  }
}
