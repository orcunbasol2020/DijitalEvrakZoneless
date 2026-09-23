import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, inject, OnInit, OnDestroy, signal, ViewChild, ViewEncapsulation, computed } from '@angular/core';
import GenericModel from '../../../components/generic-model/generic-model';
import { QRCodeComponent } from 'angularx-qrcode';
import { CommonModule } from '@angular/common';
import { FlexiToastService } from 'flexi-toast';
import { FormsModule } from '@angular/forms';
import { PrintPreview } from '../printpreview/printpreview';
import { Router } from '@angular/router';
import { IncomingDocumentService } from '../../services/incomingdocument';
import { IncomingDocumentPreRegisterModel } from '../../models/incoming-document/incomingdocument-pregister.model';
import { Common } from '../../services/common';
import { DocumentAllocationModel } from '../../models/documentallocation.model';
import { DocumentAllocation } from '../../services/documentallocation';


@Component({
  imports: [
    GenericModel,
    QRCodeComponent,
    CommonModule,
    FormsModule,
    PrintPreview
  ],
  templateUrl: './onkayit.html',
  // Görsel dil Giden Evrak Teslim Al ekranıyla aynı; ortak zm-* sınıfları
  // zimmet.css'ten, ön kayıta özgü ok-* sınıfları onkayit.css'ten gelir.
  styleUrls: ['../gidenevrak/zimmet/zimmet.css', './onkayit.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Onkayit implements OnInit, AfterViewInit, OnDestroy {
  // === QR READER ===
  private buffer: string = '';
  private keydownHandler: any;
  @ViewChild('qrInput') qrInput?: ElementRef<HTMLInputElement>;
  // QR okutma alanı odaktayken "Okumaya Hazır" durumunu gösterir.
  qrActive = false;
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  previewOpen = false;
  previewData = {};
  fullName: string = "";
  tckn: string = "";
  readonly user = computed(() => this.#common.user());
  readonly #common = inject(Common);

  readonly #toast = inject(FlexiToastService);
  detailsVisible = signal(false);
  // Ön kayıt isteği sürerken okutma alanı kilitlenir ve sonuç yerine spinner gösterilir.
  loading = signal(false);
  scannedDocumentNo = signal<string | null>(null);
  // 1: evrak daha önce kaydedilmiş, 2: ön kayıt bu okutmada oluşturuldu
  docStatus = signal<number | null>(null);
  id!: string | null;
  doc = signal<string>('');
  private incomingDocumentService = inject(IncomingDocumentService);
  allocations = signal<DocumentAllocationModel | null>(null);
  private allocationService = inject(DocumentAllocation);

  ngOnInit() {
    this.keydownHandler = (e: KeyboardEvent) => {
      this.handleKeydown(e);
    };
    window.addEventListener('keydown', this.keydownHandler);
  }

  ngAfterViewInit(): void {
    this.focusQrInputSoon();
  }

  ngOnDestroy() {
    // === QR CLEANUP ===
    window.removeEventListener('keydown', this.keydownHandler);
  }

  loadAllocation(documentId: string) {
    this.allocationService
      .getActiveByDocumentId(documentId)
      .subscribe({
        next: (res: DocumentAllocationModel | null) => {
          if (res) {
            this.allocations.set(res);
          } else {
            console.warn('Aktif Zimmet bulunamadı.');
            this.allocations.set(null);
          }
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Allocation API hatası:', err);
          this.cdr.markForCheck();
        }
      });
  };

  // Odak bir form alanındayken (dilekçe formu, QR alanının kendisi) tuşlar
  // tampona alınmaz; aksi halde oraya yazılan metin QR olarak okunmaya çalışılırdı.
  private handleKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;

    // Okutma alanı daraltılmışken okuyucu pasiftir; tuşlar tampona alınmaz.
    if (this.scanCollapsed) {
      this.buffer = '';
      return;
    }

    if (!this.detailsVisible()) {
      if (e.key === 'Enter') {
        this.onQrScanned(this.buffer.trim());
        this.buffer = '';
      } else if (e.key.length === 1) {
        this.buffer += e.key;
      }
    }
  }

  private focusQrInputSoon() {
    setTimeout(() => this.qrInput?.nativeElement.focus());
  }

  // Ön kayıt tamamlanınca QR okutma bloğu tek satıra daralır; böylece sonuç
  // kartlarına yer açılır. Daraltılmışken okuyucu pasiftir (handleKeydown
  // tuşları yoksayar); kullanıcı "Aç" ile açınca yeniden aktif olur.
  scanCollapsed = false;

  collapseScan(): void {
    if (this.scanCollapsed) return;
    this.scanCollapsed = true;
    this.buffer = '';
    // Gizlenen alandaki odak kalmasın; "Okumaya Hazır" chip'i de pasife dönsün.
    this.qrInput?.nativeElement.blur();
    this.qrActive = false;
    this.cdr.markForCheck();
  }

  expandScan(): void {
    if (!this.scanCollapsed) return;
    this.scanCollapsed = false;
    this.cdr.markForCheck();
    this.focusQrInputSoon();
  }

  // QR alanına yazıp / okutup Enter'a basılınca çalışır; alan temizlenir.
  onQrKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    event.preventDefault();

    const input = event.target as HTMLInputElement;
    const value = input.value.trim();
    if (!value) return;

    this.onQrScanned(value);
    input.value = '';
  }

  onQrScanned(result: string) {
    if (this.loading()) return;

    if (!result) {
      this.#toast.showToast(
        'Bilgi',
        'Lütfen QR Kodu Okutunuz veya Belge Numarasını Girerek Enter Tuşuna Basınız.',
        'warning'
      );
      return;
    }

    this.scannedDocumentNo.set(result);
    this.docStatus.set(null);
    this.allocations.set(null);
    this.detailsVisible.set(true);
    this.loading.set(true);
    // QR okuyucu native window 'keydown' olayı üzerinden tetiklendiğinde OnPush
    // bileşen otomatik işaretlenmiyor; spinner'ın hemen görünmesi için elle bildirilir.
    this.cdr.markForCheck();

    this.incomingDocumentService.GetByQrCode(result).subscribe({
      next: doc => {
        if (doc) {
          this.docStatus.set(1);
          if (doc.status === 1)
            this.#toast.showToast('Bilgi', 'Evrak ön kayıt işlemi daha önce yapılmış.', 'info');
          else
            this.#toast.showToast('Bilgi', 'Evrak kaydı daha önce yapılmış.', 'info');

          if (doc.id && doc.status === 1) {
            this.loadAllocation(doc.id);
          }
          else
            this.allocations.set(null);

          this.finishLoading();
          return;
        }

        // Ön kayıt yoksa oluştur
        this.docStatus.set(2);
        const userId = this.user()?.id;
        if (!userId) {
          this.#toast.showToast('Hata', 'Kullanıcı bilgisi bulunamadı.', 'error');
          this.finishLoading();
          return;
        }

        const model: IncomingDocumentPreRegisterModel = {
          id: result,
          qrCode: result,
          userId: userId!,
          userType: 1,
          documentDirection: 1,
          isDeleted: false,
          createdDate: new Date()
        };

        this.incomingDocumentService.createIncomingDocumentPreRegister(model).subscribe({
          next: (res) => {
            // Id yoksa kayıt zaten vardır; sessiz geçilir.
            if (res) {
              this.loadAllocation(res.id);
              this.#toast.showToast('Başarılı', 'Ön kayıt tamamlandı.', 'success');
            }
            this.finishLoading();
          },
          error: () => {
            this.#toast.showToast('Hata', 'Ön kayıt oluşturulamadı.', 'error');
            this.finishLoading();
          }
        });
      },
      error: () => {
        // Sorgu başarısızsa sonuç gösterilmez; okutma ekranına dönülür.
        this.#toast.showToast('Hata', 'Evrak sorgulanamadı.', 'error');
        this.loading.set(false);
        this.detailsVisible.set(false);
        this.scannedDocumentNo.set(null);
        this.cdr.markForCheck();
        this.focusQrInputSoon();
      }
    });
  }

  // İstek bitince sonuç gösterilir ve QR bloğu daraltılır (zimmet ekranıyla
  // aynı davranış). Yeni evrak için kullanıcı "Aç" ya da "Yeni Okutma"yı kullanır.
  private finishLoading() {
    this.loading.set(false);
    this.collapseScan();
    this.cdr.markForCheck();
  }

  // Zimmet sahibinin ad-soyad baş harfleri (avatar).
  initials(fullName: string | null | undefined): string {
    const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const first = parts[0].charAt(0);
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return `${first}${last}`.toLocaleUpperCase('tr');
  }

  getir(id: string) {
    this.incomingDocumentService.getIncomingDocumentByDocumentId(id).subscribe(docs => {
      if (!docs) return;
      this.scannedDocumentNo.set(this.doc());
    });
  }

  backToQrScan() {
    this.detailsVisible.set(false);
    this.scannedDocumentNo.set(null);
    this.docStatus.set(null);
    this.allocations.set(null);
    this.loading.set(false);
    this.buffer = '';
    this.id = null;
    this.fullName = "";
    this.tckn = "";
    this.scanCollapsed = false;
    this.focusQrInputSoon();
  }

  openPreview() {
    if (!this.fullName || !this.tckn) {
      this.#toast.showToast("Uyarı", "Lütfen Ad Soyad ve T.C. Kimlik Numarasını Giriniz.", "warning");
      return;
    }
    this.previewData = {
      fullName: this.fullName,
      tckn: this.tckn,
      applicationNo: this.scannedDocumentNo(), // QR ile gelen belge numarası
      barcode: this.scannedDocumentNo()
    };

    this.previewOpen = true;
  }

  allowOnlyNumbers(event: KeyboardEvent) {
    const allowedKeys = ['Backspace', 'ArrowLeft', 'ArrowRight', 'Tab', 'Delete'];

    if (allowedKeys.includes(event.key)) {
      return;
    }

    if (!/^[0-9]$/.test(event.key)) {
      event.preventDefault();
    }
  }

  goToDetail() {
    this.incomingDocumentService.setSelectedIncomingDocument(this.scannedDocumentNo()!);// qr kod
    this.incomingDocumentService.setIncomingDocumentUpdateType("2");
    this.router.navigate(['/evrakkayit']);
  }

}
