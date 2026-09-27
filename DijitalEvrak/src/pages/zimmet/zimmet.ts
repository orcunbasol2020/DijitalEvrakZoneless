import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, inject, OnInit, OnDestroy, signal, ViewChild, ViewEncapsulation, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import GenericModel from '../../../components/generic-model/generic-model';
import { CommonModule } from '@angular/common';
import { FlexiToastService } from 'flexi-toast';
import { FormsModule, FormControl, ReactiveFormsModule } from '@angular/forms';
import { DocumentAllocation } from '../../services/documentallocation';
import { Common } from '../../services/common';
import { IncomingDocumentService } from '../../services/incomingdocument';
import { AllocationFlowComponent } from '../dynamics/allocation-flow/allocation-flow';
import { DocumentAllocationModel } from '../../models/documentallocation.model';
import { AllocationStatusEnum, AllocationStatusLabels } from '../../models/allocationstatus.model';
import { httpResource } from '@angular/common/http';
import { UserModel } from '../users/users';
import { SimpleAutocompleteComponent } from '../simpleautocomplete/simpleautocomplete';
import { SecurityDegreeLabels, SecurityDegreeBadgeClass } from '../../models/securitydegree.model';
import { actionRequiredLabel, actionRequiredBadgeClass, actionRequiredIcon } from '../../models/actionrequired.model';
import { UrgencyDegreeLabels, UrgencyDegreeBadgeClass } from '../../models/urgencydegree.model';
import { DocumentTypeLabels } from '../../models/documenttype.model';
import { Department, DepartmentModel } from '../../services/department';
import { ExternalInstitution, ExternalInstitutionModel } from '../../services/external-institution';

type ZimmetType = 'self' | 'other';
// Sol paneldeki sekmeler: evrak bilgileri / zimmet geçmişi
type ZimmetTab = 'bilgi' | 'gecmis';

// Okutulup listeye alınan bir evrak: evrak bilgisi ve o evraka ait zimmet geçmişi.
export interface ScannedDoc {
  id: string;
  qrCode: string;
  detail: any;
  allocations: DocumentAllocationModel[];
}

