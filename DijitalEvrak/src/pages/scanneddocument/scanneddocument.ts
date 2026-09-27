import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  ViewChild,
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
import { firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';
import { IncomingDocumentService } from '../../services/incomingdocument';

@Component({
  imports: [CommonModule, GenericModel],
  templateUrl: './scanneddocument.html',
  // Görsel dil Ön Kayıt / Evrak Kayıt ekranlarıyla aynı; ortak zm-* sınıfları
  // zimmet.css'ten gelir, görüntüleyici ve eşleştirme özeti (sd-*) bu ekrana özgüdür.
  styleUrls: ['../gidenevrak/zimmet/zimmet.css', './scanneddocument.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Scanneddocument implements OnInit, OnDestroy {
  @ViewChild('qrInput') qrInput?: ElementRef<HTMLInputElement>;

  private service = inject(ScannedDocumentService);
  private sanitizer = inject(DomSanitizer);
  private toast = inject(FlexiToastService);
  readonly #common = inject(Common);
  private router = inject(Router);
  private incomingDocumentService = inject(IncomingDocumentService);

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

  readonly isLoading = signal(false);
  readonly saving = signal(false);
  // Yükleme göstergesi yalnızca basılan düğmede görünür.
  readonly savingAction = signal<'next' | 'register' | null>(null);

  // Okutulan / yazılan belge numarası; eşleştirmeden önce düzenlenebilir.
  readonly qrEditable = signal<string>('');
  // QR alanı odaktayken "Hazır" durumunu gösterir.
  qrActive = false;

  private buffer = '';
  private keydownHandler!: (e: KeyboardEvent) => void;

  ngOnInit() {
    this.loadDocuments();

    // Odak bir form alanındayken (QR alanının kendisi dahil) tuşlar tampona alınmaz;
    // alan kendi keydown olayıyla Enter'ı işler. Aksi halde okuyucu girdisi tampona
    // toplanır ve Enter ile QR alanına aktarılır.
    this.keydownHandler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
      if (!this.currentDocument() || this.saving()) return;

      if (e.key === 'Enter') {
        this.onQrScanned(this.buffer.trim());
        this.buffer = '';
      } else if (e.key.length === 1) {
        this.buffer += e.key;
      }
    };

    window.addEventListener('keydown', this.keydownHandler);
  }

  ngOnDestroy() {
    window.removeEventListener('keydown', this.keydownHandler);
  }

  // ========== DOCUMENTS ==========
  // keepIndex: eşleştirme sonrası aynı sıradaki (bir sonraki) evrakta kalınır.
  async loadDocuments(keepIndex = false) {
    const index = keepIndex ? this.currentIndex() : 0;
    this.isLoading.set(true);

    try {
      const docs = await this.service.getScannedDocuments();
      this.scannedDocuments.set(docs);
      // Eşleşen evrak listeden düştüğü için aynı sıra bir sonraki evrağı gösterir; eşleşen evrak
      // listenin sonundaysa önceki (zaten geçilmiş) evraka dönmek yerine baştan devam edilir.
      this.currentIndex.set(index < docs.length ? index : 0);
    } catch (err) {
      console.error(err);
      this.scannedDocuments.set([]);
      this.currentIndex.set(0);
    } finally {
      this.isLoading.set(false);
      this.focusQrInputSoon();
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
  onQrKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    this.onQrScanned((event.target as HTMLInputElement).value.trim());
  }

  // Okutulan numara alana yazılır; eşleştirme kullanıcı onayıyla ("Eşleştir") yapılır.
  onQrScanned(result: string) {
    if (!result) {
      this.toast.showToast('Bilgi', 'Lütfen QR kodu okutunuz veya belge numarasını yazınız.', 'warning');
      return;
    }
    this.qrEditable.set(result);
    this.focusQrInputSoon();
  }

  // openRegistration: eşleştirme sonrası sıradaki evraka geçmek yerine, eşleşen evrağın
  // kaydını tamamlamak için Evrak Kayıt ekranı açılır (evrak belge numarası/qrCode ile yüklenir).
  async matchQr(openRegistration = false) {
    const doc = this.currentDocument();
    const documentNumber = this.qrEditable().trim();
    const userId = this.user()?.id;

    if (!userId) return this.toast.showToast('Hata', 'Kullanıcı bilgisi alınamadı', 'error');
    if (!doc?.id) return this.toast.showToast('Hata', 'Eşleştirilecek belge bulunamadı.', 'error');
    if (!documentNumber) return this.toast.showToast('Uyarı', 'Belge numarası boş olamaz.', 'warning');
    if (this.saving()) return;

    this.saving.set(true);
    this.savingAction.set(openRegistration ? 'register' : 'next');

    try {
      // Numaraya bağlı gelen evrakta zaten dosya varsa numara daha önce kullanılmıştır;
      // eşleştirme o dosyanın üzerine yazacağı için engellenir (backend de aynı kuralı uygular).
      if (await this.isDocumentNumberUsed(documentNumber)) {
        this.toast.showToast('Uyarı', `${documentNumber} numarası daha önce başka bir taranmış evrakla eşleştirilmiş.`, 'warning');
        return;
      }

      await firstValueFrom(this.service.updateScannedDocumentNumber(doc.id, documentNumber, userId));

      if (openRegistration) {
        this.incomingDocumentService.setSelectedIncomingDocument(documentNumber);
        this.incomingDocumentService.setIncomingDocumentUpdateType('2');
        this.router.navigate(['/evrakkayit']);
        return;
      }

      // Eşleşen evrak listeden düşüp sıradaki açıldığı için sonuç ekranda görünmez; toast ile bildirilir.
      this.toast.showToast('Başarılı', `${documentNumber} numarası evrakla eşleştirildi.`, 'success');
      this.resetQr();
      await this.loadDocuments(true);
    } catch (err) {
      console.error(err);
      this.toast.showToast('Hata', 'Belge eşleştirilirken bir hata oluştu.', 'error');
    } finally {
      this.saving.set(false);
      this.savingAction.set(null);
      this.focusQrInputSoon();
    }
  }

  private async isDocumentNumberUsed(documentNumber: string): Promise<boolean> {
    try {
      const existing = await firstValueFrom(this.incomingDocumentService.GetByQrCode(documentNumber));
      return !!existing?.documentName;
    } catch {
      // Numaraya ait evrak yoksa (404) numara kullanılmamıştır
      return false;
    }
  }

  resetQr() {
    this.qrEditable.set('');
    this.buffer = '';
    this.focusQrInputSoon();
  }

  private focusQrInputSoon() {
    setTimeout(() => this.qrInput?.nativeElement.focus());
  }
}
