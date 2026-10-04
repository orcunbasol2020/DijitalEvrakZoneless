import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, inject, OnInit, OnDestroy, signal, ViewChild, ViewEncapsulation, computed, effect } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import GenericModel from '../../../components/generic-model/generic-model';
import { CommonModule } from '@angular/common';
import { FlexiToastService } from 'flexi-toast';
import { FormsModule, FormControl, ReactiveFormsModule } from '@angular/forms';
import { DocumentAllocation } from '../../services/documentallocation';
import { AllocationRequestService } from '../../services/allocationrequest';
import { AllocationRequestActionResultEnum, AllocationRequestModel, AllocationRequestStatusEnum, allocationRequestOperationLabel } from '../../models/allocationrequest.model';
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
  // Evrakın alıcı onayı bekleyen zimmet talebi; varken backend her türlü yeni zimmeti reddeder
  pendingRequest?: AllocationRequestModel | null;
}

// Kayıt sonrası gösterilen sonuç popup'ının içeriği. Toast yerine kullanılır;
// hangi evrakın zimmetlendiği, hangisinin alıcının onayına gönderildiği, hangisinin
// zaten hedef kişide olduğu için atlandığı ve hangisinin hata aldığı listelenir.
export interface ZimmetResult {
  targetName: string;
  actionLabel: string;
  succeeded: ScannedDoc[];
  // Kurum içi başka kullanıcıya Devir / Teslim: zimmet alıcı onaylayana kadar devredende kalır
  pending: ScannedDoc[];
  skipped: ScannedDoc[];
  failed: ScannedDoc[];
  // Backend'in hata mesajı (ör. evrakın bekleyen onay talebi var), evrak Id'sine göre
  failReasons: Record<string, string>;
  // Teslim Et'te teslim edilen / onaya gönderilen evrakların düzenlenebilir bilgileri
  edits: ResultDocEdit[];
}

// Teslim sonrası popup'ta düzenlenen evrak bilgileri; original ile karşılaştırılıp
// yalnızca değişen evraklar kaydedilir.
export interface ResultDocEdit {
  doc: ScannedDoc;
  pageCount: number | null;
  hasAttachment: boolean | null;
  attachmentDescription: string;
  original: { pageCount: number | null; hasAttachment: boolean | null; attachmentDescription: string };
}