// Kayıt sonrası gösterilen sonuç popup'ının içeriği. Toast yerine kullanılır;
// hangi evrakın zimmetlendiği, hangisinin zaten hedef kişide olduğu için
// atlandığı ve hangisinin hata aldığı sayılarıyla birlikte listelenir.
export interface ZimmetResult {
  targetName: string;
  actionLabel: string;
  succeeded: ScannedDoc[];
  skipped: ScannedDoc[];
  failed: ScannedDoc[];
}

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
  // Sağ paneldeki "Aktif zimmet sahibi" şeridinde durum adı için.
  readonly allocationStatusLabels: Record<number, string> = AllocationStatusLabels;

  // === QR READER ===
  private buffer: string = '';
  private keydownHandler: any;
  @ViewChild('qrInput') qrInput?: ElementRef<HTMLInputElement>;
  // QR okutma alanı odaktayken "Okumaya Hazır" durumunu gösterir.
  qrActive = false;
  private cdr = inject(ChangeDetectorRef);

  securityDegreeMap: Record<number, string> = SecurityDegreeLabels;
  securityDegreeStyle: Record<number, string> = SecurityDegreeBadgeClass;
  urgencyDegreeMap: Record<number, string> = UrgencyDegreeLabels;
  urgencyDegreeStyle: Record<number, string> = UrgencyDegreeBadgeClass;
  documentTypeLabels: Record<number, string> = DocumentTypeLabels;
  readonly actionRequiredLabel = actionRequiredLabel;
  readonly actionRequiredBadgeClass = actionRequiredBadgeClass;
  readonly actionRequiredIcon = actionRequiredIcon;

  readonly #toast = inject(FlexiToastService);
  readonly #common = inject(Common);
  readonly user = computed(() => this.#common.user());
  private allocationService = inject(DocumentAllocation);
  private incomingDocumentService = inject(IncomingDocumentService);
  private departmentService = inject(Department);
  private externalInstitutionService = inject(ExternalInstitution);

  // Nereden / Nereye: evraktaki id'ler kurum ve birim adına çevrilir (Süreçler ekranıyla aynı yaklaşım).
  readonly departments = signal<DepartmentModel[]>([]);
  readonly externalInstitutions = signal<ExternalInstitutionModel[]>([]);

  departmentNameOf(id?: string | null): string {
    return (id && this.departments().find(d => d.id?.toLowerCase() === id.toLowerCase())?.name) || '-';
  }

  externalInstitutionNameOf(id?: string | null): string {
    return (id && this.externalInstitutions().find(i => i.id?.toLowerCase() === id.toLowerCase())?.name) || '-';
  }

  // === OKUTULAN EVRAKLAR ===
  // Arka arkaya okutulan evraklar burada birikir. Tek evrak varken sol panelde
  // evrak bilgileri açık gelir; ikinci evraktan itibaren yalnızca evrak
  // numaralarını gösteren bir liste kalır ve detay popup'tan görülür.
  readonly docs = signal<ScannedDoc[]>([]);
  readonly detailsVisible = computed(() => this.docs().length > 0);
  readonly isMulti = computed(() => this.docs().length > 1);
  readonly singleDoc = computed(() => this.docs().length === 1 ? this.docs()[0] : null);
  // Alt özet şeritlerinde: tek evrakta evrak no, çoklu listede evrak sayısı.
  readonly docsLabel = computed(() =>
    this.isMulti() ? `${this.docs().length} evrak` : (this.singleDoc()?.qrCode ?? '')
  );

  // Detay popup'ı: listeden tıklanan evrak. Zimmet geçmişi sonradan yüklendiğinde
  // de güncel kalsın diye id tutulur, kayıt listeden çözülür.
  readonly detailDocId = signal<string | null>(null);
  readonly detailDoc = computed(() =>
    this.docs().find(d => d.id === this.detailDocId()) ?? null
  );
  readonly detailTab = signal<ZimmetTab>('bilgi');

  // Kayıt sonrası sonuç popup'ı (toast yerine).
  readonly saveResult = signal<ZimmetResult | null>(null);

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

  activeAllocationOf(doc: ScannedDoc): DocumentAllocationModel | null {
    return doc.allocations.find(a => a.isActive) ?? null;
  }

  // Listedeki evrakların tümü zaten giriş yapan kullanıcının üzerindeyse
  // "Üzerime Al" seçeneği anlamsız olduğundan gizlenir.
  readonly isActiveOnCurrentUser = computed(() => {
    const currentUserId = this.user()?.id;
    const docs = this.docs();
    if (!currentUserId || docs.length === 0) return false;
    return docs.every(d => this.activeAllocationOf(d)?.userId === currentUserId);
  });

  // Tek evrak görünümünde evrağın şu anki zimmet sahibi; kullanıcı işlem yapmadan önce görsün diye üstte gösterilir.
  readonly activeAllocation = computed(() => {
    const single = this.singleDoc();
    return single ? this.activeAllocationOf(single) : null;
  });

  // Alt özet şeridinde "Evrak No → Ad Soyad" biçiminde gösterilecek hedef.
  readonly targetLabel = computed<string | null>(() => {
    if (this.zimmetType() === 'self') return this.currentUserName || null;
    return this.selectedPerson()?.name ?? null;
  });

  ngOnInit() {
    this.id = this.incomingDocumentService.currentZimmetDocumentId;

    this.departmentService.getDepartments().subscribe({
      next: (res) => this.departments.set(res ?? []),
      error: (err) => console.error('Birimler yüklenemedi:', err)
    });
    this.externalInstitutionService.getExternalInstitutions().subscribe({
      next: (res) => this.externalInstitutions.set(res ?? []),
      error: (err) => console.error('Dış kurumlar yüklenemedi:', err)
    });

    if (this.id) {
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
    // Popup'lar Escape ile kapanır.
    if (e.key === 'Escape' && this.saveResult()) {
      this.closeResult();
      return;
    }
    if (e.key === 'Escape' && this.detailDocId()) {
      this.closeDetail();
      return;
    }

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

  // QR okutma bloğu kullanıcı "Daralt" dediğinde tek satıra daralır; arama sonrası
  // otomatik daraltılmaz. Daraltılmışken okuyucu pasiftir (handleKeydown tuşları
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
    if (this.loading() || this.saving()) return;

    if (!documentNumber) {
      this.#toast.showToast('Uyarı', 'Geçersiz QR', 'warning');
      return;
    }

    const currentUserId = this.user()?.id;

    if (!currentUserId) {
      this.#toast.showToast('Hata', 'Kullanıcı bulunamadı', 'error');
      return;
    }

    // Aynı numara listedeyse sunucuya gitmeye gerek yok.
    if (this.docs().some(d => d.qrCode.toLowerCase() === documentNumber.toLowerCase())) {
      this.#toast.showToast('Bilgi', 'Bu evrak zaten listede', 'info');
      this.focusQrInputSoon();
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

          this.addDocument(doc, documentNumber);
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

  // Bulunan evrakı listeye ekler ve zimmet geçmişini yükler. QR okutma alanı
  // açık ve odakta kalır; böylece arka arkaya evrak okutulabilir. Kullanıcı
  // isterse "Daralt" ile alanı elle kapatır.
  private addDocument(doc: any, documentNumber: string | null) {
    const qrCode = documentNumber ?? doc.qrCode ?? doc.id;

    if (this.docs().some(d => d.id === doc.id)) {
      this.#toast.showToast('Bilgi', 'Bu evrak zaten listede', 'info');
      this.focusQrInputSoon();
      return;
    }

    const isFirst = this.docs().length === 0;
    this.docs.update(list => [...list, { id: doc.id, qrCode, detail: doc, allocations: [] }]);
    this.loadAllocations(doc.id);

    // Zimmet türü ve personel seçimi yalnızca ilk evrakta sıfırlanır; sonraki
    // okutmalarda kullanıcının sağ panelde yaptığı seçim korunur.
    if (isFirst) {
      this.activeTab.set('bilgi');
      this.zimmetType.set('other');
      this.personControl.setValue(null);
    }
    this.id = null;
    this.cdr.markForCheck();
    if (!this.scanCollapsed) this.focusQrInputSoon();
  }

  // Listeden evrak çıkarır; liste boşalırsa ekran başlangıç durumuna döner.
  removeDocument(id: string, event?: Event) {
    event?.stopPropagation();
    if (this.saving()) return;
    if (this.detailDocId() === id) this.closeDetail();
    this.docs.update(list => list.filter(d => d.id !== id));
    if (this.docs().length === 0) {
      this.backToQrScan();
      return;
    }
    this.cdr.markForCheck();
  }

  openDetail(doc: ScannedDoc) {
    this.detailTab.set('bilgi');
    this.detailDocId.set(doc.id);
    this.cdr.markForCheck();
  }

  closeDetail() {
    this.detailDocId.set(null);
    this.cdr.markForCheck();
    if (!this.scanCollapsed) this.focusQrInputSoon();
  }

  closeResult() {
    this.saveResult.set(null);
    this.cdr.markForCheck();
    if (!this.scanCollapsed) this.focusQrInputSoon();
  }

  getir(id: string) {
    this.loading.set(true);
    this.incomingDocumentService.getIncomingDocumentByDocumentId(id)
      .subscribe({
        next: doc => {
          this.loading.set(false);

          if (!doc?.id) {
            this.#toast.showToast('Hata', 'Belge bulunamadı', 'error');
            this.cdr.markForCheck();
            return;
          }

          this.addDocument(doc, doc.qrCode ?? null);
        },
        error: () => {
          this.loading.set(false);
          this.#toast.showToast('Hata', 'Belge bulunamadı', 'error');
          this.cdr.markForCheck();
        }
      });
  }

  backToQrScan() {
    this.docs.set([]);
    this.detailDocId.set(null);
    this.incomingDocumentService.clearZimmetIncomingDocument();
    this.lookupErrorMessage.set(null);
    this.personControl.setValue(null);
    this.zimmetType.set('other');
    this.activeTab.set('bilgi');
    this.id = null;
    this.buffer = '';
    this.scanCollapsed = false;
    this.cdr.markForCheck();
    this.focusQrInputSoon();
  }

  // Listedeki tüm evraklar seçilen kişiye sırayla zimmetlenir; bir evrak
  // başarısız olsa da diğerleri devam eder. Başarılı evraklar listede kalır ve
  // zimmet geçmişleri yenilenir; böylece yeni zimmet sahibi hemen görünür.
  async saveZimmet(status: AllocationStatusEnum) {
    if (this.saving()) return;

    const user = this.user();
    if (!user?.id) {
      console.error("Kullanıcı bulunamadı");
      return;
    }

    let personId: string;
    let targetName: string;

    if (this.zimmetType() === 'self') {
      personId = user.id;
      targetName = this.currentUserName;
    } else {
      const selectedPerson = this.personControl.value;
      if (!selectedPerson) {
        this.#toast.showToast('Hata', 'Lütfen personel seçiniz.', 'error');
        return;
      }
      personId = selectedPerson.id;
      targetName = selectedPerson.name;
    }

    const allDocs = this.docs();
    if (allDocs.length === 0) {
      this.#toast.showToast('Hata', 'Zimmetlenecek evrak yok', 'error');
      return;
    }

    const actionLabel = status === AllocationStatusEnum.Teslim
      ? 'Teslim Et'
      : this.zimmetType() === 'self' ? 'Üzerime Al' : 'Devret';

    // Hedef kişi evrakın zaten aktif zimmet sahibiyse aynı kişiye ikinci bir
    // zimmet kaydı açılmaz; o evrak atlanır ve sonuç popup'ında gösterilir.
    const skipped = allDocs.filter(d => this.activeAllocationOf(d)?.userId === personId);
    const docs = allDocs.filter(d => !skipped.includes(d));

    if (docs.length === 0) {
      this.saveResult.set({ targetName, actionLabel, succeeded: [], skipped, failed: [] });
      this.cdr.markForCheck();
      return;
    }

    this.saving.set(true);
    this.cdr.markForCheck();

    const succeeded: ScannedDoc[] = [];
    const failed: ScannedDoc[] = [];

    for (const doc of docs) {
      try {
        await firstValueFrom(this.allocationService.createAllocation({
          incomingDocumentId: doc.id,
          userId: personId,
          createdUserId: user.id,
          status,
          userType: 1,
        }));
        succeeded.push(doc);
      } catch (err) {
        console.error(`Zimmetleme başarısız (${doc.qrCode}):`, err);
        failed.push(doc);
      }
    }

    this.saving.set(false);

    // Sonuç toast yerine popup'ta gösterilir: sayılar ve her gruptaki evraklar.
    this.saveResult.set({ targetName, actionLabel, succeeded, skipped, failed });

    if (succeeded.length > 0) {
      this.personControl.setValue(null);
      this.zimmetType.set('other');
      for (const doc of succeeded) this.loadAllocations(doc.id);
    }
    this.cdr.markForCheck();
  }

  loadAllocations(documentId: string) {
    this.allocationService
      .getByDocumentId(documentId)
      .subscribe({
        next: (res) => {
          const filtered = res?.filter(x => !x.isDeleted) ?? [];
          this.docs.update(list =>
            list.map(d => d.id === documentId ? { ...d, allocations: filtered } : d)
          );
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Allocation API error:', err);
        }
      });
  }
}
