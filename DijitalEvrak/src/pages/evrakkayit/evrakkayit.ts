import { idKey } from '../../models/ids';
import { ChangeDetectionStrategy, Component, DestroyRef, ViewEncapsulation, signal, computed, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule, FormControl } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FlexiToastService } from 'flexi-toast';
import GenericModel from '../../../components/generic-model/generic-model';
import { CommonModule } from '@angular/common';
import { BreadcrumbModel } from '../layouts/breadcrumb/breadcrumb';
import { IncomingDocumentService } from '../../services/incomingdocument';
import { Department, DepartmentModel } from '../../services/department';
import { ExternalInstitutionModel, INSTITUTION_MIN_SEARCH, institutionSearch } from '../../services/external-institution';
import { Observable, Subscription, concat, startWith, map, switchMap, tap, catchError, of } from 'rxjs';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { IncomingDocumentAttachmentService } from '../../services/incoming-document-attachment';
import {
  ATTACHMENT_DESCRIPTION_MAX as ELECTRONIC_ATTACHMENT_DESCRIPTION_MAX,
  ATTACHMENT_NAME_MAX,
  IncomingDocumentAttachmentModel,
  attachmentFileError,
  formatFileSize
} from '../../models/incoming-document-attachment.model';
import { AtlasTransferService } from '../../services/atlas-transfer';
import { AtlasTransferDetail } from '../../../components/atlas-transfer-detail/atlas-transfer-detail';
import { SimpleAutocompleteComponent } from '../simpleautocomplete/simpleautocomplete';
import {
  IncomingDocumentDistributionModel,
  IncomingDocumentModel,
  IncomingDocumentRecipientInput
} from '../../models/incoming-document/incoming-document.model';
import { Common } from '../../services/common';
import { DocumentTransaction } from '../../services/documenttransaction';
import { DocumentTransactionModel } from '../../models/documenttransaction.model';
import { SecurityDegreeEnum, SecurityDegreeLabels } from '../../models/securitydegree.model';
import { UrgencyDegreeEnum, UrgencyDegreeLabels } from '../../models/urgencydegree.model';
import { actionRequiredBadgeClass, actionRequiredLabel, actionRequiredOptions } from '../../models/actionrequired.model';
import { DocumentTypeEnum, DocumentTypeLabels } from '../../models/documenttype.model';
import { DocumentAllocation } from '../../services/documentallocation';
import { RoleService } from '../../services/role-service';
import { UPLOAD_DOCUMENT_ROLES, UploadDocumentModal } from '../../../components/upload-document-modal/upload-document-modal';
import { DocumentUploadFlow } from '../../services/document-upload-flow';
import { INCOMING_STATUS_KAYIT, INCOMING_STATUS_ON_KAYIT, incomingErrorMessage } from '../../services/incomingdocument';
import { PublishStatusEnum, PublishStatusLabels, publishStatusOf } from '../../models/publishstatus.model';

// Varsayılanlar: Hizmete Özel, Normal ivedilik, yeni alıcı Gereği, elektronik kopya yok, Türkçe (1)
const DETAIL_DEFAULTS = {
  securityDegree: SecurityDegreeEnum.ServiceUseOnly,
  urgencyDegree: UrgencyDegreeEnum.Normal,
  actionRequired: true,
  electronicCopy: false,
  languageId: 1,
} as const;

// Ek açıklaması için sunucunun kabul ettiği en fazla karakter
const ATTACHMENT_DESCRIPTION_MAX = 1000;

// "Nereye" listesinin tek satırı: bir iç birim ve alıcı bazında Gereği/Bilgi.
// Formda not girilmez; sunucuda kayıtlı bir not varsa Update listeyi değiştirirken
// silinmesin diye görünmeden aynen geri gönderilir.
interface RecipientRow {
  key: number;
  control: FormControl<DepartmentModel | null>;
  actionRequired: boolean;
  notes: string | null;
  sub?: Subscription;
}

// Backend doğrulama mesajlarıyla aynı metinler
const RECIPIENT_ERRORS = {
  missing: 'Her alıcı için birim seçilmelidir!',
  duplicate: 'Aynı birim birden fazla kez alıcı olarak eklenemez!',
} as const;


// Yükleme kuyruğundaki dosya: sırayla tek tek yüklenir; hata alan dosya listede kalır (tekrar dene / kaldır)
interface AttachmentUpload {
  key: number;
  file: File;
  status: 'pending' | 'uploading' | 'failed';
  error: string | null;
}

