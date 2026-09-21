import { ChangeDetectionStrategy, Component, inject, OnInit, OnDestroy, signal, ViewEncapsulation, computed } from '@angular/core';
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
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Onkayit implements OnInit, OnDestroy {
  // === QR READER FIX ===
  private buffer: string = '';
  private keydownHandler: any;
  private router = inject(Router);
  previewOpen = false;
  previewData = {};
  fullName: string = "";
  tckn: string = "";
  readonly user = computed(() => this.#common.user());
  readonly #common = inject(Common);

  readonly #toast = inject(FlexiToastService);
  detailsVisible = signal(false);
  alertVisible = signal(true);
  backButtonVisible = signal(false);
  scannedDocumentNo = signal<string | null>(null);
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

  ngOnDestroy() {
    // === QR CLEANUP ===
    window.removeEventListener('keydown', this.keydownHandler);
  }

  loadAllocation(documentId: string) {
    console.log(documentId);
    this.allocationService
      .getActiveByDocumentId(documentId)
      .subscribe({
        next: (res: DocumentAllocationModel | null) => {
          if (res) {
            //console.log(res);
            this.allocations.set(res); // Eğer veri varsa, allocations'a ata
          } else {
            console.warn('Aktif Zimmet bulunamadı.');
            this.allocations.set(null);
          }
        },
        error: (err) => {
          console.error('Allocation API hatası:', err);
        }
      });
  };

  private handleKeydown(e: KeyboardEvent) {
    if (!this.detailsVisible()) {
      if (e.key === 'Enter') {
        this.onQrScanned(this.buffer.trim());
        this.buffer = '';
      } else {
        this.buffer += e.key;
      }
    }
  }

  // QR kod okunduğunda tetiklenecek fonksiyon
  onQrScanned2(result: string) {
    if (result) {
      this.scannedDocumentNo.set(result);
      this.detailsVisible.set(true);
      this.backButtonVisible.set(true);
      this.alertVisible.set(false);
    } else {
      this.#toast.showToast('Bilgi', 'Lütfen QR Kodu Okutunuz veya Belge Numarasını Girerek Enter Tuşuna Basınız.', 'warning');
    }
  }

  onQrScanned(result: string) {
    if (!result) {
      this.#toast.showToast(
        'Bilgi',
        'Lütfen QR Kodu Okutunuz veya Belge Numarasını Girerek Enter Tuşuna Basınız.',
        'warning'
      );
      return;
    }

    this.incomingDocumentService.GetByQrCode(result).subscribe(doc => {
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

      }
      else {
        // on kayit yoksa olustur
        this.docStatus.set(2);
        const userId = this.user()?.id;
        if (!userId) {
          this.#toast.showToast('Hata', 'Kullanıcı bilgisi bulunamadı.', 'error');
          return;
        }

        const model: IncomingDocumentPreRegisterModel = {
          id: result,
          qrCode: result,
          userId: userId!,
          userType: 1,
          documentDirection : 1,
          isDeleted: false,
          createdDate: new Date()
        };

        //on kayit islemi ....
        this.incomingDocumentService.createIncomingDocumentPreRegister(model).subscribe({
          next: (res) => {
            console.log("PreRegister:", res);
            if (!res) {
              return; // Id yoksa, yani kayit zaten varsa → sessiz geç
            }
            // Başarılı ise, allocation yüklemesini yapalım
            this.loadAllocation(res.id);
            this.#toast.showToast('Başarılı', 'Ön kayıt tamamlandı.', 'success');
          },
          error: () => {
            this.#toast.showToast('Hata', 'Ön kayıt oluşturulamadı.', 'error');
          }
        });
      }

    });

    this.scannedDocumentNo.set(result);
    this.detailsVisible.set(true);
    this.backButtonVisible.set(true);
    this.alertVisible.set(false);
  }

  getir(id: string) {
    this.incomingDocumentService.getIncomingDocumentByDocumentId(id).subscribe(docs => {
      if (!docs) return;
      //this.doc.set(docs.belgeId);
      this.scannedDocumentNo.set(this.doc());
    });
  }

  backToQrScan() {
    this.detailsVisible.set(false);
    this.scannedDocumentNo.set(null);
    this.alertVisible.set(true);
    this.backButtonVisible.set(false);
    this.id = null;
    this.fullName = "";
    this.tckn = "";
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
