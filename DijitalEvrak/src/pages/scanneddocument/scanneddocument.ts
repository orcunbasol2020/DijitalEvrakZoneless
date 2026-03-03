import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
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

  // ===============================
  // DOCUMENT STATE
  // ===============================
  readonly documentsResource = signal<any>(null);

  readonly scannedDocuments = computed<ScannedDocumentModel[]>(() =>
    this.documentsResource()?.value?.() ?? []
  );

  readonly currentIndex = signal(0);

  readonly currentDocument = computed(() =>
    this.scannedDocuments()[this.currentIndex()] ?? null
  );

  readonly currentDocumentId = computed(() => {
    const doc = this.currentDocument();
    return doc ? doc.id : null;
  });

  readonly pdfUrl = computed<SafeResourceUrl>(() => {
    const doc = this.currentDocument();
    if (!doc?.fileName) return '';

    const url =
      this.service.getPdfUrl(doc.fileName) + '#zoom=70';

    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  // ===============================
  // QR STATE
  // ===============================
  private buffer = '';
  private keydownHandler!: (e: KeyboardEvent) => void;

  readonly qrContent = signal<string | null>(null);
  readonly alertVisible = signal(true);

  qrContentEditable = '';
  readonly qrEditable = signal<string>('');

  // 🔹 QR effect constructor içinde
  constructor() {
    effect(() => {
      const content = this.qrContent();
      if (content) {
        this.qrContentEditable = content;
      }
    });
  }

  ngOnInit() {
    this.loadDocuments();

    // USB QR reader
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

  loadDocuments() {
    this.currentIndex.set(0);
    this.documentsResource.set(
      this.service.getScannedDocuments()
    );
  }

  // ===============================
  // NAVIGATION
  // ===============================
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

  // ===============================
  // QR LOGIC
  // ===============================
  onQrScanned(result: string) {
    if (!result) {
      this.toast.showToast(
        'Bilgi',
        'Lütfen QR kod okutunuz veya manuel giriş yapınız.',
        'warning'
      );
      return;
    }

    this.qrContent.set(result);
    this.alertVisible.set(false);

    const content = this.qrContent();
    if (content) {
      this.qrEditable.set(content);
    }

    this.toast.showToast(
      'QR Okundu',
      `Okunan içerik: ${result}`,
      'success'
    );
  }

matchQr() {
  const documentId = this.currentDocumentId();
  const documentNumber = this.qrEditable()?.trim();

  if (!documentId) {
    this.toast.showToast(
      'Hata',
      'Eşleştirilecek belge bulunamadı.',
      'error'
    );
    return;
  }

  if (!documentNumber) {
    this.toast.showToast(
      'Uyarı',
      'Belge numarası boş olamaz.',
      'warning'
    );
    return;
  }

  this.service
    .updateScannedDocumentNumber(documentId, documentNumber)
    .subscribe({
      next: () => {
        this.toast.showToast(
          'Başarılı',
          'Belge numarası başarıyla eşleştirildi.',
          'success'
        );

        // İstersen otomatik sonraki belgeye geç
        //this.next();
      },
      error: (err) => {
        console.error(err);
        this.toast.showToast(
          'Hata',
          'Belge eşleştirilirken bir hata oluştu.',
          'error'
        );
      }
    });
}

  goToManual() {
    this.alertVisible.set(false);
  }

  resetQr() {
    this.qrContent.set(null);
    this.qrEditable.set(''); // inputu da resetle
    this.alertVisible.set(true);
  }
}