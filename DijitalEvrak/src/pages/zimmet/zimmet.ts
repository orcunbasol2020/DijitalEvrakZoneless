import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, inject, OnInit, OnDestroy, signal, ViewChild, ViewEncapsulation, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import GenericModel from '../../../components/generic-model/generic-model';
import { CommonModule } from '@angular/common';
import { FlexiToastService } from 'flexi-toast';
import { FormsModule, FormControl, ReactiveFormsModule } from '@angular/forms';
import { DocumentAllocation } from '../../services/documentallocation';
import { Common } from '../../services/common';
import { IncomingDocumentService } from '../../services/incomingdocument';
import { AllocationFlowComponent } from '../dynamics/allocation-flow/allocation-flow';
import { DocumentAllocationModel } from '../../models/documentallocation.model';
import { AllocationStatusEnum } from '../../models/allocationstatus.model';
import { httpResource } from '@angular/common/http';
import { UserModel } from '../users/users';
import { SimpleAutocompleteComponent } from '../simpleautocomplete/simpleautocomplete';
import { SecurityDegreeLabels, SecurityDegreeBadgeClass } from '../../models/securitydegree.model';
import { actionRequiredLabel, actionRequiredBadgeClass } from '../../models/actionrequired.model';

type ZimmetType = 'self' | 'other';
// Sol paneldeki sekmeler: evrak bilgileri / zimmet geçmişi
type ZimmetTab = 'bilgi' | 'gecmis';

