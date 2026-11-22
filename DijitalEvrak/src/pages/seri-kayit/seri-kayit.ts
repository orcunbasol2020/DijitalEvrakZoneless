import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnDestroy, OnInit, ViewChild, ViewEncapsulation,
  computed, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { FlexiToastService } from 'flexi-toast';
import { Observable, catchError, map, of, shareReplay, switchMap } from 'rxjs';
import GenericModel from '../../../components/generic-model/generic-model';
import { SimpleAutocompleteComponent } from '../simpleautocomplete/simpleautocomplete';
import { UPLOAD_DOCUMENT_ROLES, UploadDocumentModal } from '../../../components/upload-document-modal/upload-document-modal';
import { RoleService } from '../../services/role-service';
import { IncomingDocumentModel } from '../../models/incoming-document/incoming-document.model';
import { Common } from '../../services/common';
import { Department, DepartmentModel } from '../../services/department';
import { ExternalInstitutionModel, INSTITUTION_MIN_SEARCH, institutionSearch } from '../../services/external-institution';
import { IncomingDocumentService } from '../../services/incomingdocument';
import {
  SerialQueueItem, SerialRecipient, SerialRegisterRequest, SerialRegistrationService, SerialRemaining,
  isLeaseLost, serialErrorMessage
} from '../../services/serial-registration';
import { SecurityDegreeEnum, SecurityDegreeLabels } from '../../models/securitydegree.model';
import { UrgencyDegreeEnum, UrgencyDegreeLabels } from '../../models/urgencydegree.model';
import { DocumentTypeEnum, DocumentTypeLabels } from '../../models/documenttype.model';
import { idKey } from '../../models/ids';
import { normalizeDocumentNo } from '../../utils/document-number';

/** Evrak numarası biçimi (Atlas): 2026/45678923 */
const DOCUMENT_NO_PATTERN = /^\d{4}\/\d+$/;
/** Ekranın altındaki "son kayıtlar" listesinde tutulan kayıt sayısı */
const RECENT_MAX = 8;
/** Sabitlenen alanlar tarayıcıda hatırlanır */
const PINS_STORAGE_KEY = 'seriKayit.pins';
/** Ayırma 5 dk; form açıkken bu aralıkla uzatılır (Renew) */
const RENEW_INTERVAL_MS = 60_000;
/** Önceden alma başarısız oldu; sıra boş anlamına gelmez */
const PREFETCH_FAILED = 'prefetch-failed' as const;

type Phase = 'loading' | 'working' | 'empty' | 'error';
type PinKey = 'institution' | 'documentTypeId' | 'securityDegree' | 'urgencyDegree' | 'recipients';

/** Ekrana hazır iş: sıradaki kayıt + önceden yüklenmiş PDF'i */
interface LoadedItem {
  item: SerialQueueItem;
  blobUrl: string | null;
}

interface RecentEntry {
  documentId: string;
  documentNumber: string;
  published: boolean;
  at: Date;
}

/** Sabitlenen alanların son kaydedilen değerleri; sonraki evrakta form bunlarla dolu gelir */
interface PinnedValues {
  institution: ExternalInstitutionModel | null;
  documentTypeId: number | null;
  securityDegree: number | null;
  urgencyDegree: number | null;
  recipients: SerialRecipient[];
}

/** Taramaların hepsinde, evraklarda ise yalnızca dosya bağlıysa PDF vardır (sıra dosyasız ön kayıtları da verir) */
function hasFile(item: SerialQueueItem): boolean {
  return item.kind === 'scan' || !!item.documentName;
}

/** Evrak işinin kimliği: cevaptaki evrak modeli, yoksa "doc:<id>" anahtarı */
function documentIdOf(item: SerialQueueItem): string | null {
  if (item.kind !== 'document') return null;
  return item.document?.id ?? (item.key.startsWith('doc:') ? item.key.slice(4) : null);
}

