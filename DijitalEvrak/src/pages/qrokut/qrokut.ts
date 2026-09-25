import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, computed, inject, OnInit, OnDestroy, signal, ViewChild, ViewEncapsulation } from '@angular/core';
import GenericModel from '../../../components/generic-model/generic-model';
import { CommonModule } from '@angular/common';
import { FlexiToastService } from 'flexi-toast';
import { Router, RouterModule } from '@angular/router';
import { IncomingDocumentService } from '../../services/incomingdocument';
import { IncomingDocumentModel } from '../../models/incoming-document/incoming-document.model';
import { RoleService } from '../../services/role-service';
import { Common } from '../../services/common';
import { UPLOAD_DOCUMENT_ROLES, UploadDocumentModal } from '../../../components/upload-document-modal/upload-document-modal';
import { DocumentUploadFlow } from '../../services/document-upload-flow';
import { INCOMING_STATUS_KAYIT } from '../../services/incomingdocument';

type ScanResult = { code: string; kind: 'notfound' | 'notscanned' };

@Component({
  imports: [
    GenericModel,
    CommonModule,
    RouterModule,
    UploadDocumentModal
  ],
  templateUrl: './qrokut.html',
  // Görsel dil Ön Kayıt / Giden Evrak Teslim Al ekranlarıyla aynı; ortak zm-*
  // sınıfları zimmet.css'ten, durum şeridi (ok-status) onkayit.css'ten gelir;
  // taranmamış evrak aksiyon kartları (qk-*) bu ekrana özgüdür.
  styleUrls: ['../gidenevrak/zimmet/zimmet.css', '../onkayit/onkayit.css', './qrokut.css'],
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
  // Taranmamış sonuçta bulunan evrak; "Belge Yükle" için saklanır
  readonly lastDoc = signal<IncomingDocumentModel | null>(null);

  private incomingDocumentService = inject(IncomingDocumentService);
  readonly #toast = inject(FlexiToastService);
  private readonly router = inject(Router);
  private readonly roleService = inject(RoleService);
  private readonly common = inject(Common);
  private readonly uploadFlow = inject(DocumentUploadFlow);
  private cdr = inject(ChangeDetectorRef);
  private buffer: string = '';
  private keydownHandler: any;

  // Taranmamış evrakta belge yükleme / belge yüklemeden kayda geçme yalnızca evrak
  // kayıt yetkisi olan rollere açıktır (bkz. UPLOAD_DOCUMENT_ROLES)
  readonly canUploadDocument = computed(() => this.roleService.hasAny(UPLOAD_DOCUMENT_ROLES));

  // ---- Taranmamış evrak aksiyonları ----
  // Belge yüklemek zorunlu değildir: kullanıcı dosyayı yükleyip ya da yüklemeden
  // Evrak Kayıt ekranına geçebilir; dosya sonradan da eklenebilir.
  readonly uploadDoc = signal<IncomingDocumentModel | null>(null);
  readonly uploadLoading = signal(false);

  private get canActOnUnscanned(): boolean {
    return !!this.lastDoc() && this.canUploadDocument() && this.lastResult()?.kind === 'notscanned';
  }

  openUpload(): void {
    if (!this.canActOnUnscanned) return;
    this.uploadDoc.set(this.lastDoc());
  }

  // Belge olmadan kayda geç: dosya yüklenmeden Evrak Kayıt açılır
  proceedWithoutFile(): void {
    const code = this.lastResult()?.code;
    if (!this.canActOnUnscanned || !code) return;
    this.openEvrakKayit(code);
  }

  closeUpload(): void {
    if (this.uploadLoading()) return;
    this.uploadDoc.set(null);
    this.focusQrInputSoon();
  }

  confirmUpload(file: File): void {
    const source = this.uploadDoc();
    const code = this.lastResult()?.code;
    if (!source?.id || !code || this.uploadLoading()) return;

    const userId = this.common.user()?.id;
    if (!userId) {
      this.#toast.showToast('Hata', 'Kullanıcı bulunamadı', 'error');
      return;
    }

    // Akış: yükle -> evrak Kayıt Tamamlandı -> zimmet yükleyene Devir -> Evrak Kayıt ekranı
    this.uploadLoading.set(true);
    this.uploadFlow.run(source.id, file, userId).subscribe({
      next: (result) => {
        this.uploadLoading.set(false);
        this.uploadDoc.set(null);

        if (result.transferFailed) {
          this.#toast.showToast(
            'Zimmet devri yapılamadı',
            'Belge yüklendi ve evrak kaydı oluşturuldu ancak zimmet devredilemedi. Zimmet ekranından devir yapabilirsiniz.',
            'warning'
          );
        } else {
          this.#toast.showToast('Başarılı', 'Belge yüklendi, evrak kaydı oluşturuldu ve zimmet üzerinize geçti.', 'success');
        }

        this.openEvrakKayit(code);
      },
      error: () => {
        this.uploadLoading.set(false);
        this.cdr.markForCheck();
        this.#toast.showToast('Hata', 'Belge yüklenemedi ya da evrak kaydı güncellenemedi.', 'error');
      }
    });
  }

  // QR ile bulunan evrak için kayıt ekranı (evrak qrCode ile yeniden yüklenir)
  private openEvrakKayit(code: string): void {
    this.loading.set(false);
    this.incomingDocumentService.setSelectedIncomingDocument(code);
    this.incomingDocumentService.setIncomingDocumentUpdateType("2");
    this.router.navigate(['/evrakkayit']);
  }

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
    // Belge Yükle penceresi açıkken okuyucu tamponu devre dışıdır
    if (this.uploadDoc()) return;

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
    this.lastDoc.set(null);
    this.buffer = '';
    this.focusQrInputSoon();
  }

  // QR okunduğunda: evrak kaydı tamamlanmışsa (durum 2) doğrudan kayıt ekranına
  // geçilir; ön kayıt (durum 1) ve diğer durumlarda belge dosyası kontrol edilir,
  // dosya yoksa neden geçilemediği ve seçenekler sol panelde gösterilir.
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
    this.lastDoc.set(null);
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

        // Kaydı tamamlanmış evrak dosyası olsun olmasın doğrudan açılır
        if (doc.status === INCOMING_STATUS_KAYIT) {
          this.openEvrakKayit(result);
          return;
        }

        if (!doc.documentName) {
          this.lastDoc.set(doc);
          this.lastResult.set({ code: result, kind: 'notscanned' });
          this.#toast.showToast(
            "Belge henüz taranmamış",
            this.canUploadDocument()
              ? "Belgeyi yükleyerek ya da yüklemeden evrak kaydına geçebilirsiniz."
              : "Tarama işlemi tamamlandıktan sonra belge kayıt ekranına geçiş yapabilirsiniz."
          );
          this.finishLoading();
          return;
        }

        this.openEvrakKayit(result);
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
