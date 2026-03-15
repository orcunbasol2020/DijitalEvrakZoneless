import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  ViewEncapsulation,
  OnInit,
  OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import GenericModel from '../../../components/generic-model/generic-model';
import { ScannedDocumentService } from '../../services/scanneddocument';
import { ScannedDocumentModel } from '../../models/scanneddocument.model';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FlexiToastService } from 'flexi-toast';
import { Common } from '../../services/common';

@Component({
  imports: [CommonModule, GenericModel],
  templateUrl: './scanneddocument.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Scanneddocument implements OnInit, OnDestroy {

  private service = inject(ScannedDocumentService);
  private sanitizer = inject(DomSanitizer);
  private toast = inject(FlexiToastService);
  readonly #common = inject(Common);

  readonly user = computed(() => this.#common.user());

  readonly scannedDocuments = signal<ScannedDocumentModel[]>([]);
  readonly currentIndex = signal(0);
  readonly currentDocument = computed(() => this.scannedDocuments()[this.currentIndex()] ?? null);
  readonly currentDocumentId = computed(() => this.currentDocument()?.id ?? null);

  readonly pdfUrl = computed<SafeResourceUrl>(() => {
    const doc = this.currentDocument();
    if (!doc?.fileName) return '';
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      this.service.getPdfUrl(doc.fileName) + '#zoom=100'
    );
  });

  // Loading / veri var mı kontrol
  readonly isLoading = signal(false);
  readonly isPdfData = signal(false);

  // QR state
  readonly qrContent = signal<string | null>(null);
  readonly qrEditable = signal<string>('');
  qrContentEditable = '';
  readonly alertVisible = signal(true);

  private buffer = '';
  private keydownHandler!: (e: KeyboardEvent) => void;

  constructor() {}

  ngOnInit() {
    this.loadDocuments();

    // QR reader
    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        this.onQrScanned(this.buffer.trim());
        this.buffer = '';
      } else {
        this.buffer += e.key;
      }
    };

    window.addEventListener('keydown', this.keydownHandler);
  }

  ngOnDestroy() {
    window.removeEventListener('keydown', this.keydownHandler);
  }

  // ========== DOCUMENTS ==========
  async loadDocuments() {
    this.isLoading.set(true);
    this.isPdfData.set(false);
    this.currentIndex.set(0);

    try {
      const docs = await this.service.getScannedDocuments();
      this.scannedDocuments.set(docs);
      this.isPdfData.set(docs.length > 0);
    } catch (err) {
      console.error(err);
      this.scannedDocuments.set([]);
      this.isPdfData.set(false);
    } finally {
      this.isLoading.set(false);
    }
  }

  prev() {
    if (this.currentIndex() > 0) {
      this.currentIndex.update(i => i - 1);
      this.resetQr();
    }
  }

  next() {
    if (this.currentIndex() < this.scannedDocuments().length - 1) {
      this.currentIndex.update(i => i + 1);
      this.resetQr();
    }
  }

  // ========== QR ==========
  onQrScanned(result: string) {
    if (!result) {
      this.toast.showToast('Bilgi', 'Lütfen QR kod okutunuz veya manuel giriş yapınız.', 'warning');
      return;
    }

    this.qrContent.set(result);
    this.qrEditable.set(result);
    this.qrContentEditable = result;
    this.alertVisible.set(false);

    this.toast.showToast('QR Okundu', `Okunan içerik: ${result}`, 'success');
  }

  async matchQr() {
    const documentId = this.currentDocumentId();
    const documentNumber = this.qrEditable()?.trim();
    const userId = this.user()?.id;

    if (!userId) return this.toast.showToast("Hata", "Kullanıcı bilgisi alınamadı", "error");
    if (!documentId) return this.toast.showToast('Hata', 'Eşleştirilecek belge bulunamadı.', 'error');
    if (!documentNumber) return this.toast.showToast('Uyarı', 'Belge numarası boş olamaz.', 'warning');

    this.isLoading.set(true);

    try {
      await this.service.updateScannedDocumentNumber(documentId, documentNumber, userId).toPromise();
      this.toast.showToast('Başarılı', 'Belge eşleştirildi.', 'success');

      this.resetQr();
      await this.loadDocuments(); // listeyi yeniden yükle
    } catch (err) {
      console.error(err);
      this.toast.showToast('Hata', 'Belge eşleştirilirken bir hata oluştu.', 'error');
    } finally {
      this.isLoading.set(false);
    }
  }

  goToManual() {
    this.alertVisible.set(false);
  }

  resetQr() {
    this.qrContent.set(null);
    this.qrEditable.set('');
    this.qrContentEditable = '';
    this.alertVisible.set(true);
  }
}