import { ChangeDetectionStrategy, Component, inject, OnInit, OnDestroy, signal, ViewEncapsulation, computed } from '@angular/core';
import GenericModel from '../../../components/generic-model/generic-model';
import { QRCodeComponent } from 'angularx-qrcode';
import { CommonModule } from '@angular/common';
import { FlexiToastService } from 'flexi-toast';
import { FormsModule } from '@angular/forms';
import { DocumentService } from '../../services/document';
import { PrintPreview } from '../printpreview/printpreview';
import { Router } from '@angular/router';
import { IncomingDocumentService } from '../../services/incomingdocument';
import { IncomingDocumentPreRegisterModel } from '../../models/incoming-document/incomingdocument-pregister.model';
import { Common } from '../../services/common';


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

  documents = Array.from({ length: 1 }, (_, i) => `2025/2525567/${i + 1}`);
  readonly #toast = inject(FlexiToastService);
  detailsVisible = signal(false);
  alertVisible = signal(true);
  backButtonVisible = signal(false);
  scannedDocumentNo = signal<string | null>(null);
  id!: string | null;
  doc = signal<string>('');
  private documentService = inject(DocumentService);
  private incomingDocumentService = inject(IncomingDocumentService);


  ngOnInit() {

    // === QR READER SETUP ===
    this.keydownHandler = (e: KeyboardEvent) => {
      this.handleKeydown(e);
    };

    window.addEventListener('keydown', this.keydownHandler);
  }

  ngOnDestroy() {
    // === QR CLEANUP ===
    window.removeEventListener('keydown', this.keydownHandler);
  }

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

  this.scannedDocumentNo.set(result);
  this.detailsVisible.set(true);
  this.backButtonVisible.set(true);
  this.alertVisible.set(false);

  // 🔹 Kullanıcı Id (localStorage / token içinden alınmalı)
  //const userId = localStorage.getItem('userId'); // login sırasında kaydetmiş olman lazım
  const userId = this.user()?.id;
  if (!userId) {
    this.#toast.showToast('Hata', 'Kullanıcı bilgisi bulunamadı.', 'error');
    return;
  }

const model: IncomingDocumentPreRegisterModel = {
  qrCode: result,
  userId: userId!,
  isDeleted: false,
  createdDate: new Date()
};

//on kayit islemi ....
  this.incomingDocumentService.createIncomingDocumentPreRegister(model).subscribe({    
    next: (res) => {
        console.log("PreRegister response:", res);
       if (!res.created) {
      return; // zaten vardı → sessiz geç
    }
      this.#toast.showToast('Başarılı', 'Ön kayıt tamamlandı.', 'success');
    },
    error: () => {
      this.#toast.showToast('Hata', 'Ön kayıt oluşturulamadı.', 'error');
    }
  });
}

  getir(id: string) {
    this.documentService.getDocumentById(id).subscribe(docs => {
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
    this.documentService.setSelectedDocument(this.scannedDocumentNo()!);
    this.documentService.setDocumentUpdateType('2'); // document number gonderiliyorsa 
    this.router.navigate(['/evrakkayit']);
  }

}
