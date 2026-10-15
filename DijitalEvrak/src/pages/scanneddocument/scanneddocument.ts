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
import { ScanThumb } from './scan-thumb';

/** Küçük resim görünümünde bir sayfadaki evrak sayısı */
const GRID_PAGE_SIZE = 10;

@Component({
  imports: [CommonModule, GenericModel, ScanThumb],
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

  // ---- Görünüm: tek evrak (solda büyük evrak, sağda eşleştirme) ya da küçük resim ızgarası ----
  readonly viewMode = signal<'single' | 'grid'>('single');
  readonly gridPage = signal(0);
  readonly gridPageCount = computed(() => Math.max(1, Math.ceil(this.scannedDocuments().length / GRID_PAGE_SIZE)));
  /** Izgaradaki evraklar; index tüm listedeki sırasıdır (seçilince tek evrak görünümünde o açılır) */
  readonly gridItems = computed(() => {
    const start = this.gridPage() * GRID_PAGE_SIZE;
    return this.scannedDocuments()
      .slice(start, start + GRID_PAGE_SIZE)
      .map((doc, i) => ({ doc, index: start + i, url: this.service.getPdfUrl(doc.fileName) }));
  });
  readonly gridRangeLabel = computed(() => {
    const total = this.scannedDocuments().length;
    const start = this.gridPage() * GRID_PAGE_SIZE;
    return total ? `${start + 1}–${Math.min(start + GRID_PAGE_SIZE, total)} / ${total}` : '0';
  });

  showGrid() {
    // Açık evrakın bulunduğu sayfadan başlanır
    this.gridPage.set(Math.floor(this.currentIndex() / GRID_PAGE_SIZE));
    this.viewMode.set('grid');
    this.buffer = '';
  }

  showSingle() {
    this.viewMode.set('single');
    this.focusQrInputSoon();
  }

  selectFromGrid(index: number) {
    if (index !== this.currentIndex()) {
      this.currentIndex.set(index);
      this.resetQr();
    }
    this.showSingle();
  }

  setGridPage(page: number) {
    this.gridPage.set(Math.min(Math.max(0, page), this.gridPageCount() - 1));
  }

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
      // Izgarada numara alanı yoktur; okutma tek evrak görünümünde yapılır
      if (!this.currentDocument() || this.saving() || this.viewMode() === 'grid') return;

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
      // Liste kısaldıysa ızgara son sayfaya çekilir
      this.setGridPage(this.gridPage());
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