@Component({
  standalone: true,
  imports: [
    GenericModel,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AllocationFlowComponent,
    SimpleAutocompleteComponent
  ],
  templateUrl: './zimmet.html',
  // Görsel dil Ön Kayıt / Giden Evrak Teslim Al ekranlarıyla aynı; ortak zm-*
  // sınıfları gidenevrak/zimmet.css'ten, ok-* sınıfları onkayit.css'ten gelir.
  styleUrls: ['../gidenevrak/zimmet/zimmet.css', '../onkayit/onkayit.css', './zimmet.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Zimmet implements OnInit, AfterViewInit, OnDestroy {
  // Şablondaki Zimmetle / Teslim Et butonları için.
  readonly AllocationStatus = AllocationStatusEnum;

  // === QR READER ===
  private buffer: string = '';
  private keydownHandler: any;
  @ViewChild('qrInput') qrInput?: ElementRef<HTMLInputElement>;
  // QR okutma alanı odaktayken "Okumaya Hazır" durumunu gösterir.
  qrActive = false;
  private cdr = inject(ChangeDetectorRef);

  allocations = signal<DocumentAllocationModel[]>([]);
  documentDetail = signal<any | null>(null);
  securityDegreeMap: Record<number, string> = SecurityDegreeLabels;
  securityDegreeStyle: Record<number, string> = SecurityDegreeBadgeClass;
  readonly actionRequiredLabel = actionRequiredLabel;
  readonly actionRequiredBadgeClass = actionRequiredBadgeClass;

  readonly #toast = inject(FlexiToastService);
  readonly #common = inject(Common);
  readonly user = computed(() => this.#common.user());
  private allocationService = inject(DocumentAllocation);
  private incomingDocumentService = inject(IncomingDocumentService);

  detailsVisible = signal(false);
  scannedDocumentNo = signal<string | null>(null);
  currentDocumentNo = signal<string | null>(null);
  id!: string | null;
  // Sol paneldeki sekme (Evrak Bilgileri / Zimmet Geçmişi) ve zimmet türü.
  readonly activeTab = signal<ZimmetTab>('bilgi');
  readonly zimmetType = signal<ZimmetType>('other');

  get currentUserName(): string {
    const u = this.user();
    return u ? `${u.name ?? ''} ${u.surname ?? ''}`.trim() : '';
  }

  // Belge aranırken (QR/manuel) ve zimmetleme kaydedilirken gösterilecek yükleniyor durumları
  loading = signal(false);
  saving = signal(false);
  // Belge bulunamadı vb. durumlarda kullanıcıya toast'a ek olarak ekranda da gösterilecek mesaj
  lookupErrorMessage = signal<string | null>(null);

  readonly personControl = new FormControl<{ id: string, name: string } | null>(null);
  // Autocomplete seçimi; şablonda seçili personel kartı ve buton durumları için.
  readonly selectedPerson = toSignal(this.personControl.valueChanges, { initialValue: this.personControl.value });

  readonly usersResult = httpResource<UserModel[]>(() => "api/Users/GetAll");
  readonly personList = computed(() =>
    (this.usersResult.value() ?? [])
      .filter(x => !x.isDeleted && x.isActive)
  );
  readonly personOptions = computed(() =>
    this.personList()
      .filter((p): p is UserModel & { id: string } => !!p.id)
      .map(p => ({
        id: p.id,
        name: `${p.name} ${p.surname} (${p.departmentShortName})`
      }))
  );

  // Aktif zimmet zaten giriş yapan kullanıcının üzerindeyse
  // "Üzerime Al" seçeneği anlamsız olduğundan gizlenir.
  readonly isActiveOnCurrentUser = computed(() => {
    const currentUserId = this.user()?.id;
    if (!currentUserId) return false;
    return this.allocations().some(a => a.isActive && a.userId === currentUserId);
  });

  // Evrağın şu anki zimmet sahibi; kullanıcı işlem yapmadan önce bunu görebilsin diye üstte gösterilir.
  readonly activeAllocation = computed(() =>
    this.allocations().find(a => a.isActive) ?? null
  );

  // Alt özet şeridinde "Evrak No → Ad Soyad" biçiminde gösterilecek hedef.
  readonly targetLabel = computed<string | null>(() => {
    if (this.zimmetType() === 'self') return this.currentUserName || null;
    return this.selectedPerson()?.name ?? null;
  });

  ngOnInit() {
    this.id = this.incomingDocumentService.currentZimmetDocumentId;

    if (this.id) {
      this.detailsVisible.set(true);
      this.getir(this.id);
    }
    // === QR READER SETUP ===
    this.keydownHandler = (e: KeyboardEvent) => {
      this.handleKeydown(e);
    };

    window.addEventListener('keydown', this.keydownHandler);
  }

  ngAfterViewInit(): void {
    if (!this.id) this.focusQrInputSoon();
  }

  ngOnDestroy() {
    // === QR CLEANUP ===
    window.removeEventListener('keydown', this.keydownHandler);
  }

  // Odak bir form alanındayken (personel arama, QR alanının kendisi) tuşlar
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

    if (e.key === 'Enter') {
      this.onQrScanned(this.buffer.trim());
      this.buffer = '';
    } else if (e.key.length === 1) {
      this.buffer += e.key;
    }
  }

  private focusQrInputSoon() {
    setTimeout(() => this.qrInput?.nativeElement.focus());
  }

  // Evrak bulununca QR okutma bloğu tek satıra daralır; böylece evrak ve zimmet
  // kartlarına yer açılır. Daraltılmışken okuyucu pasiftir (handleKeydown tuşları
  // yoksayar); kullanıcı "Aç" ile açınca yeniden aktif olur.
  scanCollapsed = false;

  collapseScan(): void {
    if (this.scanCollapsed) return;
    this.scanCollapsed = true;
    this.buffer = '';
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

  setZimmetType(type: ZimmetType): void {
    if (this.zimmetType() === type) return;
    this.zimmetType.set(type);
    this.personControl.setValue(null);
  }

  clearPerson(): void {
    this.personControl.setValue(null);
  }

  // Zimmet sahibinin ad-soyad baş harfleri (avatar). Autocomplete adları
  // "(Birim)" ekini taşıyabildiğinden parantezli kısım atılır.
  initials(fullName: string | null | undefined): string {
    const parts = (fullName ?? '').replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const first = parts[0].charAt(0);
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return `${first}${last}`.toLocaleUpperCase('tr');
  }

  // QR kod okunduğunda tetiklenecek fonksiyon
  private onQrScanned(documentNumber: string) {
    if (this.loading()) return;

    if (!documentNumber) {
      this.#toast.showToast('Uyarı', 'Geçersiz QR', 'warning');
      return;
    }

    const currentUserId = this.user()?.id;

    if (!currentUserId) {
      this.#toast.showToast('Hata', 'Kullanıcı bulunamadı', 'error');
      return;
    }

    this.lookupErrorMessage.set(null);
    this.loading.set(true);
    // QR okuyucu native window 'keydown' olayı üzerinden tetiklendiğinde OnPush
    // bileşen otomatik işaretlenmiyor; spinner'ın hemen görünmesi için elle bildirilir.
    this.cdr.markForCheck();

    // Önce belgeyi bul
    this.incomingDocumentService.GetByQrCode(documentNumber)
      .subscribe({
        next: doc => {
          this.loading.set(false);

          if (!doc?.id) {
            const message = `"${documentNumber}" numaralı belge bulunamadı. Lütfen numarayı kontrol edip tekrar deneyin.`;
            this.lookupErrorMessage.set(message);
            this.#toast.showToast('Hata', 'Belge bulunamadı', 'error');
            this.cdr.markForCheck();
            this.focusQrInputSoon();
            return;
          }

          this.showDocument(doc, documentNumber);
        },
        error: () => {
          this.loading.set(false);
          this.lookupErrorMessage.set('Belge sorgulanırken bir hata oluştu. Lütfen tekrar deneyin.');
          this.#toast.showToast('Hata', 'Belge sorgulanamadı', 'error');
          this.cdr.markForCheck();
          this.focusQrInputSoon();
        }
      });
  }

  // Bulunan evrakı panele yerleştirir, zimmet geçmişini yükler ve QR bloğunu daraltır.
  private showDocument(doc: any, documentNumber: string | null) {
    this.documentDetail.set(doc);
    this.currentDocumentNo.set(doc.id);
    this.loadAllocations(doc.id);
    this.scannedDocumentNo.set(documentNumber);
    this.detailsVisible.set(true);
    this.activeTab.set('bilgi');
    this.zimmetType.set('other');
    this.personControl.setValue(null);
    this.id = null;
    this.collapseScan();
  }

  private Zimmetle(documentNumber: string, userId: string, createdUserId: string, status: AllocationStatusEnum) {
    const documentId = this.currentDocumentNo();
    if (!documentId) {
      console.error("Belge numarası bulunamadı");
      return;
    }
    this.saving.set(true);
    this.allocationService.createAllocation({
      incomingDocumentId: documentId,
      userId: userId,
      createdUserId: createdUserId,
      status: status,
      userType: 1,
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.#toast.showToast('Başarılı', 'Zimmetleme tamamlandı', 'success');
        this.personControl.setValue(null);
        this.zimmetType.set('other');
        this.loadAllocations(documentId);
      },
      error: () => {
        this.saving.set(false);
        this.#toast.showToast('Hata', 'Zimmetleme başarısız', 'error');
      }
    });
  }

  getir(id: string) {
    this.loading.set(true);
    this.incomingDocumentService.getIncomingDocumentByDocumentId(id)
      .subscribe({
        next: doc => {
          this.loading.set(false);

          if (!doc?.id) {
            this.#toast.showToast('Hata', 'Belge bulunamadı', 'error');
            this.detailsVisible.set(false);
            this.cdr.markForCheck();
            return;
          }

          this.showDocument(doc, doc.qrCode ?? null);
        },
        error: () => {
          this.loading.set(false);
          this.detailsVisible.set(false);
          this.#toast.showToast('Hata', 'Belge bulunamadı', 'error');
          this.cdr.markForCheck();
        }
      });
  }

  backToQrScan() {
    this.detailsVisible.set(false);
    this.scannedDocumentNo.set(null);
    this.currentDocumentNo.set(null);
    this.documentDetail.set(null);
    this.allocations.set([]);
    this.incomingDocumentService.clearZimmetIncomingDocument();
    this.lookupErrorMessage.set(null);
    this.personControl.setValue(null);
    this.zimmetType.set('other');
    this.activeTab.set('bilgi');
    this.id = null;
    this.buffer = '';
    this.scanCollapsed = false;
    this.focusQrInputSoon();
  }

  saveZimmet(status: AllocationStatusEnum) {
    const user = this.user();
    if (!user?.id) {
      console.error("Kullanıcı bulunamadı");
      return;
    }

    let personId: string;

    if (this.zimmetType() === 'self') {
      personId = user.id;
    } else {
      const selectedPerson = this.personControl.value;
      if (!selectedPerson) {
        this.#toast.showToast('Hata', 'Lütfen personel seçiniz.', 'error');
        return;
      }
      personId = selectedPerson.id;
    }

    const documentNumber = this.scannedDocumentNo();
    if (!documentNumber) {
      console.error("Belge numarası bulunamadı");
      return;
    }
    this.Zimmetle(
      documentNumber,
      personId,
      user.id,
      status
    );
  }

  loadAllocations(documentId: string) {
    this.allocationService
      .getByDocumentId(documentId)
      .subscribe({
        next: (res) => {
          const filtered = res?.filter(x => !x.isDeleted) ?? [];
          this.allocations.set(filtered);
        },
        error: (err) => {
          console.error('Allocation API error:', err);
        }
      });
  }
}
