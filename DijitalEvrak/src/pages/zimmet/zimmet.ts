import { ChangeDetectionStrategy, Component, inject, OnInit, OnDestroy, signal, ViewEncapsulation } from '@angular/core';
import GenericModel from '../../../components/generic-model/generic-model';
import { QRCodeComponent } from 'angularx-qrcode';
import { CommonModule } from '@angular/common';
import { FlexiToastService } from 'flexi-toast';
import { FormsModule } from '@angular/forms';
import { DocumentService } from '../../services/document';

@Component({
  imports: [
    GenericModel,
    QRCodeComponent,
    CommonModule,
    FormsModule
  ],
  templateUrl: './zimmet.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Zimmet implements OnInit, OnDestroy {

  // === QR READER FIX ===
  private buffer: string = '';
  private keydownHandler: any;

  documents = Array.from({ length: 1 }, (_, i) => `2025/2525567/${i + 1}`);
  readonly #toast = inject(FlexiToastService);
  detailsVisible = signal(false);
  alertVisible = signal(true);
  backButtonVisible = signal(false);
  saveModalVisible = signal(false);
  saveModalDetailVisible = signal(false);
  scannedDocumentNo = signal<string | null>(null);
  id!: string | null;
  doc = signal<string>('');
  private documentService = inject(DocumentService);

  zimmetType: 'self' | 'other' = 'other';
  selectedPersonId = 0;
  currentUserName = 'Bülent Arslan';

  personList = [
    { id: 1, name: 'Oral Akçakoyun' },
    { id: 2, name: 'Bahadır Uzun' },
    { id: 3, name: 'Bülent Arslan' },
  ];

  ngOnInit() {
    this.id = this.documentService.currentZimmetDocumentId;

    if (this.id) {
      this.detailsVisible.set(true);
      this.saveModalVisible.set(true);
      this.alertVisible.set(false);
      this.backButtonVisible.set(true);
      this.saveModalDetailVisible.set(false);

      this.getir(this.id);
    }

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
    if (e.key === 'Enter') {
      this.onQrScanned(this.buffer.trim());
      this.buffer = '';
    } else {
      this.buffer += e.key;
    }
  }

  // QR kod okunduğunda tetiklenecek fonksiyon
  onQrScanned(result: string) {
    if (result) {
      this.scannedDocumentNo.set(result);
      this.detailsVisible.set(true);
      this.backButtonVisible.set(true);
      this.alertVisible.set(false);
      this.saveModalDetailVisible.set(false);
    } else {
      this.#toast.showToast('Bilgi', 'Lütfen QR Kodu Okutunuz veya Belge Numarasını Girerek Enter Tuşuna Basınız.', 'warning');
    }
  }

  getir(id: string) {
    this.documentService.getDocumentById(id).subscribe(docs => {
      if (!docs) return;
      this.doc.set(docs.id);
      this.scannedDocumentNo.set(this.doc());
    });
  }

  backToQrScan() {
    this.detailsVisible.set(false);
    this.saveModalVisible.set(false);
    this.scannedDocumentNo.set(null);
    this.documentService.clearZimmetDocument();
    this.alertVisible.set(true);
    this.backButtonVisible.set(false);
    this.saveModalDetailVisible.set(false);
    this.id = null;
  }

  saveZimmet() {
    this.saveModalVisible.set(true);
    this.detailsVisible.set(false);
    this.alertVisible.set(false);
    this.saveModalDetailVisible.set(true);
    this.id = null;
    this.#toast.showToast('Bilgi', 'Zimmetleme İşlemi Tamamlandı');
  }
}