const ATTACHMENT_DESCRIPTION_MAX = 1000;

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
  private allocationRequestService = inject(AllocationRequestService);

  // === ONAY BEKLEYEN ZİMMET TALEPLERİ ===
  // Evrak kurum içi birine devredilmiş / teslim edilmiş ve alıcı henüz onaylamamışsa yeni
  // zimmet yapılamaz; ekranda uyarı çıkar. Talebi devreden ya da işlemi yapan geri çekebilir.
  readonly operationLabel = allocationRequestOperationLabel;
  readonly pendingDocs = computed(() => this.docs().filter(d => d.pendingRequest));
  readonly allDocsPending = computed(() =>
    this.docs().length > 0 && this.pendingDocs().length === this.docs().length);
  readonly cancellablePendingDocs = computed(() =>
    this.pendingDocs().filter(d => this.canCancelRequest(d.pendingRequest!)));
  readonly cancellingRequests = signal(false);

  canCancelRequest(req: AllocationRequestModel): boolean {
    const userId = this.user()?.id?.toLowerCase();
    return !!userId && (req.requestedByUserId?.toLowerCase() === userId || req.fromUserId?.toLowerCase() === userId);
  }

  pendingRequestText(req: AllocationRequestModel): string {
    return `${req.toUserFullName} kişisinin zimmet onayı bekleniyor; yeni zimmet için önce talep geri çekilmeli.`;
  }

  loadPendingRequest(documentId: string) {
    this.allocationRequestService.getByDocumentId(documentId).subscribe({
      next: list => {
        const pending = list.find(r => Number(r.status) === AllocationRequestStatusEnum.Beklemede) ?? null;
        this.docs.update(docs => docs.map(d => d.id === documentId ? { ...d, pendingRequest: pending } : d));
        this.cdr.markForCheck();
      },
      error: err => console.error('Zimmet talebi bilgisi alınamadı:', err)
    });
  }

  // Listedeki, kullanıcının geri çekebileceği bekleyen talepler tek seferde geri çekilir.
  // Başarılı olan evrakın uyarısı kalkar; geri çekilemeyenin nedeni uyarı olarak gösterilir.
  cancelPendingRequests() {
    const userId = this.user()?.id;
    const docs = this.cancellablePendingDocs();
    if (!userId || !docs.length || this.cancellingRequests()) return;

    this.cancellingRequests.set(true);
    this.allocationRequestService.cancelBulk(docs.map(d => d.pendingRequest!.id), userId, null).subscribe({
      next: res => {
        this.cancellingRequests.set(false);
        const failed = (res?.data ?? []).filter(r => Number(r.result) !== AllocationRequestActionResultEnum.Basarili);
        if (failed.length) {
          this.#toast.showToast('Uyarı', failed.map(r => r.message).join(' '), 'warning');
        }
        for (const d of docs) {
          this.loadPendingRequest(d.id);
          this.loadAllocations(d.id);
        }
        this.cdr.markForCheck();
      },
      error: err => {
        this.cancellingRequests.set(false);
        console.error('Zimmet talebi geri çekilemedi:', err);
        this.#toast.showToast('Hata', 'Talep geri çekilemedi', 'error');
        this.cdr.markForCheck();
      }
    });
  }

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
  // Sonuç popup'ındaki evrak bilgileri kaydedilirken
  readonly savingEdits = signal(false);
  readonly attachmentDescriptionMax = ATTACHMENT_DESCRIPTION_MAX;

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

  // Personel kartından seçim: autocomplete ile aynı { id, name } biçiminde yazılır ki
  // seçili personel kartı, özet şeridi ve kayıt akışı değişmeden çalışsın.
  selectPerson(p: UserModel): void {
    if (!p.id) return;
    this.personControl.setValue({ id: p.id, name: `${p.name} ${p.surname} (${p.departmentShortName})` });
  }

  isPersonSelected(p: UserModel): boolean {
    return !!p.id && this.selectedPerson()?.id?.toLowerCase() === p.id.toLowerCase();
  }

  // === BİRİME GÖRE PERSONEL ===
  // Devret'te önce birim seçilir, altında o birimin personeli kart olarak listelenir.
  // Birim, evrağın Nereye birimiyle açılır; kullanıcı başka bir birim seçebilir.
  readonly departmentControl = new FormControl<{ id: string, name: string } | null>(null);
  readonly selectedDepartment = toSignal(this.departmentControl.valueChanges, { initialValue: this.departmentControl.value });

  readonly departmentOptions = computed(() =>
    [...this.departments()]
      .filter(d => !!d.id)
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'tr'))
      .map(d => ({ id: d.id, name: d.shortName ? `${d.name} (${d.shortName})` : d.name }))
  );

  readonly departmentPersons = computed(() => {
    const deptId = this.selectedDepartment()?.id?.toLowerCase();
    if (!deptId) return [];
    return this.personList()
      .filter(p => !!p.id && p.departmentId?.toLowerCase() === deptId)
      .sort((a, b) => `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`, 'tr'));
  });

  // Devret'te personel seçim yolu: birime göre kartlardan ya da tüm personelde arama.
  // Sekme değişse de seçili personel korunur.
  readonly personPickMode = signal<'birim' | 'tum'>('birim');

  // Seçili personel açık birim listesinde görünüyorsa ayrıca seçili kartı gösterilmez.
  readonly selectedInDeptList = computed(() => {
    const id = this.selectedPerson()?.id?.toLowerCase();
    return !!id && this.departmentPersons().some(p => p.id?.toLowerCase() === id);
  });

  // Evrağın Nereye birimi: tek evrakta o evrağınki; çoklu listede tüm evraklar aynı
  // birime gidiyorsa o birim, farklıysa boş (kullanıcı kendisi seçer).
  readonly docsTargetDepartmentId = computed<string | null>(() => {
    const ids = new Set(this.docs()
      .map(d => (d.detail?.departmentId as string | null | undefined)?.toLowerCase())
      .filter((id): id is string => !!id));
    return ids.size === 1 ? [...ids][0] : null;
  });

  // Hedef birim yalnızca evrak listesi değişip Nereye birimi farklılaştığında yeniden
  // atanır; kullanıcının elle seçtiği birim aynı listede korunur.
  private appliedTargetDepartmentId: string | null | undefined = undefined;

  private readonly syncTargetDepartment = effect(() => {
    const target = this.docsTargetDepartmentId();
    const options = this.departmentOptions();
    if (!options.length || target === this.appliedTargetDepartmentId) return;
    this.appliedTargetDepartmentId = target;
    this.departmentControl.setValue(target ? options.find(o => o.id.toLowerCase() === target) ?? null : null);
  });

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

  // Listedeki evraklardan birinin zimmet geçmişinde (yalnızca aktif kayıt değil, tüm kayıtlar)
  // "Teslim Edildi" ya da "Teslim Alındı" varsa evrak tekrar teslim edilemez; "Teslim Et" pasifleşir.
  // Onaylı teslimde backend Teslim (3) kaydı açmaz, alıcı onaylayınca doğrudan Teslim Alındı (5) yazar.
  readonly hasDeliveredDoc = computed(() => this.docs().some(d => this.isDelivered(d)));

  isDelivered(doc: ScannedDoc): boolean {
    return doc.allocations.some(a =>
      a.status === AllocationStatusEnum.Teslim || a.status === AllocationStatusEnum.TeslimAlindi);
  }

  // Zimmet sahibinin birim kısa adı; allocation kaydında gelmediği için kullanıcı listesinden bulunur.
  readonly activeAllocationDeptShortName = computed(() => {
    const userId = this.activeAllocation()?.userId?.toLowerCase();
    if (!userId) return null;
    return (this.usersResult.value() ?? [])
      .find(u => u.id?.toLowerCase() === userId)?.departmentShortName || null;
  });

  // Devret sekmesinde seçilen personel listedeki evrakların tümünün aktif zimmet
  // sahibiyse işlem bir şey değiştirmez; Zimmetle / Teslim Et pasifleşir.
  readonly selectedIsActiveHolder = computed(() => {
    const personId = this.selectedPerson()?.id?.toLowerCase();
    const docs = this.docs();
    if (this.zimmetType() !== 'other' || !personId || docs.length === 0) return false;
    return docs.every(d => this.activeAllocationOf(d)?.userId?.toLowerCase() === personId);
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
    this.loadPendingRequest(doc.id);

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

  // force: Kapat butonu; değişiklikler atılır. Dışarı tıklama / Escape kaydedilmemiş
  // değişiklik varken popup'ı kapatmaz.
  closeResult(force = false) {
    if (this.savingEdits()) return;
    if (!force && this.hasDirtyEdits()) return;
    this.saveResult.set(null);
    this.cdr.markForCheck();
    if (!this.scanCollapsed) this.focusQrInputSoon();
  }

  // === SONUÇ POPUP'INDA EVRAK BİLGİLERİ ===
  private buildEdit(doc: ScannedDoc): ResultDocEdit {
    const d = doc.detail ?? {};
    const original = {
      pageCount: d.pageCount != null && String(d.pageCount) !== '' ? Number(d.pageCount) : null,
      hasAttachment: d.hasAttachment ?? null,
      attachmentDescription: d.attachmentDescription ?? ''
    };
    return { doc, ...original, original };
  }

  isEditDirty(e: ResultDocEdit): boolean {
    const desc = e.hasAttachment === true ? (e.attachmentDescription ?? '').trim() : '';
    const origDesc = e.original.hasAttachment === true ? e.original.attachmentDescription.trim() : '';
    return this.normalizedPageCount(e) !== e.original.pageCount
      || e.hasAttachment !== e.original.hasAttachment
      || desc !== origDesc;
  }

  // Sayfa sayısı boş bırakılamaz (önceden boşsa boş kalabilir) ve negatif olamaz.
  isEditInvalid(e: ResultDocEdit): boolean {
    const pc = this.normalizedPageCount(e);
    if (pc === null) return e.original.pageCount !== null;
    return pc < 0 || !Number.isInteger(pc)
      || (e.attachmentDescription ?? '').length > ATTACHMENT_DESCRIPTION_MAX;
  }

  private normalizedPageCount(e: ResultDocEdit): number | null {
    return e.pageCount == null || String(e.pageCount) === '' ? null : Number(e.pageCount);
  }

  hasDirtyEdits(): boolean {
    return (this.saveResult()?.edits ?? []).some(e => this.isEditDirty(e));
  }

  hasInvalidEdits(): boolean {
    return (this.saveResult()?.edits ?? []).some(e => this.isEditInvalid(e));
  }

  // Değişen evraklar güncel hâliyle sunucudan alınır, yalnızca bu üç alan değiştirilip
  // Update'e tam model olarak gönderilir (eksik alan Update'te boşalabilir).
  async saveResultEdits() {
    const userId = this.user()?.id;
    const dirty = (this.saveResult()?.edits ?? []).filter(e => this.isEditDirty(e));
    if (!userId || !dirty.length || this.savingEdits()) return;
    if (this.hasInvalidEdits()) {
      this.#toast.showToast('Uyarı', 'Sayfa sayısı ve ek açıklamasını kontrol edin.', 'warning');
      return;
    }

    this.savingEdits.set(true);
    this.cdr.markForCheck();

    const failedNos: string[] = [];
    for (const e of dirty) {
      try {
        const fresh = await firstValueFrom(this.incomingDocumentService.getIncomingDocumentByDocumentId(e.doc.id));
        // Ek açıklaması yalnızca "Var" seçiliyken gönderilir; "Yok" seçilince sunucu siler,
        // belirtilmemişse (null) mevcut değer korunur. (Evrak Kayıt ekranıyla aynı kural)
        const updated = {
          ...fresh,
          pageCount: this.normalizedPageCount(e) as number,
          hasAttachment: e.hasAttachment,
          attachmentDescription: e.hasAttachment === true
            ? (e.attachmentDescription ?? '').trim()
            : e.hasAttachment === false ? '' : null,
          userId
        };
        await firstValueFrom(this.incomingDocumentService.updateIncomingDocument(updated));
        this.docs.update(list => list.map(d => d.id === e.doc.id ? { ...d, detail: { ...d.detail, ...updated } } : d));
        e.original = {
          pageCount: this.normalizedPageCount(e),
          hasAttachment: e.hasAttachment,
          attachmentDescription: (e.attachmentDescription ?? '').trim()
        };
      } catch (err) {
        console.error(`Evrak bilgileri kaydedilemedi (${e.doc.qrCode}):`, err);
        failedNos.push(e.doc.qrCode);
      }
    }

    this.savingEdits.set(false);
    if (failedNos.length) {
      this.#toast.showToast('Kayıt Başarısız', `Evrak bilgileri kaydedilemedi: ${failedNos.join(', ')}`, 'error');
      this.cdr.markForCheck();
      return;
    }
    this.closeResult(true);
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
    this.personPickMode.set('birim');
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

    // Onay bekleyen talebi olan evrak backend'e gönderilmez (her türlü zimmeti reddeder);
    // doğrudan başarısız sayılır ve nedeni sonuç popup'ında yazılır.
    const blocked = allDocs.filter(d => !skipped.includes(d) && d.pendingRequest);
    const failed: ScannedDoc[] = [...blocked];
    const failReasons: Record<string, string> = {};
    for (const d of blocked) failReasons[d.id] = this.pendingRequestText(d.pendingRequest!);

    const docs = allDocs.filter(d => !skipped.includes(d) && !blocked.includes(d));

    if (docs.length === 0) {
      this.saveResult.set({ targetName, actionLabel, succeeded: [], pending: [], skipped, failed, failReasons, edits: [] });
      this.cdr.markForCheck();
      return;
    }

    this.saving.set(true);
    this.cdr.markForCheck();

    const succeeded: ScannedDoc[] = [];
    const pending: ScannedDoc[] = [];

    for (const doc of docs) {
      try {
        const res = await firstValueFrom(this.allocationService.createAllocation({
          incomingDocumentId: doc.id,
          userId: personId,
          createdUserId: user.id,
          status,
          userType: 1,
        }));
        const outcome = DocumentAllocation.classifyCreateResponse(res);
        if (outcome.kind === 'allocated') succeeded.push(doc);
        else if (outcome.kind === 'pending') pending.push(doc);
        else {
          failed.push(doc);
          failReasons[doc.id] = outcome.reason;
        }
      } catch (err) {
        console.error(`Zimmetleme başarısız (${doc.qrCode}):`, err);
        failed.push(doc);
      }
    }

    this.saving.set(false);

    // Sonuç toast yerine popup'ta gösterilir: sayılar ve her gruptaki evraklar.
    // Teslim Et'te teslim edilen / onaya gönderilen evrakların sayfa sayısı ve ek bilgisi
    // popup'ta düzenlenebilir.
    const edits = status === AllocationStatusEnum.Teslim
      ? [...succeeded, ...pending].map(d => this.buildEdit(d))
      : [];
    this.saveResult.set({ targetName, actionLabel, succeeded, pending, skipped, failed, failReasons, edits });

    if (succeeded.length + pending.length > 0) {
      this.personControl.setValue(null);
      this.zimmetType.set('other');
      for (const doc of succeeded) this.loadAllocations(doc.id);
      for (const doc of pending) this.loadPendingRequest(doc.id);
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