@Component({
  standalone: true,
  imports: [
    GenericModel,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SimpleAutocompleteComponent,
    UploadDocumentModal,
    DragDropModule,
    AtlasTransferDetail
  ],
  templateUrl: './evrakkayit.html',
  // Görsel dil Ön Kayıt / Zimmet ekranlarıyla aynı; ortak zm-* sınıfları
  // gidenevrak/zimmet.css'ten, ok-input gibi form parçaları onkayit.css'ten,
  // bu ekrana özgü ek-* sınıfları evrakkayit.css'ten gelir.
  styleUrls: ['../gidenevrak/zimmet/zimmet.css', '../onkayit/onkayit.css', './evrakkayit.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Evrakkayit implements OnInit {
  publish = signal(false);

  // Başlık kutusu ve alt özette gösterilen evrak sayısı (qrCode)
  readonly documentNo = signal<string>('');

  // Sol karttaki sekmeler (Bootstrap tab JS yerine sinyal ile yönetilir)
  readonly activeTab = signal<'general' | 'detail' | 'attachments' | 'transaction' | 'transfer'>('general');

  setTab(tab: 'general' | 'detail' | 'attachments' | 'transaction' | 'transfer') {
    this.activeTab.set(tab);
    if (tab === 'transaction') this.loadTransactions();
  }

  // Atlas'a yayın durumu (submissionStatus); evrakın akış durumundan (docStatus) ayrıdır.
  readonly publishState = signal<PublishStatusEnum>(PublishStatusEnum.Yayinlanmadi);

  // Başlıktaki durum rozeti: yayın durumu öncelikli, aksi halde kayıt durumu
  readonly statusBadge = computed(() => {
    switch (this.publishState()) {
      case PublishStatusEnum.Yayinlandi: return { text: 'Yayınlandı', tone: 'success', icon: 'verified' };
      case PublishStatusEnum.AktarimSirasinda: return { text: 'Aktarım Sırasında', tone: 'warning', icon: 'hourglass_top' };
      case PublishStatusEnum.Aktariliyor: return { text: 'Aktarılıyor', tone: 'warning', icon: 'sync' };
      case PublishStatusEnum.AktarimHatali: return { text: 'Aktarım Hatalı', tone: 'danger', icon: 'error' };
      default: return { text: 'Kayıt', tone: 'info', icon: 'edit_document' };
    }
  });

  // Önizleme başlığındaki yayın rozeti yalnızca yayına gönderilmiş evrakta görünür
  readonly showPublishPill = computed(() => this.publishState() !== PublishStatusEnum.Yayinlanmadi);

  // Yayına gönderilen evrakın durumu okunur; Aktarım Sırasında / Aktarılıyor iken ya da
  // yayınlandıysa Kaydet ve Yayınla butonları pasiftir (aynı evrak tekrar sıraya alınmaz).
  // Aktarım hatalıysa servis yeniden denemez; butonlar açık kalır, kullanıcı eksiği düzeltip
  // Yayınla derse evrak güncel bilgilerle yeniden sıraya girer.
  private applyPublishState(doc: IncomingDocumentModel) {
    const state = publishStatusOf(doc);
    this.publishState.set(state);
    this.loadPublishError(state === PublishStatusEnum.AktarimHatali ? doc.id : null);
    this.activeStatus.set(
      state === PublishStatusEnum.AktarimSirasinda
      || state === PublishStatusEnum.Aktariliyor
      || state === PublishStatusEnum.Yayinlandi
    );
  }

  // Aktarım Hatalı evrakın nedeni: evrak modelinde yok, yalnızca GetFailed listesinden okunur
  readonly publishError = signal<string | null>(null);
  private atlasTransferService = inject(AtlasTransferService);

  private loadPublishError(documentId: string | null | undefined) {
    this.publishError.set(null);
    if (!documentId) return;
    this.atlasTransferService.getFailed().pipe(catchError(() => of([]))).subscribe(list => {
      const failure = list.find(f => f.documentId === documentId);
      if (failure && this.publishState() === PublishStatusEnum.AktarimHatali) {
        this.publishError.set(failure.lastError || 'Atlas aktarımı hatalı; neden bildirilmedi.');
      }
    });
  }

  private fb = inject(FormBuilder);
  private router = inject(Router);
  private incomingDocumentService = inject(IncomingDocumentService);
  private departmentService = inject(Department);
  private toast = inject(FlexiToastService);
  private sanitizer = inject(DomSanitizer);
  private allocationService = inject(DocumentAllocation);
  readonly #destroyRef = inject(DestroyRef);
  // Evrağın sunucudan yüklendiği andaki durumu; ilk kayıtta (Ön Kayıt -> Kayıt)
  // zimmetin kayıt yapan personele devredilmesi buna göre tetiklenir.
  private loadedStatus = signal<number | null>(null);
  public docStatus = signal<number>(2);
  activeStatus = signal(false);
  readonly #common = inject(Common);
  readonly user = computed(() => this.#common.user());

  form!: FormGroup;
  formDetail!: FormGroup;

  readonly departments = signal<DepartmentModel[]>([]);
  readonly departmentsLoading = signal(true);
  // Nereden: ~160.000 kurum olduğu için liste indirilmez, yazılan metin sunucuda aranır (misyonlar dahil)
  readonly institutionSearch = institutionSearch();
  readonly institutionMinSearch = INSTITUTION_MIN_SEARCH;


  // ---- Nereye: birden fazla iç birim (alıcı bazında Gereği/Bilgi ve not) ----
  // Alıcılar evrakla birlikte Create / Update'e "recipients" olarak gider; Update'te liste
  // mevcut alıcıların yerine geçtiği için formdaki listenin tamamı gönderilir.
  readonly recipientRows = signal<RecipientRow[]>([]);
  readonly recipientsLoading = signal(false);
  // Mevcut alıcılar okunamadıysa liste düzenlenemez ve Update'e recipients gönderilmez;
  // aksi halde eksik liste sunucudaki alıcıların yerine geçerdi.
  readonly recipientsLoadFailed = signal(false);
  readonly actionRequiredLabel = actionRequiredLabel;
  readonly actionRequiredBadgeClass = actionRequiredBadgeClass;
  private nextRecipientKey = 1;
  // Satır nesneleri her değişiklikte yenilenir; DOM (ve birim kutusu) korunsun diye key ile izlenir
  readonly trackRecipient = (_: number, row: RecipientRow) => row.key;
  // Sunucudaki son alıcı listesi; detay kaydında evrağın Gereği/Bilgi değeri bundan hesaplanır
  private savedRecipients: IncomingDocumentRecipientInput[] = [];

  // Atlas kilidi: Aktarım Sırasında (2), Aktarılıyor (3) ve Yayınlandı (4). EYP paketi ilk denemede
  // üretilip sonraki denemelerde aynen gönderildiğinden bu durumlarda yapılan değişiklik Atlas'a
  // gitmeyebilir. Aktarım Hatalı (5) evrak düzenlenebilir; yeniden yayınlanınca paket yenilenir.
  readonly atlasLocked = computed(() =>
    this.publishState() === PublishStatusEnum.AktarimSirasinda
    || this.publishState() === PublishStatusEnum.Aktariliyor
    || this.publishState() === PublishStatusEnum.Yayinlandi);

  // Atlas kilidindeki evrakta "Nereye" listesi salt okunur gösterilir
  readonly recipientsReadOnly = this.atlasLocked;

  // Aynı birimin seçildiği satırlar (ilk satır hariç) uyarı rengiyle işaretlenir
  readonly duplicateRecipientKeys = computed(() => {
    const seen = new Set<string>();
    const dup = new Set<number>();
    for (const row of this.recipientRows()) {
      const id = idKey(row.control.value?.id);
      if (!id) continue;
      if (seen.has(id)) dup.add(row.key); else seen.add(id);
    }
    return dup;
  });

  // Her satırın seçenekleri: başka satırda seçilmiş birimler listede görünmez
  readonly recipientOptions = computed(() => {
    const rows = this.recipientRows();
    const all = this.departments();
    const options = new Map<number, DepartmentModel[]>();
    for (const row of rows) {
      const taken = new Set(rows.filter(r => r.key !== row.key)
        .map(r => idKey(r.control.value?.id)).filter(Boolean));
      options.set(row.key, taken.size ? all.filter(d => !taken.has(idKey(d.id))) : all);
    }
    return options;
  });

  get externalInstitutionControl(): FormControl<ExternalInstitutionModel | null> {
    return this.form.get('externalInstitutionId') as FormControl<ExternalInstitutionModel | null>;
  }

  // Üst kutudaki gizlilik derecesi seçimi form etiketinin dışında durduğu için
  // formControlName yerine doğrudan bağlanır; değer yine ana formla kaydedilir.
  get securityDegreeControl(): FormControl<SecurityDegreeEnum | null> {
    return this.form.get('securityDegree') as FormControl<SecurityDegreeEnum | null>;
  }

  private pdfFileName = signal<string>('');

  // PDF URL signal, sadece değer döndürüyor
  readonly pdfUrl = computed<SafeResourceUrl | null>(() => {
    const fileName = this.pdfFileName();
    if (!fileName) return null;

    const url = this.incomingDocumentService.getPdfUrl(fileName) + '#zoom=80';
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  // "Yeni sekmede aç" bağlantısı için ham PDF adresi
  readonly pdfRawUrl = computed<string | null>(() => {
    const fileName = this.pdfFileName();
    return fileName ? this.incomingDocumentService.getPdfUrl(fileName) : null;
  });

  // PDF yükleme hazır flag sinyali
  readonly isPdfReady = signal(false);

  // Evrakta taranmış/yüklenmiş dosya var mı; yoksa sağ panelde "Belge yüklenmedi"
  // durumu ve (yetkili roller için) yükleme seçeneği gösterilir.
  readonly hasDocument = signal(false);

  // Üst kutudaki gizlilik derecesi seçimi (zoneless: şablon bu sinyalden okur).
  // Belge yüklü değilken Gizli / Çok Gizli seçiliyse önizleme alanında mühür gösterilir.
  readonly selectedSecurityDegree = signal<SecurityDegreeEnum>(DETAIL_DEFAULTS.securityDegree);

  private static readonly stampLabels: Partial<Record<SecurityDegreeEnum, string>> = {
    [SecurityDegreeEnum.Confidential]: 'GİZLİ',
    [SecurityDegreeEnum.TopSecret]: 'ÇOK GİZLİ',
    [SecurityDegreeEnum.Crypto]: 'KRİPTO'
  };

  readonly securityStamp = computed(() => Evrakkayit.stampLabels[this.selectedSecurityDegree()] ?? null);
  readonly showSecurityStamp = computed(() => !this.hasDocument() && !!this.securityStamp());

  // ---- Belge Yükle (Evrak Kayıt içinden) ----
  // Akış Ön Kayıtlar / QR Okut ile aynı: yükle -> evrak Kayıt Tamamlandı ->
  // zimmet yükleyene Devir (DocumentUploadFlow). Sonuç ekrana yansıtılır.
  private readonly roleService = inject(RoleService);
  private readonly uploadFlow = inject(DocumentUploadFlow);
  readonly canUploadDocument = computed(() => this.roleService.hasAny(UPLOAD_DOCUMENT_ROLES));
  // Sunucudan yüklenen evrak; yükleme penceresine verilir
  private readonly loadedDoc = signal<IncomingDocumentModel | null>(null);
  readonly uploadDoc = signal<IncomingDocumentModel | null>(null);
  readonly uploadLoading = signal(false);

  // ---- Aktarım sekmesi ----
  // Paketler evrakın içeriğini taşıdığı için yalnızca yönetici görür. Yayınlanmamış evrakta paket
  // olmaz ama sekme açıktır: test paketi yayından önce içeriği incelemek için üretilir
  readonly loadedDocId = computed(() => this.loadedDoc()?.id ?? null);
  readonly canSeeTransfer = computed(() =>
    !!this.loadedDocId() && this.roleService.hasAny(['Yönetici']));

  // Aktarım sekmesinden Yeniden Dene: evrak güncel bilgileriyle yeniden sıraya girdi
  onTransferRetried(): void {
    this.publishState.set(PublishStatusEnum.AktarimSirasinda);
    this.publishError.set(null);
    this.activeStatus.set(true);
  }

  openUpload(): void {
    const doc = this.loadedDoc();
    if (!doc?.id || this.hasDocument() || !this.canUploadDocument()) return;
    this.uploadDoc.set(doc);
  }

  closeUpload(): void {
    if (this.uploadLoading()) return;
    this.uploadDoc.set(null);
  }

  confirmUpload(file: File): void {
    const doc = this.uploadDoc();
    const userId = this.user()?.id;
    if (!doc?.id || this.uploadLoading()) return;
    if (!userId) {
      this.toast.showToast('Hata', 'Kullanıcı bilgisi alınamadı', 'error');
      return;
    }

    this.uploadLoading.set(true);
    this.uploadFlow.run(doc.id, file, userId).subscribe({
      next: (result) => {
        this.uploadLoading.set(false);
        this.uploadDoc.set(null);

        if (result.transferFailed) {
          this.toast.showToast(
            'Zimmet devri yapılamadı',
            'Belge yüklendi ve evrak kaydı oluşturuldu ancak zimmet devredilemedi. Zimmet ekranından devir yapabilirsiniz.',
            'warning'
          );
        } else {
          this.toast.showToast('Başarılı', 'Belge yüklendi, evrak kaydı oluşturuldu ve zimmet üzerinize geçti.', 'success');
        }

        // Ekran güncel evrağa göre tazelenir: dosya önizlemesi açılır, durum Kayıt
        // Tamamlandı olur ve sonraki "Kaydet" ilk kayıt devrini yeniden tetiklemez.
        this.applyUploadedDocument(result.document);
      },
      error: () => {
        this.uploadLoading.set(false);
        this.toast.showToast('Hata', 'Belge yüklenemedi ya da evrak kaydı güncellenemedi.', 'error');
      }
    });
  }

  private applyDocumentFile(doc: IncomingDocumentModel) {
    this.hasDocument.set(!!doc.documentName);
    if (doc.documentName) this.setPdf(doc.documentName);
  }

  // Yükleme sonrası evrak ekrana yansıtılır ve önizleme açılır. Dosya adı sunucuda
  // asenkron yazılıyorsa (GetById henüz boş dönerse) kısa aralıklarla birkaç kez
  // yeniden sorgulanır.
  private applyUploadedDocument(doc: IncomingDocumentModel, attempt = 0) {
    this.loadedDoc.set(doc);
    this.loadedStatus.set(doc.status);
    this.docStatus.set(doc.status);
    this.applyPublishState(doc);
    this.form.patchValue({ documentName: doc.documentName ?? '' });
    this.formDetail.patchValue({ status: doc.status });
    this.applyDocumentFile(doc);

    if (doc.documentName || !doc.id || attempt >= 3) return;

    const documentId = doc.id;
    setTimeout(() => {
      this.incomingDocumentService.getIncomingDocumentByDocumentId(documentId).subscribe(fresh => {
        if (fresh) this.applyUploadedDocument(fresh, attempt + 1);
      });
    }, 1000);
  }

  readonly breadcrumbs = signal<BreadcrumbModel[]>([
    { title: 'Gelen Evraklar', url: '/scanlist', icon: '' },
    { title: 'Evrak Kayıt', url: '/evrakkayit', icon: 'add' }
  ]);

  readonly title = "Gelen Evrak Kayıt";

  readonly securityDegreeOptions = Object.entries(SecurityDegreeLabels).map(([value, label]) => ({
    value: Number(value) as SecurityDegreeEnum,
    label
  }));

  // İvedilik derecesi: Giden Evrak oluşturma ekranındaki combo ile aynı değerler (UrgencyDegreeLabels)
  readonly urgencyDegreeOptions = Object.entries(UrgencyDegreeLabels).map(([value, label]) => ({
    value: Number(value) as UrgencyDegreeEnum,
    label
  }));

  readonly actionRequiredOptions = actionRequiredOptions;

  // Gelen evrak kaydında seçilemeyen türler (enum'da kalır, listede görünmez)
  private static readonly hiddenDocumentTypes: ReadonlySet<DocumentTypeEnum> = new Set([
    DocumentTypeEnum.Nota,
  ]);

  // Evrak türü seçenekleri ortak enum'dan (giden evrak ve zarf etiketi ekranlarıyla aynı liste)
  readonly documentTypeOptions = Object.entries(DocumentTypeLabels)
    .map(([value, label]) => ({ value: Number(value) as DocumentTypeEnum, label }))
    .filter(opt => !Evrakkayit.hiddenDocumentTypes.has(opt.value));

  // "Diğer Bilgiler" sekmesindeki ek bilgisi: Var / Yok / belirtilmemiş (null)
  readonly hasAttachment = signal<boolean | null>(null);
  readonly attachmentDescriptionLength = signal(0);
  readonly attachmentDescriptionMax = ATTACHMENT_DESCRIPTION_MAX;

  private documentTransactionService = inject(DocumentTransaction);
  transactionData = signal<DocumentTransactionModel[]>([]);
  transactionLoading = signal(false);


  ngOnInit(): void {
    this.form = this.fb.group({
      id: ['', Validators.required],
      qrCode: [''],
      orginalNo: [''],
      subject: [''],
      nereden: [''],
      nereye: [''],
      documentDate: [''],
      notes: [''],
      documentName: [''],
      externalInstitutionId: new FormControl<ExternalInstitutionModel | null>(null),
      documentTypeId: [null as DocumentTypeEnum | null],
      // Gizlilik ve ivedilik derecesi "Evrak Kayıt" sekmesinde girilir. Gereği/Bilgi evrak
      // düzeyinde değil, "Nereye" listesinde alıcı bazında seçilir (bkz. recipientRows).
      securityDegree: [DETAIL_DEFAULTS.securityDegree],
      urgencyDegree: [DETAIL_DEFAULTS.urgencyDegree],
    });

    this.#destroyRef.onDestroy(() => {
      for (const row of this.recipientRows()) row.sub?.unsubscribe();
      this.closeAttachmentPreview();
    });

    this.formDetail = this.fb.group({
      id: ['', Validators.required],
      status: [''],
      electronicCopy: [DETAIL_DEFAULTS.electronicCopy],
      languageId: [DETAIL_DEFAULTS.languageId],
      pageCount: [''],
      hasAttachment: [null as boolean | null],
      attachmentDescription: ['', Validators.maxLength(ATTACHMENT_DESCRIPTION_MAX)],
      ocrStatus: [{ value: '', disabled: true }],
      release: [{ value: '', disabled: true }]
    });

    // Açıklama kutusu yalnızca "Var" seçiliyken görünür (zoneless: şablon sinyalden okur)
    this.formDetail.controls['hasAttachment'].valueChanges.subscribe(v => this.hasAttachment.set(v ?? null));
    this.formDetail.controls['attachmentDescription'].valueChanges.subscribe(v =>
      this.attachmentDescriptionLength.set((v ?? '').length));

    // Zoneless CD: şablondaki evrak sayısı metni ham form değeri yerine bu sinyalden okunur,
    // böylece patchValue sonrası görünüm güncellenir.
    this.form.controls['qrCode'].valueChanges.subscribe(v => this.documentNo.set(v ?? ''));
    this.form.controls['securityDegree'].valueChanges.subscribe(v =>
      this.selectedSecurityDegree.set(v ?? DETAIL_DEFAULTS.securityDegree));

    this.loadDepartments();

    const id = this.incomingDocumentService.currentIncomingDocumentId;
    if (!id) {
      this.router.navigate(['/scanlist']);
      return;
    }

    if (this.incomingDocumentService.currentIncomingDocumentUpdateType == "1") {
      this.getir(id);
    } else {
      this.incomingDocumentService.GetByQrCode(id).subscribe(doc => {
        if (!doc) return;

        this.loadedStatus.set(doc.status ?? null);
        this.loadedDoc.set(doc);
        if (doc.status) this.docStatus.set(doc.status);
        this.applyPublishState(doc);

        // Belge yüklenmemiş olsa da kayıt yapılabilir; dosya sonradan eklenebilir
        if (!doc.documentName) {
          this.toast.showToast(
            "Belge henüz taranmamış",
            "Belge dosyası olmadan kayıt yapabilir, dosyayı sonradan yükleyebilirsiniz."
          );
        }

        this.form.patchValue({
          ...doc,
          externalInstitutionId: null,
          documentDate: doc.documentDate?.split('T')[0],
          securityDegree: doc.securityDegree ?? DETAIL_DEFAULTS.securityDegree,
          urgencyDegree: doc.urgencyDegree ?? DETAIL_DEFAULTS.urgencyDegree
        });

        this.applyDocumentFile(doc);

        this.loadRecipients(doc.id);
        this.loadAttachments(doc.id);
        this.applyExternalInstitution(doc);

        this.patchDetail(doc);

      });

    }

  }

  private loadDepartments() {
    this.departmentService.getDepartments().subscribe({
      next: (res) => {
        this.departments.set(res ?? []);
        this.departmentsLoading.set(false);
        this.resolveRecipientDepartments();
      },
      error: (err) => {
        console.error(err);
        this.departmentsLoading.set(false);
        this.toast.showToast("Hata", "Birimler yüklenemedi");
      }
    });
  }

  // ---- Nereye alıcıları ----

  // Mevcut alıcılar GetDistributions'tan okunur (GetById alıcıları döndürmez)
  loadRecipients(documentId: string | null | undefined = this.loadedDoc()?.id) {
    this.setRecipientRows([]);
    this.savedRecipients = [];
    this.recipientsLoadFailed.set(false);
    if (!documentId) return;

    this.recipientsLoading.set(true);
    this.incomingDocumentService.getDistributions(documentId).subscribe({
      next: (list) => {
        const rows = (list ?? []).filter(d => !d.isDeleted && d.departmentId);
        this.savedRecipients = rows.map(d => ({
          departmentId: d.departmentId,
          actionRequired: d.actionRequired ?? null,
          notes: d.notes ?? null
        }));
        this.setRecipientRows(rows.map(d => this.createRecipientRow(
          this.departmentOf(d), d.actionRequired ?? DETAIL_DEFAULTS.actionRequired, d.notes ?? null)));
        this.recipientsLoading.set(false);
      },
      error: (err) => {
        console.error('Alıcılar yüklenemedi:', err);
        this.recipientsLoading.set(false);
        this.recipientsLoadFailed.set(true);
      }
    });
  }

  // Birim listesi henüz gelmediyse satır, yanıttaki adla geçici bir kayıtla açılır;
  // liste gelince listedeki kayda bağlanır (bkz. resolveRecipientDepartments).
  private departmentOf(d: IncomingDocumentDistributionModel): DepartmentModel {
    return this.departments().find(x => idKey(x.id) === idKey(d.departmentId))
      ?? { id: d.departmentId, name: d.departmentName || 'Bilinmeyen birim' };
  }

  private resolveRecipientDepartments() {
    for (const row of this.recipientRows()) {
      const current = row.control.value;
      if (!current) continue;
      const found = this.departments().find(x => idKey(x.id) === idKey(current.id));
      if (found && found !== current) row.control.setValue(found);
    }
  }

  private createRecipientRow(department: DepartmentModel | null, actionRequired: boolean, notes: string | null = null): RecipientRow {
    const row: RecipientRow = {
      key: this.nextRecipientKey++,
      control: new FormControl<DepartmentModel | null>(department),
      actionRequired,
      notes,
    };
    // Seçim değişince liste yeni dizi olarak yayınlanır; tekrar ve seçenek hesapları tazelenir
    row.sub = row.control.valueChanges.subscribe(() => this.recipientRows.update(rows => [...rows]));
    return row;
  }

  private setRecipientRows(rows: RecipientRow[]) {
    for (const row of this.recipientRows()) row.sub?.unsubscribe();
    this.recipientRows.set(rows);
  }

  addRecipientRow() {
    if (this.recipientsReadOnly() || this.recipientsLoading() || this.recipientsLoadFailed()) return;
    const row = this.createRecipientRow(null, DETAIL_DEFAULTS.actionRequired);
    this.recipientRows.update(rows => [...rows, row]);
  }

  removeRecipientRow(row: RecipientRow) {
    if (this.recipientsReadOnly()) return;
    row.sub?.unsubscribe();
    this.recipientRows.update(rows => rows.filter(r => r.key !== row.key));
  }

  setRecipientAction(row: RecipientRow, actionRequired: boolean) {
    this.recipientRows.update(rows => rows.map(r => r.key === row.key ? { ...r, actionRequired } : r));
  }

  // Formdaki kurallar backend'le aynı: her satırda birim seçili, aynı birim iki kez yok
  private recipientValidationError(): string | null {
    const rows = this.recipientRows();
    if (rows.some(r => !r.control.value?.id)) return RECIPIENT_ERRORS.missing;
    if (this.duplicateRecipientKeys().size) return RECIPIENT_ERRORS.duplicate;
    return null;
  }

  // Update'e gidecek alıcı listesi; liste okunamadıysa ya da salt okunursa undefined
  // (alan gönderilmez, sunucudaki alıcılara dokunulmaz).
  private recipientsPayload(): IncomingDocumentRecipientInput[] | undefined {
    if (this.recipientsReadOnly() || this.recipientsLoading() || this.recipientsLoadFailed()) return undefined;
    return this.recipientRows().map(r => ({
      departmentId: r.control.value!.id,
      actionRequired: r.actionRequired,
      notes: r.notes
    }));
  }

  // Evrak düzeyindeki Gereği/Bilgi backend'de alıcılardan hesaplanır: biri Gereği ise
  // Gereği, hepsi Bilgi ise Bilgi. Alıcısız evrakta yüklenen değer korunur.
  private actionRequiredOf(recipients: IncomingDocumentRecipientInput[]): boolean | null {
    if (!recipients.length) return this.loadedDoc()?.actionRequired ?? null;
    return recipients.some(r => r.actionRequired !== false);
  }

  // ---- Elektronik ekler (PDF) ----
  // Ekler evrakla aynı istekte gitmez: kayıtlı evraka dosya başına ayrı Upload atılır ve
  // Atlas'a giden EYP paketine orderNo sırasıyla eklenir. Fiziki ek bilgisi (Ek Var mı? /
  // ek açıklaması) "Diğer Bilgiler" sekmesinde kalır.
  private readonly attachmentService = inject(IncomingDocumentAttachmentService);
  readonly attachments = signal<IncomingDocumentAttachmentModel[]>([]);
  readonly attachmentsLoading = signal(false);
  readonly attachmentsLoadFailed = signal(false);
  readonly uploadQueue = signal<AttachmentUpload[]>([]);
  readonly reorderingAttachments = signal(false);
  readonly attachmentActionId = signal<string | null>(null);
  readonly editingAttachmentId = signal<string | null>(null);
  readonly editAttachmentName = signal('');
  readonly editAttachmentDescription = signal('');
  readonly attachmentDropActive = signal(false);
  readonly attachmentNameMax = ATTACHMENT_NAME_MAX;
  readonly attachmentDescriptionMaxLen = ELECTRONIC_ATTACHMENT_DESCRIPTION_MAX;
  readonly fileSize = formatFileSize;
  private nextUploadKey = 1;
  readonly trackAttachment = (_: number, a: IncomingDocumentAttachmentModel) => a.id;

  // Atlas kilidindeyken (ve yayın isteği sürerken) ekler yalnızca görüntülenir
  readonly attachmentsReadOnly = computed(() => this.atlasLocked() || this.activeStatus());

  // Yükleme / sıralama / silme sürerken Kaydet ve Yayınla beklenir: yayın, eklerden önce
  // kuyruğa girerse ekler Atlas'a gitmeyebilir.
  readonly attachmentsBusy = computed(() =>
    this.uploadQueue().some(u => u.status !== 'failed')
    || this.reorderingAttachments()
    || this.attachmentActionId() !== null);

  readonly failedUploads = computed(() => this.uploadQueue().filter(u => u.status === 'failed'));

  loadAttachments(documentId: string | null | undefined = this.loadedDoc()?.id) {
    this.attachments.set([]);
    this.attachmentsLoadFailed.set(false);
    this.closeAttachmentPreview();
    if (!documentId) return;

    this.attachmentsLoading.set(true);
    this.attachmentService.getByDocument(documentId, false).subscribe({
      next: (list) => {
        this.attachments.set(list ?? []);
        this.attachmentsLoading.set(false);
      },
      error: (err) => {
        console.error('Ekler yüklenemedi:', err);
        this.attachmentsLoading.set(false);
        this.attachmentsLoadFailed.set(true);
      }
    });
  }

  onAttachmentFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.queueAttachmentFiles(Array.from(input.files ?? []));
    input.value = '';
  }

  onAttachmentDragOver(event: DragEvent) {
    if (this.attachmentsReadOnly() || !event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    this.attachmentDropActive.set(true);
  }

  onAttachmentDrop(event: DragEvent) {
    this.attachmentDropActive.set(false);
    if (this.attachmentsReadOnly() || !event.dataTransfer?.files.length) return;
    event.preventDefault();
    this.queueAttachmentFiles(Array.from(event.dataTransfer.files));
  }

  // Dosyalar seçim sırasıyla, tek tek yüklenir (ek sırası seçim sırasını izler). PDF ve 10 MB
  // kontrolü tarayıcıda yapılır: 11 MB'ı aşan istek sunucuda dosya okunmadan reddedilir ve
  // Türkçe hata mesajı dönmez.
  private queueAttachmentFiles(files: File[]) {
    if (!files.length || this.attachmentsReadOnly()) return;
    if (!this.loadedDoc()?.id) {
      this.toast.showToast('Ek yüklenemez', 'Ekler evrak kaydedildikten sonra yüklenebilir.', 'warning');
      return;
    }
    const items: AttachmentUpload[] = files.map(file => {
      const error = attachmentFileError(file);
      return { key: this.nextUploadKey++, file, status: error ? 'failed' : 'pending', error };
    });
    this.uploadQueue.update(q => [...q, ...items]);
    this.processUploadQueue();
  }

  private processUploadQueue() {
    const queue = this.uploadQueue();
    if (queue.some(u => u.status === 'uploading')) return;
    const next = queue.find(u => u.status === 'pending');
    const documentId = this.loadedDoc()?.id;
    const userId = this.user()?.id;
    if (!next || !documentId) return;
    if (!userId) {
      this.toast.showToast('Hata', 'Kullanıcı bilgisi alınamadı', 'error');
      return;
    }

    this.setUploadStatus(next.key, 'uploading');
    this.attachmentService.upload(documentId, next.file, userId).subscribe({
      next: (attachment) => {
        this.uploadQueue.update(q => q.filter(u => u.key !== next.key));
        if (attachment) this.attachments.update(list => [...list, attachment]);
        this.markHasAttachment();
        this.processUploadQueue();
      },
      error: (err) => {
        console.error('Ek yüklenemedi:', err);
        this.setUploadStatus(next.key, 'failed', incomingErrorMessage(err, 'Ek yüklenemedi.'));
        this.processUploadQueue();
      }
    });
  }

  private setUploadStatus(key: number, status: AttachmentUpload['status'], error: string | null = null) {
    this.uploadQueue.update(q => q.map(u => u.key === key ? { ...u, status, error } : u));
  }

  retryUpload(item: AttachmentUpload) {
    if (attachmentFileError(item.file) || this.attachmentsReadOnly()) return;
    this.setUploadStatus(item.key, 'pending');
    this.processUploadQueue();
  }

  dismissUpload(item: AttachmentUpload) {
    this.uploadQueue.update(q => q.filter(u => u.key !== item.key));
  }

  canRetryUpload(item: AttachmentUpload): boolean {
    return !attachmentFileError(item.file);
  }

  // Backend yükleme sonrası hasAttachment'ı true yapar; form da işaretlenir, aksi halde
  // "Diğer Bilgiler" kaydında hasAttachment: false gidip evrak "ek yok" görünür.
  private markHasAttachment() {
    if (this.formDetail.controls['hasAttachment'].value !== true) {
      this.formDetail.patchValue({ hasAttachment: true });
    }
    const doc = this.loadedDoc();
    if (doc && doc.hasAttachment !== true) this.loadedDoc.set({ ...doc, hasAttachment: true });
  }

  // Sürükle-bırak sıralama: liste hemen yeni sırasıyla gösterilir, yeri değişen her ek için
  // yeni sıra numarasıyla ayrı Update atılır (backend sıraları kendisi kaydırmaz).
  dropAttachment(event: CdkDragDrop<IncomingDocumentAttachmentModel[]>) {
    if (this.attachmentsReadOnly() || this.reorderingAttachments() || event.previousIndex === event.currentIndex) return;
    const list = [...this.attachments()];
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    const changed = list
      .map((a, i) => ({ a, orderNo: i + 1 }))
      .filter(x => x.a.orderNo !== x.orderNo);
    this.attachments.set(list.map((a, i) => ({ ...a, orderNo: i + 1 })));
    if (!changed.length) return;

    this.reorderingAttachments.set(true);
    concat(...changed.map(x => this.attachmentService.update({ id: x.a.id, orderNo: x.orderNo }))).subscribe({
      error: (err) => {
        console.error('Ek sırası kaydedilemedi:', err);
        this.reorderingAttachments.set(false);
        this.toast.showToast('Sıra kaydedilemedi', incomingErrorMessage(err, 'Ek sırası güncellenemedi.'), 'error');
        this.loadAttachments();
      },
      complete: () => this.reorderingAttachments.set(false)
    });
  }

  startEditAttachment(a: IncomingDocumentAttachmentModel) {
    if (this.attachmentsReadOnly()) return;
    this.editingAttachmentId.set(a.id);
    this.editAttachmentName.set(a.name ?? '');
    this.editAttachmentDescription.set(a.description ?? '');
  }

  cancelEditAttachment() {
    this.editingAttachmentId.set(null);
  }

  saveEditAttachment(a: IncomingDocumentAttachmentModel) {
    const name = this.editAttachmentName().trim();
    const description = this.editAttachmentDescription().trim();
    if (!name) {
      this.toast.showToast('Ek adı', 'Ek adı boş olamaz!', 'warning');
      return;
    }
    if (name.length > ATTACHMENT_NAME_MAX) {
      this.toast.showToast('Ek adı', `Ek adı en fazla ${ATTACHMENT_NAME_MAX} karakter olabilir`, 'warning');
      return;
    }
    if (description.length > ELECTRONIC_ATTACHMENT_DESCRIPTION_MAX) {
      this.toast.showToast('Ek açıklaması', `Ek açıklaması en fazla ${ELECTRONIC_ATTACHMENT_DESCRIPTION_MAX} karakter olabilir`, 'warning');
      return;
    }
    if (name === a.name && description === (a.description ?? '')) {
      this.editingAttachmentId.set(null);
      return;
    }

    this.attachmentActionId.set(a.id);
    // description: "" açıklamayı temizler
    this.attachmentService.update({ id: a.id, name, description }).subscribe({
      next: (updated) => {
        this.attachments.update(list => list.map(x => x.id === a.id ? { ...x, ...(updated ?? { name, description }) } : x));
        this.attachmentActionId.set(null);
        this.editingAttachmentId.set(null);
      },
      error: (err) => {
        this.attachmentActionId.set(null);
        this.toast.showToast('Ek güncellenemedi', incomingErrorMessage(err, 'Ek bilgileri kaydedilemedi.'), 'error');
      }
    });
  }

  removeAttachment(a: IncomingDocumentAttachmentModel) {
    if (this.attachmentsReadOnly()) return;
    const userId = this.user()?.id;
    if (!userId) {
      this.toast.showToast('Hata', 'Kullanıcı bilgisi alınamadı', 'error');
      return;
    }
    this.toast.showSwal('Eki Sil', `"${a.name}" eki silinsin mi? Ek, Atlas'a gidecek pakete de eklenmez.`, 'Sil', () => {
      this.attachmentActionId.set(a.id);
      this.attachmentService.remove(a.id, userId).subscribe({
        next: () => {
          this.attachmentActionId.set(null);
          this.attachments.update(list => list.filter(x => x.id !== a.id));
          if (this.previewAttachment()?.id === a.id) this.closeAttachmentPreview();
          // Son elektronik ek silinince backend "Ek var" bilgisini değiştirmez
          if (!this.attachments().length && this.formDetail.controls['hasAttachment'].value === true) {
            this.toast.showToast('Ek silindi',
              "Evrakta başka (fiziki) ek yoksa Diğer Bilgiler sekmesinde \"Ek Var mı?\" alanını güncelleyin.", 'info');
          } else {
            this.toast.showToast('Ek silindi', `"${a.name}" kaldırıldı.`, 'success');
          }
        },
        error: (err) => {
          this.attachmentActionId.set(null);
          this.toast.showToast('Ek silinemedi', incomingErrorMessage(err, 'Ek kaldırılamadı.'), 'error');
        }
      });
    });
  }

  // ---- Ek önizleme: sağ panelde ana belgenin yerine gösterilir ----
  // Dosya blob olarak alınır (Download ileride token isteyecek; doğrudan adres verilmez).
  readonly previewAttachment = signal<IncomingDocumentAttachmentModel | null>(null);
  readonly previewLoading = signal(false);
  private readonly previewBlobUrl = signal<string | null>(null);
  readonly previewUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.previewBlobUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url + '#zoom=80') : null;
  });
  private previewSub?: Subscription;

  // Başlıkta ekin güncel adı ve sırası (yeniden adlandırma / sıralama sonrası da doğru kalır)
  readonly previewInfo = computed(() => {
    const p = this.previewAttachment();
    if (!p) return null;
    const i = this.attachments().findIndex(x => x.id === p.id);
    return { a: i >= 0 ? this.attachments()[i] : p, no: i >= 0 ? i + 1 : '' };
  });

  showAttachment(a: IncomingDocumentAttachmentModel) {
    if (this.previewAttachment()?.id === a.id) return;
    this.closeAttachmentPreview();
    this.previewAttachment.set(a);
    this.previewLoading.set(true);
    this.previewSub = this.attachmentService.download(a.id).subscribe({
      next: (blob) => {
        this.previewBlobUrl.set(URL.createObjectURL(blob));
        this.previewLoading.set(false);
      },
      error: (err) => {
        console.error('Ek açılamadı:', err);
        this.closeAttachmentPreview();
        this.toast.showToast('Ek açılamadı', 'Ek dosyası bulunamadı.', 'error');
      }
    });
  }

  closeAttachmentPreview() {
    this.previewSub?.unsubscribe();
    const url = this.previewBlobUrl();
    if (url) URL.revokeObjectURL(url);
    this.previewBlobUrl.set(null);
    this.previewAttachment.set(null);
    this.previewLoading.set(false);
  }

  openAttachmentInNewTab(a: IncomingDocumentAttachmentModel) {
    this.attachmentService.openInNewTab(a).subscribe({
      error: () => this.toast.showToast('Ek açılamadı', 'Ek dosyası bulunamadı.', 'error')
    });
  }

  downloadAttachment(a: IncomingDocumentAttachmentModel) {
    this.attachmentService.saveToDisk(a).subscribe({
      error: () => this.toast.showToast('Ek indirilemedi', 'Ek dosyası bulunamadı.', 'error')
    });
  }


  displayInstitution(inst: ExternalInstitutionModel): string {
    return inst?.name ?? '';
  }

  setPdf(fileName: string) {
    if (!fileName) {
      this.isPdfReady.set(false);
      this.pdfFileName.set('');
      return;
    }

    this.pdfFileName.set(fileName);

    // URL hazır olduktan sonra iframe’in yüklenmesini beklemek için küçük delay
    setTimeout(() => {
      this.isPdfReady.set(true);
    }, 0);
  }

  saveDetail() {
    if (this.formDetail.controls['attachmentDescription'].hasError('maxlength')) {
      this.toast.showToast("Ek açıklaması çok uzun", `Ek açıklaması en fazla ${ATTACHMENT_DESCRIPTION_MAX} karakter olabilir.`, "warning");
      return;
    }
    if (!this.formDetail.valid) {
      this.toast.showToast("Eksik bilgi var", "Lütfen gerekli alanları doldurun");
      return;
    }

    const userId = this.user()?.id;
    if (!userId) {
      this.toast.showToast("Hata", "Kullanıcı bilgisi alınamadı", "error");
      return;
    }
    const raw = this.formDetail.value;

    // Ek açıklaması yalnızca "Var" seçiliyken gönderilir. "Yok" seçilince sunucu açıklamayı
    // kendisi siler; belirtilmemişse (null) alan gönderilmez ve mevcut değer korunur.
    const hasAttachment: boolean | null = raw.hasAttachment ?? null;
    const attachmentDescription = hasAttachment === true
      ? (raw.attachmentDescription ?? '').trim()
      : hasAttachment === false ? '' : null;

    const formData: IncomingDocumentModel = {
      ...raw,
      hasAttachment,
      attachmentDescription,
      // Evrak Kayıt sekmesine taşınan alanlar detay güncellemesinde de gönderilir;
      // aksi halde Update bu alanları boşaltabilir.
      securityDegree: this.form.value.securityDegree,
      urgencyDegree: this.form.value.urgencyDegree,
      // Alıcılar (recipients) ve departmentId gönderilmez: sunucudaki "Nereye" listesine
      // dokunulmaz. Gereği/Bilgi, kayıtlı alıcılardan hesaplanan değerle korunur.
      actionRequired: this.actionRequiredOf(this.savedRecipients),
      userId: userId
    };

    const saveObs = this.incomingDocumentService.updateIncomingDocument(formData);

    saveObs.subscribe({
      next: () => {
        const msg = formData.id ? "Belge detay bilgileri başarıyla güncellendi." : "Güncellendi";
        this.toast.showToast("Başarılı", msg);
      },
      error: (err) => {
        console.error(err);
        this.toast.showToast("Kayıt Başarısız", "Belge kaydedilirken bir hata oluştu.");
      }
    });
  }

  save() {
    if (!this.form.valid) {
      this.toast.showToast("Eksik bilgi var", "Lütfen gerekli alanları doldurun");
      return;
    }

    const raw = this.form.value;

    const userId = this.user()?.id;
    if (!userId) {
      this.toast.showToast("Hata", "Kullanıcı bilgisi alınamadı", "error");
      return;
    }

    // Ek yükleme / sıralama bitmeden kaydedilmez: yayın eklerden önce kuyruğa girerse ekler Atlas'a gitmeyebilir
    if (this.attachmentsBusy()) {
      this.toast.showToast("Bekleyiniz", "Ek işlemleri tamamlanınca kaydedebilirsiniz.", "warning");
      return;
    }
    if (this.recipientsLoading()) {
      this.toast.showToast("Bekleyiniz", "Nereye alıcıları yükleniyor.", "warning");
      return;
    }
    const recipients = this.recipientsPayload();
    const recipientError = recipients ? this.recipientValidationError() : null;
    if (recipientError) {
      this.toast.showToast("Nereye", recipientError, "warning");
      return;
    }

    const publishing = this.publish();
    // Yayınla sırasında butonlar hemen kilitlenir (çift tıklamada evrak iki kez sıraya girmesin)
    if (publishing) this.activeStatus.set(true);

    // departmentId gönderilmez: "Nereye" artık recipients listesidir. recipients undefined ise
    // (alıcılar okunamadı / salt okunur) alan gönderilmez ve sunucudaki alıcılara dokunulmaz.
    const formData: IncomingDocumentModel = {
      ...raw,
      externalInstitutionId: raw.externalInstitutionId?.id ?? null,
      ...(recipients ? { recipients } : { actionRequired: this.actionRequiredOf(this.savedRecipients) }),
      userId: userId,
      status: INCOMING_STATUS_KAYIT,
      // Oluşturan kullanıcı yalnızca ilk kayıtta yazılır; güncellemede değişmez.
      ...(raw.id ? {} : { createdUserId: userId }),
    };

    // İlk kayıt mı: evrak Ön Kayıt durumundan çıkıyorsa zimmet kayıt yapan personele devredilir
    const isFirstRegistration = !!formData.id && this.loadedStatus() === INCOMING_STATUS_ON_KAYIT;

    // Yayınla, Update'e status 6 gönderir: backend evrakın akış durumuna dokunmaz, yayın
    // durumunu (submissionStatus) Aktarım Sırasında yapar. Ön Kayıt'taki evrak bu yüzden
    // önce Kayıt Tamamlandı (2) olarak kaydedilir, ardından yayına gönderilir.
    // İlk kayıtta Kaydet adımı başarılı olup yayın reddedilirse evrak yine Kayıt Tamamlandı'dır
    let registered = false;
    let saveObs: Observable<unknown>;
    // Hata mesajı (ör. alıcı doğrulaması) backend'in Errors / Message alanından ekranda gösterilir
    if (!formData.id) {
      saveObs = publishing
        ? this.incomingDocumentService.createAndPublishIncomingDocument(formData)
        : this.incomingDocumentService.createIncomingDocument(formData, false);
    } else if (!publishing) {
      saveObs = this.incomingDocumentService.updateIncomingDocument(formData, false);
    } else {
      const publishRequest = this.incomingDocumentService.publishIncomingDocument(formData);
      saveObs = isFirstRegistration
        ? this.incomingDocumentService.updateIncomingDocument(formData, false).pipe(
            tap(() => registered = true),
            switchMap(() => publishRequest))
        : publishRequest;
    }

    // Yayınla akış durumunu değiştirmez; Ön Kayıt'tan çıkan evrak Kayıt Tamamlandı olur
    const nextStatus = publishing && !isFirstRegistration
      ? (this.loadedStatus() ?? INCOMING_STATUS_KAYIT)
      : INCOMING_STATUS_KAYIT;

    saveObs.subscribe({
      next: () => {

        let msg = formData.id ? "Belge başarıyla güncellendi." : "Başarılı";

        if (publishing)
          msg = formData.id ? "Belge güncellendi, Atlas'a aktarım sırasına alındı." : "Başarılı";

        this.toast.showToast("Başarılı", msg);

        if (recipients) this.markRecipientsSaved(recipients);
        this.docStatus.set(nextStatus);
        this.formDetail.patchValue({ status: nextStatus });
        if (publishing) {
          this.publishState.set(PublishStatusEnum.AktarimSirasinda);
          this.publishError.set(null);
        }

        // Aynı ekranda tekrar kaydedilirse devir yeniden tetiklenmez
        this.loadedStatus.set(nextStatus);

        if (isFirstRegistration && formData.id) {
          this.transferAllocationToMe(formData.id, userId);
        }
      },
      error: (err) => {
        console.error(err);
        if (publishing) this.activeStatus.set(false);

        if (registered && formData.id) {
          if (recipients) this.markRecipientsSaved(recipients);
          this.docStatus.set(INCOMING_STATUS_KAYIT);
          this.formDetail.patchValue({ status: INCOMING_STATUS_KAYIT });
          this.loadedStatus.set(INCOMING_STATUS_KAYIT);
          this.transferAllocationToMe(formData.id, userId);
        }

        if (publishing) {
          // Backend eksik bilgiyi açıklar (ör. "Evrak Atlas'a aktarılamaz: Konu girilmemiş.").
          // Yeni evrak bu durumda hiç kaydedilmez; form açık kalır, eksik doldurulup tekrar Yayınla denir.
          const reason = incomingErrorMessage(err, "Evrak Atlas'a aktarım sırasına alınamadı.");
          this.toast.showToast(
            registered ? "Kaydedildi, yayınlanamadı" : "Yayınlanamadı", reason, "error");
          return;
        }
        this.toast.showToast("Kayıt Başarısız",
          incomingErrorMessage(err, "Belge kaydedilirken bir hata oluştu."), "error");
      }
    });
  }

  // Kaydedilen alıcı listesi sunucudakiyle aynıdır; evrağın Gereği/Bilgi değeri de bundan hesaplanır
  private markRecipientsSaved(recipients: IncomingDocumentRecipientInput[]) {
    this.savedRecipients = recipients;
    const doc = this.loadedDoc();
    if (doc) this.loadedDoc.set({ ...doc, actionRequired: this.actionRequiredOf(recipients) });
  }

  // İlk kayıtta zimmet devri: ön kaydı yapan personelin üzerindeki zimmet, kaydı
  // tamamlayan personele Devir (2) olarak geçer; zimmet zaten bu kullanıcıdaysa dokunulmaz.
  private transferAllocationToMe(documentId: string, userId: string) {
    this.allocationService.transferToUser(documentId, userId).subscribe({
      next: (transferred) => {
        if (transferred) this.toast.showToast("Zimmet", "Evrak zimmeti üzerinize devredildi.", "success");
      },
      error: (err) => {
        console.error(err);
        this.toast.showToast(
          "Zimmet devri yapılamadı",
          "Belge kaydedildi ancak zimmet devredilemedi. Zimmet ekranından devir yapabilirsiniz.",
          "warning"
        );
      }
    });
  }


  getir(id: string) {
    this.incomingDocumentService.getIncomingDocumentByDocumentId(id).subscribe(doc => {
      if (!doc) return;

      this.loadedStatus.set(doc.status ?? null);
      this.loadedDoc.set(doc);

      this.form.patchValue({
        ...doc,
        externalInstitutionId: null,
        documentDate: doc.documentDate?.split('T')[0],
        securityDegree: doc.securityDegree ?? DETAIL_DEFAULTS.securityDegree,
        urgencyDegree: doc.urgencyDegree ?? DETAIL_DEFAULTS.urgencyDegree
      });

      if (doc.status) this.docStatus.set(doc.status);
      this.applyPublishState(doc);

      this.applyDocumentFile(doc);

      this.loadRecipients(doc.id);
      this.loadAttachments(doc.id);
      this.applyExternalInstitution(doc);

      this.patchDetail(doc);

    });
  }

  // "Diğer Bilgiler" formunu belgeden doldurur; backend'de boş olan alanlar varsayılanla gelir.
  private patchDetail(doc: IncomingDocumentModel) {
    this.formDetail.patchValue({
      id: doc.id,
      languageId: doc.languageId ?? DETAIL_DEFAULTS.languageId,
      electronicCopy: doc.electronicCopy ?? DETAIL_DEFAULTS.electronicCopy,
      pageCount: doc.pageCount,
      hasAttachment: doc.hasAttachment ?? null,
      attachmentDescription: doc.attachmentDescription ?? '',
      ocrStatus: doc.ocrStatus,
      release: doc.release,
      status: doc.status,
    });
  }

  // Seçili kurum evraktaki id ve cevaptaki adla kurulur (liste beklenmez)
  private applyExternalInstitution(doc: IncomingDocumentModel) {
    const id = doc.externalInstitutionId;
    if (id === null || id === undefined) return;
    this.externalInstitutionControl.setValue({ id, name: doc.externalInstitutionName || '', type: 0 });
  }


  private formatDateForInput(dateString?: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  }

  getOcrStatusText(): string {
    const value = this.formDetail.get('ocrStatus')?.value;

    switch (value) {
      case 0: return 'Bekliyor';
      case 1: return 'Tamamlandı';
      case 2: return 'Hatalı';
      default: return 'Bekliyor';
    }
  }

  // Evrakın akış durumu (DocumentStatusEnum). Yayın ayrı alanda (submissionStatus) tutulur.
  // Eski kayıtlarda kalmış 6 / 10 (yayın) değerleri akış olarak Kayıt Tamamlandı sayılır.
  getStatusText(value: number | null | undefined = this.formDetail.get('status')?.value): string {
    switch (value) {
      case 1: return 'Ön Kayıt';
      case 2: return 'Kayıt Tamamlandı';
      case 3: return 'Teslim Edildi';
      case 4: return 'Eşleştirme';
      case 5: return 'OCR';
      case 6:
      case 10: return 'Kayıt Tamamlandı';
      default: return '-';
    }
  }

  // İşlem Takip sekmesindeki DURUM değeri: ekrandaki güncel akış durumu
  durumText(): string {
    return this.getStatusText(this.docStatus());
  }
  getSecurityDegreeText(): string {
    const value = this.form.get('securityDegree')?.value;
    return this.securityDegreeOptions.find(opt => opt.value === value)?.label ?? '-';
  }

  // YAYIN çipi: Atlas'a yayın durumu (submissionStatus etiketleri)
  getReleaseText(): string {
    return PublishStatusLabels[this.publishState()];
  }

  // İşlem Takip sekmesi: durum özet çipleri için renk sınıfı (metne göre belirlenir).
  statusChipClass(): string {
    const text = this.durumText();
    if (text === 'Teslim Edildi') return 'chip-success';
    if (text === 'Kayıt Tamamlandı') return 'chip-warning';
    if (text === 'Ön Kayıt') return 'chip-info';
    return 'chip-muted';
  }

  ocrChipClass(): string {
    const text = this.getOcrStatusText();
    if (text === 'Tamamlandı') return 'chip-success';
    if (text === 'Hatalı') return 'chip-danger';
    return 'chip-warning';
  }

  releaseChipClass(): string {
    switch (this.publishState()) {
      case PublishStatusEnum.Yayinlandi: return 'chip-success';
      case PublishStatusEnum.AktarimSirasinda:
      case PublishStatusEnum.Aktariliyor: return 'chip-warning';
      case PublishStatusEnum.AktarimHatali: return 'chip-danger';
      default: return 'chip-muted';
    }
  }

  // İşlem geçmişi zaman çizelgesi: işlem tipine göre ikon ve renk.
  private readonly transactionIconMap: Record<number, string> = {
    1: 'save',
    3: 'edit_note',
    6: 'contract_edit',
    7: 'task_alt',
    8: 'document_scanner',
    9: 'assured_workload',
    18: 'verified',
    19: 'cloud_off',
    20: 'attach_file_add',
    21: 'link_off',
  };

  private readonly transactionColorMap: Record<number, string> = {
    1: 'transaction-dot-info',
    3: 'transaction-dot-info',
    6: 'transaction-dot-secondary',
    7: 'transaction-dot-success',
    8: 'transaction-dot-warning',
    9: 'transaction-dot-secondary',
    18: 'transaction-dot-success',
    19: 'transaction-dot-danger',
    20: 'transaction-dot-info',
    21: 'transaction-dot-secondary',
  };

  transactionIcon(type: number): string {
    return this.transactionIconMap[type] ?? 'history';
  }

  transactionIconClass(type: number): string {
    return this.transactionColorMap[type] ?? 'transaction-dot-secondary';
  }

  loadTransactions() {
    const docId = this.form.value.id; // formdaki documentId
    if (!docId) return;

    this.transactionLoading.set(true);
    this.documentTransactionService.getTransactionsByDocumentId(docId).subscribe({
      next: (res) => this.transactionData.set(res),
      error: (err) => console.error(err),
      complete: () => this.transactionLoading.set(false)
    });
  }

  get data() { return computed(() => this.transactionData() ?? []); }
  get loading() { return computed(() => this.transactionLoading()); }

}