/** Dosyasız evrakta belge alanındaki damga (Evrak Kayıt ile aynı dereceler) */
const STAMP_LABELS: Partial<Record<number, string>> = {
  [SecurityDegreeEnum.Confidential]: 'GİZLİ',
  [SecurityDegreeEnum.TopSecret]: 'ÇOK GİZLİ',
  [SecurityDegreeEnum.Crypto]: 'KRİPTO',
};

const DEFAULTS = {
  securityDegree: SecurityDegreeEnum.ServiceUseOnly,
  urgencyDegree: UrgencyDegreeEnum.Normal,
} as const;

/**
 * Seri Kayıt: taranmış evrakların art arda kaydı. Solda belge, sağda tek sütun form; Kaydet ya da
 * Kaydet + Yayınla sonrası sıradaki belge beklemeden açılır (bir sonraki iş ve PDF'i arka planda önceden alınır).
 *
 * Sıra backend'de tutulur (api/SerialRegistration): havuzdaki eşleşmemiş taramalar + taraması bağlanmış ama
 * kaydedilmemiş evraklar, en eski önce. ClaimNext işi kullanıcıya süreli ayırır; Kaydet'e kadar zimmet,
 * hareket ya da durum yazılmaz. Register bağlama + kayıt + zimmet + yayını tek işlemde yapar.
 *
 * Klavye: Ctrl+Enter Kaydet, Ctrl+Shift+Enter Kaydet + Yayınla, Alt+→ İleri (atla).
 */
@Component({
  imports: [CommonModule, ReactiveFormsModule, GenericModel, SimpleAutocompleteComponent, UploadDocumentModal],
  templateUrl: './seri-kayit.html',
  styleUrls: ['../gidenevrak/zimmet/zimmet.css', '../onkayit/onkayit.css', '../evrakkayit/evrak-stage.css', './seri-kayit.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SeriKayit implements OnInit, OnDestroy {
  private readonly service = inject(SerialRegistrationService);
  private readonly departmentService = inject(Department);
  private readonly incomingDocumentService = inject(IncomingDocumentService);
  private readonly common = inject(Common);
  private readonly toast = inject(FlexiToastService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly fb = inject(FormBuilder);
  readonly #destroyRef = inject(DestroyRef);

  readonly breadcrumbs = [{ title: 'Seri Kayıt', url: 'seri-kayit', icon: '' }];

  // ---- Seçenekler ----
  readonly securityDegreeOptions = Object.entries(SecurityDegreeLabels)
    .map(([value, label]) => ({ value: Number(value), label }));
  readonly urgencyDegreeOptions = Object.entries(UrgencyDegreeLabels)
    .map(([value, label]) => ({ value: Number(value), label }));
  // Gelen evrak kaydında Nota seçilmez (Evrak Kayıt ile aynı)
  readonly documentTypeOptions = Object.entries(DocumentTypeLabels)
    .map(([value, label]) => ({ value: Number(value), label }))
    .filter(o => o.value !== DocumentTypeEnum.Nota);
  readonly institutionSearch = institutionSearch();
  readonly institutionMinSearch = INSTITUTION_MIN_SEARCH;
  readonly departments = signal<DepartmentModel[]>([]);
  readonly departmentsLoading = signal(true);

  // ---- Form ----
  readonly form = this.fb.group({
    documentNumber: ['', [Validators.required, Validators.pattern(DOCUMENT_NO_PATTERN)]],
    institution: new FormControl<ExternalInstitutionModel | null>(null),
    orginalNo: [''],
    documentDate: [''],
    subject: [''],
    documentTypeId: [null as number | null],
    securityDegree: [DEFAULTS.securityDegree as number | null],
    urgencyDegree: [DEFAULTS.urgencyDegree as number | null],
  });
  get institutionControl() { return this.form.controls.institution; }

  readonly recipients = signal<SerialRecipient[]>([]);
  readonly recipientPicker = new FormControl<DepartmentModel | null>(null);
  readonly recipientOptions = computed(() => {
    const taken = new Set(this.recipients().map(r => idKey(r.departmentId)));
    return this.departments().filter(d => !taken.has(idKey(d.id)));
  });

  // ---- Sıra durumu ----
  readonly phase = signal<Phase>('loading');
  readonly current = signal<LoadedItem | null>(null);
  readonly remaining = signal<SerialRemaining>({ scans: 0, documents: 0 });
  readonly remainingTotal = computed(() => this.remaining().scans + this.remaining().documents);
  readonly completed = signal(0);
  readonly recent = signal<RecentEntry[]>([]);
  readonly errorText = signal<string | null>(null);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal<'save' | 'publish' | null>(null);
  readonly skipping = signal(false);
  readonly busy = computed(() => !!this.saving() || this.skipping() || this.uploading());

  /** Bu oturumda kaydedilen (ya da başkasına geçmiş) işler; backend bunları tekrar vermez */
  private readonly excluded = new Set<string>();
  /**
   * İleri ile geçilen işler: sıra dönene kadar tekrar gelmesin diye hariç tutulur. Sıra bitince
   * "Yeniden Kontrol Et" bunları temizler; atlanan belgeler yeniden gelir.
   */
  private readonly skipped = new Set<string>();
  readonly skippedCount = signal(0);
  /** Bir sonraki iş: arka planda alınır, PDF'i yüklenir; Kaydet sonrası beklemeden gösterilir */
  private next$: Observable<LoadedItem | null | typeof PREFETCH_FAILED> | null = null;
  private nextKey: string | null = null;

  readonly item = computed(() => this.current()?.item ?? null);
  readonly pdfUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.current()?.blobUrl;
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url + '#view=FitH') : null;
  });
  /** Barkoddan birden fazla numara okunduysa memur seçer */
  readonly numberChoices = computed(() => {
    const item = this.item();
    return item?.kind === 'scan' && (item.qrCodes?.length ?? 0) > 1 ? item.qrCodes! : [];
  });
  readonly numberLocked = computed(() => this.item()?.kind === 'document');
  /** Açık evrakın dosyası yok (gizli ya da henüz taranmamış ön kayıt): belge yerine damgalı boş kâğıt gösterilir */
  readonly noFile = computed(() => {
    const item = this.item();
    return !!item && !hasFile(item);
  });
  // Zoneless: damga formdaki gizlilik seçimini izler
  readonly selectedSecurity = toSignal(this.form.controls.securityDegree.valueChanges, {
    initialValue: this.form.controls.securityDegree.value
  });
  readonly stamp = computed(() => STAMP_LABELS[this.selectedSecurity() ?? 0] ?? null);

  // ---- Sabitlenen alanlar ----
  readonly pins = signal<Set<PinKey>>(this.readPins());
  private pinned: PinnedValues | null = null;

  private keydownHandler = (e: KeyboardEvent) => this.onKeydown(e);

  // Kısayollar ve Son kayıtlar panelleri dışına tıklanınca kapanır
  @ViewChild('keysMenu') keysMenu?: ElementRef<HTMLDetailsElement>;
  @ViewChild('recentMenu') recentMenu?: ElementRef<HTMLDetailsElement>;
  private clickHandler = (e: MouseEvent) => {
    for (const menu of [this.keysMenu?.nativeElement, this.recentMenu?.nativeElement]) {
      if (menu?.open && !menu.contains(e.target as Node)) menu.open = false;
    }
  };

  ngOnInit(): void {
    this.departmentService.getDepartments().subscribe({
      next: list => {
        this.departments.set(list ?? []);
        this.departmentsLoading.set(false);
      },
      error: () => this.departmentsLoading.set(false)
    });

    // Birim seçilince listeye eklenir, seçici boşalır (Gereği varsayılan)
    this.recipientPicker.valueChanges.subscribe(dep => {
      if (!dep?.id) return;
      if (!this.recipients().some(r => idKey(r.departmentId) === idKey(dep.id))) {
        this.recipients.update(list => [...list, { departmentId: dep.id, name: dep.name, actionRequired: true }]);
      }
      // Seçici kutusu da boşalsın diye olayla yazılır (null'da yukarıdaki koşul çıkar)
      this.recipientPicker.setValue(null);
    });

    window.addEventListener('keydown', this.keydownHandler);
    window.addEventListener('pagehide', this.pagehideHandler);
    document.addEventListener('click', this.clickHandler);
    // Form açıkken ayırmalar dakikada bir uzatılır; başarısızsa sessiz geçilir (ClaimNext de uzatır)
    const renewTimer = setInterval(() => {
      const userId = this.common.user()?.id;
      if (userId && this.phase() === 'working') {
        this.service.renew(userId).pipe(catchError(() => of(null))).subscribe();
      }
    }, RENEW_INTERVAL_MS);
    this.#destroyRef.onDestroy(() => {
      window.removeEventListener('keydown', this.keydownHandler);
      window.removeEventListener('pagehide', this.pagehideHandler);
      document.removeEventListener('click', this.clickHandler);
      clearInterval(renewTimer);
    });

    this.start();
  }

  /** Sekme kapanırken / yenilenirken açık ve önceden alınmış belge keepalive istekle bırakılır */
  private pagehideHandler = () => {
    const userId = this.common.user()?.id;
    const keys = this.openKeys();
    if (userId && keys.length) this.service.releaseOnUnload(userId, keys);
  };

  private openKeys(): string[] {
    return [this.current()?.item.key, this.nextKey].filter((k): k is string => !!k);
  }

  ngOnDestroy(): void {
    // Ekrandan çıkılınca ayırmalar bırakılır; bırakılamazsa süre dolunca sıraya döner
    this.releaseOpenLeases();
    this.revoke(this.current());
  }

  // ========== Sıra ==========

  /** Sıra bitince: atlanan belgeler yeniden sıraya katılır ve tekrar bakılır */
  recheck(): void {
    this.skipped.clear();
    this.skippedCount.set(0);
    this.start();
  }

  start(): void {
    this.loadError.set(null);
    this.phase.set('loading');
    this.advance();
  }


  /** Sıradaki iş gösterilir: önceden alınmışsa beklemeden, değilse şimdi alınır */
  private advance(): void {
    const source = this.next$ ?? this.claimLoaded();
    this.next$ = null;
    this.nextKey = null;
    // Önceden alınan iş hazırsa abonelik aynı anda döner; hazır değilse yükleniyor görünür
    let resolved = false;
    source.subscribe({
      next: loaded => {
        resolved = true;
        // Önceden alma başarısızdı (ör. "en fazla 2 açık belge"): sıra boş sayılmaz, şimdi yeniden alınır
        if (loaded === PREFETCH_FAILED) {
          this.advance();
          return;
        }
        this.revoke(this.current());
        if (!loaded) {
          this.current.set(null);
          this.phase.set('empty');
          return;
        }
        this.show(loaded);
      },
      error: err => {
        resolved = true;
        this.revoke(this.current());
        this.current.set(null);
        this.loadError.set(serialErrorMessage(err, 'Sıradaki evrak alınamadı.'));
        this.phase.set('error');
      }
    });
    if (!resolved) this.phase.set('loading');
  }

  private show(loaded: LoadedItem): void {
    this.current.set(loaded);
    this.applyItem(loaded.item);
    this.phase.set('working');
    this.focusFirstEmpty();
    this.prefetchNext();
  }

  /**
   * Bir sonraki belge arka planda alınır. Hata (ör. 409 "en fazla 2 açık belge") burada sıra boş sayılmaz:
   * PREFETCH_FAILED olarak saklanır, Kaydet / İleri sonrası advance yeniden dener.
   */
  private prefetchNext(): void {
    if (this.next$) return;
    const shared = this.claimLoaded().pipe(
      catchError(() => of(PREFETCH_FAILED)),
      shareReplay(1)
    );
    this.next$ = shared;
    shared.subscribe(loaded => {
      this.nextKey = loaded && loaded !== PREFETCH_FAILED ? loaded.item.key : null;
    });
  }

  /** Sıradaki işi alır ve PDF'ini blob olarak yükler; PDF gelmezse iş yine gösterilir */
  private claimLoaded(): Observable<LoadedItem | null> {
    const userId = this.common.user()?.id;
    if (!userId) return of(null);
    const exclude = [...this.excluded, ...this.skipped];
    const currentKey = this.current()?.item.key;
    if (currentKey) exclude.push(currentKey);

    return this.service.claimNext(userId, exclude).pipe(
      switchMap(result => {
        this.remaining.set(result.remaining);
        return result.item ? this.withPdf(result.item) : of(null);
      })
    );
  }

  /** İşin PDF'i yüklenir; dosyası olmayan (taranmayacak) evrakta istek atılmaz */
  private withPdf(item: SerialQueueItem): Observable<LoadedItem> {
    if (!hasFile(item)) return of({ item, blobUrl: null });
    return this.service.pdf(item).pipe(
      map(blob => ({ item, blobUrl: URL.createObjectURL(blob) })),
      catchError(() => of({ item, blobUrl: null }))
    );
  }

  // ---- Belge Yükle: taranmış belgesi olmayan evraka PDF (Evrak Kayıt ile aynı pencere) ----
  // UploadFile yalnızca dosyayı bağlar ve "dosya yüklendi" hareketini yazar; zimmet ve kayıt hareketi
  // yazılmaz, evrak sırada kalır. Evrak Kayıt'taki akıştan farkı: zimmet devri yok, zimmeti Kaydet (Register) yazar.
  private readonly roleService = inject(RoleService);
  readonly canUploadDocument = computed(() => this.roleService.hasAny(UPLOAD_DOCUMENT_ROLES));
  readonly uploadDoc = signal<IncomingDocumentModel | null>(null);
  readonly uploading = signal(false);

  openUpload(): void {
    const item = this.item();
    if (!item || !this.noFile() || !this.canUploadDocument() || this.busy()) return;
    const id = documentIdOf(item);
    if (!id) return;
    this.uploadDoc.set({ ...(item.document ?? {}), id, qrCode: item.documentNumber ?? item.document?.qrCode } as IncomingDocumentModel);
  }

  closeUpload(): void {
    if (this.uploading()) return;
    this.uploadDoc.set(null);
    this.focusFirstEmpty();
  }

  confirmUpload(file: File): void {
    const doc = this.uploadDoc();
    const userId = this.common.user()?.id;
    const loaded = this.current();
    if (!doc?.id || !userId || !loaded || this.uploading()) return;

    this.uploading.set(true);
    const documentId = doc.id;
    this.incomingDocumentService.uploadFile(documentId, file, userId).pipe(
      // Kaydedilen dosya adı yanıtta yok; evrak yeniden okunur
      switchMap(() => this.incomingDocumentService.getIncomingDocumentByDocumentId(documentId)),
      switchMap(fresh => this.withPdf({ ...loaded.item, documentName: fresh?.documentName ?? null }))
    ).subscribe({
      next: updated => {
        this.uploading.set(false);
        this.uploadDoc.set(null);
        // Form olduğu gibi kalır; yalnızca belge alanı yeni PDF'i gösterir
        if (this.current()?.item.key === loaded.item.key) {
          this.revoke(loaded);
          this.current.set(updated);
        }
        this.toast.showToast('Belge yüklendi', 'Belge evraka bağlandı; bilgileri girip kaydedebilirsiniz.', 'success');
        this.focusFirstEmpty();
      },
      error: err => {
        this.uploading.set(false);
        this.toast.showToast('Belge yüklenemedi', serialErrorMessage(err, 'Belge yüklenemedi.'), 'error');
      }
    });
  }

  // ---- Numara ile aç: taranmayacak (gizli) evrak ya da belirli bir belge, zarftaki QR okutularak ----
  readonly openingByNumber = signal(false);

  openByNumber(input: HTMLInputElement): void {
    const userId = this.common.user()?.id;
    const no = normalizeDocumentNo(input.value.trim());
    if (!userId || !no || this.openingByNumber() || this.busy()) return;
    if (!DOCUMENT_NO_PATTERN.test(no)) {
      this.toast.showToast('Numara ile aç', 'Evrak numarası 2026/12345678 biçiminde olmalı.', 'warning');
      return;
    }
    input.value = '';
    // Okutulan numara zaten açıksa yapılacak bir şey yok
    const open = this.item();
    if (open && (open.documentNumber === no || open.document?.qrCode === no)) {
      this.focusFirstEmpty();
      return;
    }

    // Kullanıcı başına 2 açık belge sınırı: açık ve önceden alınmış belge önce sıraya bırakılır
    const wasWorking = this.phase() === 'working';
    this.releaseOpenLeases();
    this.revoke(this.current());
    this.current.set(null);
    this.openingByNumber.set(true);
    this.phase.set('loading');

    this.service.claimByNumber(userId, no).pipe(
      switchMap(result => {
        this.remaining.set(result.remaining);
        return result.item ? this.withPdf(result.item) : of(null);
      })
    ).subscribe({
      next: loaded => {
        this.openingByNumber.set(false);
        if (!loaded) {
          this.toast.showToast('Numara ile aç', `${no} açılamadı.`, 'warning');
          this.advance();
          return;
        }
        this.show(loaded);
      },
      error: err => {
        this.openingByNumber.set(false);
        this.toast.showToast('Numara ile aç', serialErrorMessage(err, `${no} açılamadı.`), 'warning');
        // Bırakılan sıraya dönülür; ekran önceden boşsa yine sıra denenir
        if (wasWorking || this.phase() === 'loading') this.advance();
      }
    });
  }

  focusOpenNumber(): void {
    (this.host.nativeElement.querySelector('#sk-open-number') as HTMLInputElement | null)?.focus();
  }

  skip(): void {
    const item = this.item();
    const userId = this.common.user()?.id;
    if (!item || !userId || this.busy()) return;

    this.skipping.set(true);
    this.skipped.add(item.key);
    this.skippedCount.set(this.skipped.size);
    this.service.release(userId, item.key).pipe(catchError(() => of(null))).subscribe(() => {
      this.skipping.set(false);
      this.advance();
    });
  }

  private releaseOpenLeases(): void {
    const userId = this.common.user()?.id;
    if (!userId) return;
    for (const key of this.openKeys()) {
      this.service.release(userId, key).pipe(catchError(() => of(null))).subscribe();
    }
    this.next$ = null;
    this.nextKey = null;
  }

  private revoke(loaded: LoadedItem | null): void {
    if (loaded?.blobUrl) URL.revokeObjectURL(loaded.blobUrl);
  }

  // ========== Form ==========

  /** Form sıfırlanır; sabitlenen alanlar, ardından ön kayıt bilgileri ve barkod numarası uygulanır */
  private applyItem(item: SerialQueueItem): void {
    this.errorText.set(null);
    this.form.reset({
      documentNumber: '', institution: null, orginalNo: '', documentDate: '', subject: '', documentTypeId: null,
      securityDegree: DEFAULTS.securityDegree, urgencyDegree: DEFAULTS.urgencyDegree
    });
    this.recipients.set([]);

    const pins = this.pins();
    const pinned = this.pinned;
    if (pinned) {
      if (pins.has('institution')) this.form.patchValue({ institution: pinned.institution });
      if (pins.has('documentTypeId')) this.form.patchValue({ documentTypeId: pinned.documentTypeId });
      if (pins.has('securityDegree')) this.form.patchValue({ securityDegree: pinned.securityDegree });
      if (pins.has('urgencyDegree')) this.form.patchValue({ urgencyDegree: pinned.urgencyDegree });
      if (pins.has('recipients')) this.recipients.set([...pinned.recipients]);
    }

    // Ön kayıt bilgileri bu evraka ait olduğu için sabitlenen değerlerden önce gelir
    const d = item.document;
    if (d) {
      const patch: Record<string, unknown> = {};
      if (d.orginalNo) patch['orginalNo'] = d.orginalNo;
      if (d.documentDate) patch['documentDate'] = d.documentDate.split('T')[0];
      if (d.subject) patch['subject'] = d.subject;
      if (d.documentTypeId) patch['documentTypeId'] = d.documentTypeId;
      if (d.securityDegree) patch['securityDegree'] = d.securityDegree;
      if (d.urgencyDegree) patch['urgencyDegree'] = d.urgencyDegree;
      if (d.externalInstitutionId !== null && d.externalInstitutionId !== undefined && d.externalInstitutionId !== 0) {
        patch['institution'] = { id: d.externalInstitutionId, name: d.externalInstitutionName || '', type: 0 };
      }
      this.form.patchValue(patch);
    }
    const saved = (item.recipients ?? []).filter(r => !r.isDeleted && r.departmentId);
    if (saved.length) {
      this.recipients.set(saved.map(r => ({
        departmentId: r.departmentId,
        name: r.departmentName || this.departments().find(x => idKey(x.id) === idKey(r.departmentId))?.name || 'Birim',
        actionRequired: r.actionRequired ?? true
      })));
    }

    const qrCodes = item.qrCodes ?? [];
    const number = item.documentNumber || d?.qrCode || (qrCodes.length === 1 ? qrCodes[0] : '');
    this.form.patchValue({ documentNumber: normalizeDocumentNo(number ?? '') });
    if (item.kind === 'document') this.form.controls.documentNumber.disable();
    else this.form.controls.documentNumber.enable();
  }

  onNumberInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const normalized = normalizeDocumentNo(input.value);
    if (normalized !== input.value) this.form.controls.documentNumber.setValue(normalized);
  }

  chooseNumber(no: string): void {
    this.form.controls.documentNumber.setValue(no);
    this.focusFirstEmpty();
  }


  removeRecipient(r: SerialRecipient): void {
    this.recipients.update(list => list.filter(x => x !== r));
  }

  toggleRecipientAction(r: SerialRecipient): void {
    this.recipients.update(list => list.map(x => x === r ? { ...x, actionRequired: !x.actionRequired } : x));
  }

  // ---- Sabitle ----
  isPinned(key: PinKey): boolean {
    return this.pins().has(key);
  }

  togglePin(key: PinKey): void {
    const next = new Set(this.pins());
    if (next.has(key)) next.delete(key); else next.add(key);
    this.pins.set(next);
    try { localStorage.setItem(PINS_STORAGE_KEY, JSON.stringify([...next])); } catch { /* depolama kapalı olabilir */ }
  }

  private readPins(): Set<PinKey> {
    try {
      const raw = localStorage.getItem(PINS_STORAGE_KEY);
      return new Set(raw ? JSON.parse(raw) as PinKey[] : []);
    } catch {
      return new Set();
    }
  }

  // ========== Kaydet ==========

  /** Kayıt / yayın için eksikler; yayın kuralları backend'deki Atlas doğrulamasıyla aynı */
  private validate(publish: boolean): string | null {
    const no = this.form.controls.documentNumber;
    if (!no.value) return 'Evrak numarası girilmedi.';
    if (no.invalid) return 'Evrak numarası 2026/12345678 biçiminde olmalı.';
    if (!publish) return null;

    const v = this.form.getRawValue();
    const missing: string[] = [];
    // "Dilekçe / Talep" kurumunun kimliği -1; seçilmedi = null / 0
    const institutionId = v.institution?.id;
    if (institutionId === null || institutionId === undefined || institutionId === 0) missing.push('Nereden');
    if (!v.documentDate) missing.push('Tarih');
    if (!v.subject?.trim()) missing.push('Konu');
    if (!v.securityDegree) missing.push('Gizlilik');
    if (missing.length) return `Yayın için eksik: ${missing.join(', ')}.`;
    if (v.securityDegree === SecurityDegreeEnum.PersonalUseOnly) {
      return 'Kişiye Özel evrak Atlas\'a aktarılamaz; Kaydet ile kaydedin.';
    }
    return null;
  }

  save(publish: boolean): void {
    const loaded = this.current();
    const userId = this.common.user()?.id;
    if (!loaded || !userId || this.busy() || this.phase() !== 'working') return;

    const problem = this.validate(publish);
    if (problem) {
      this.errorText.set(problem);
      this.focusFirstEmpty();
      return;
    }
    this.errorText.set(null);

    const v = this.form.getRawValue();
    const request: SerialRegisterRequest = {
      userId,
      key: loaded.item.key,
      documentNumber: v.documentNumber!.trim(),
      externalInstitutionId: v.institution?.id ?? null,
      orginalNo: v.orginalNo?.trim() || null,
      documentDate: v.documentDate || null,
      subject: v.subject?.trim() || null,
      documentTypeId: v.documentTypeId ?? null,
      securityDegree: v.securityDegree ?? null,
      urgencyDegree: v.urgencyDegree ?? null,
      recipients: this.recipients().map(r => ({ departmentId: r.departmentId, actionRequired: r.actionRequired, notes: null })),
      publish
    };

    this.saving.set(publish ? 'publish' : 'save');
    this.service.register(request).subscribe({
      next: result => {
        this.saving.set(null);
        const no = result?.documentNumber || request.documentNumber;
        const published = result?.published ?? publish;
        this.toast.showToast('Kaydedildi',
          published ? `${no} kaydedildi, Atlas'a aktarım sırasına alındı.` : `${no} kaydedildi.`, 'success');

        this.excluded.add(loaded.item.key);
        this.completed.update(n => n + 1);
        this.recent.update(list => [
          { documentId: result?.documentId, documentNumber: no, published, at: new Date() }, ...list
        ].slice(0, RECENT_MAX));
        this.pinned = {
          institution: v.institution ?? null,
          documentTypeId: v.documentTypeId ?? null,
          securityDegree: v.securityDegree ?? null,
          urgencyDegree: v.urgencyDegree ?? null,
          recipients: [...this.recipients()]
        };
        this.advance();
      },
      error: err => {
        this.saving.set(null);
        if (isLeaseLost(err)) {
          // Ayırma süresi dolup belge başka kullanıcıya geçmiş; bu belge için yapılacak bir şey kalmadı
          this.toast.showToast('Belge başka kullanıcıda',
            serialErrorMessage(err, 'Bu belge başka bir kullanıcıya geçti; sıradaki belgeye geçiliyor.'), 'warning');
          this.excluded.add(loaded.item.key);
          this.advance();
          return;
        }
        // Hiçbir şey kaydedilmedi; memur düzeltip tekrar dener
        this.errorText.set(serialErrorMessage(err, 'Evrak kaydedilemedi.'));
      }
    });
  }

  /** Son kayıtlardan biri düzeltme için Evrak Kayıt'ta açılır */
  openRecent(entry: RecentEntry): void {
    if (!entry.documentId) return;
    this.incomingDocumentService.setSelectedIncomingDocument(entry.documentId);
    this.incomingDocumentService.setIncomingDocumentUpdateType('1');
    this.router.navigate(['/evrakkayit']);
  }

  // ========== Klavye / odak ==========

  private onKeydown(e: KeyboardEvent): void {
    // Belge Yükle penceresi açıkken kısayollar çalışmaz
    if (this.uploadDoc()) return;
    // F2: numara okutma alanına odak (zarftaki QR okutulacak); her durumda çalışır
    if (e.key === 'F2') {
      e.preventDefault();
      this.focusOpenNumber();
      return;
    }
    if (this.phase() !== 'working') return;
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      this.save(e.shiftKey);
    } else if (e.altKey && e.key === 'ArrowRight') {
      e.preventDefault();
      this.skip();
    }
  }

  /** İlk boş zorunlu alana odak, formdaki sırayla: numara → tarih → konu → nereden; hepsi doluysa Kaydet */
  private focusFirstEmpty(): void {
    setTimeout(() => {
      const root = this.host.nativeElement as HTMLElement;
      const v = this.form.getRawValue();
      const target =
        (!this.numberLocked() && !v.documentNumber) ? '#sk-number'
          : !v.documentDate ? '#sk-date'
            : !v.subject ? '#sk-subject'
              : !v.institution ? '#sk-institution input'
                : '#sk-save';
      (root.querySelector(target) as HTMLElement | null)?.focus();
    });
  }
}
