import { ChangeDetectionStrategy, Component, ViewEncapsulation, signal, computed, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule, FormControl } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FlexiToastService } from 'flexi-toast';
import GenericModel from '../../../components/generic-model/generic-model';
import { CommonModule } from '@angular/common';
import { BreadcrumbModel } from '../layouts/breadcrumb/breadcrumb';
import { IncomingDocumentService } from '../../services/incomingdocument';
import { Department, DepartmentModel } from '../../services/department';
import { ExternalInstitution, ExternalInstitutionModel } from '../../services/external-institution';
import { Observable, startWith, map } from 'rxjs';
import { SimpleAutocompleteComponent } from '../simpleautocomplete/simpleautocomplete';
import { IncomingDocumentModel } from '../../models/incoming-document/incoming-document.model';
import { Common } from '../../services/common';
import { DocumentTransaction } from '../../services/documenttransaction';
import { DocumentTransactionModel } from '../../models/documenttransaction.model';
import { SecurityDegreeEnum, SecurityDegreeLabels } from '../../models/securitydegree.model';
import { actionRequiredOptions } from '../../models/actionrequired.model';
import { DocumentTypeEnum, DocumentTypeLabels } from '../../models/documenttype.model';

// "Diğer Bilgiler" sekmesinin varsayılanları: Hizmete Özel, elektronik kopya yok, Türkçe (1)
const DETAIL_DEFAULTS = {
  securityDegree: SecurityDegreeEnum.ServiceUseOnly,
  electronicCopy: false,
  languageId: 1,
} as const;

@Component({
  standalone: true,
  imports: [
    GenericModel,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SimpleAutocompleteComponent
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
  readonly activeTab = signal<'general' | 'detail' | 'transaction'>('general');

  setTab(tab: 'general' | 'detail' | 'transaction') {
    this.activeTab.set(tab);
    if (tab === 'transaction') this.loadTransactions();
  }

  // Başlıktaki durum rozeti: yayın durumu öncelikli, aksi halde kayıt durumu
  readonly statusBadge = computed(() => {
    const status = this.docStatus();
    if (status === 10) return { text: 'Yayınlandı', tone: 'success', icon: 'verified' };
    if (status === 6) return { text: 'Yayınlanma Sırasında', tone: 'warning', icon: 'hourglass_top' };
    return { text: 'Kayıt', tone: 'info', icon: 'edit_document' };
  });
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private incomingDocumentService = inject(IncomingDocumentService);
  private departmentService = inject(Department);
  private externalInstitutionService = inject(ExternalInstitution);
  private toast = inject(FlexiToastService);
  private sanitizer = inject(DomSanitizer);
  private pendingDepartmentId: string | null = null;
  private pendingExternalInstitutionId: string | null = null;
  public docStatus = signal<number>(2);
  activeStatus = signal(false);
  readonly #common = inject(Common);
  readonly user = computed(() => this.#common.user());

  form!: FormGroup;
  formDetail!: FormGroup;

  departments: DepartmentModel[] = [];
  externalInstitutions: ExternalInstitutionModel[] = [];

  filteredDepartments$!: Observable<DepartmentModel[]>;
  filteredExternalInstitutions$!: Observable<ExternalInstitutionModel[]>;

  get departmentControl(): FormControl<DepartmentModel | null> {
    return this.form.get('departmentId') as FormControl<DepartmentModel | null>;
  }

  get externalInstitutionControl(): FormControl<ExternalInstitutionModel | null> {
    return this.form.get('externalInstitutionId') as FormControl<ExternalInstitutionModel | null>;
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

  readonly breadcrumbs = signal<BreadcrumbModel[]>([
    { title: 'Taranmış Evraklar', url: '/scanlist', icon: '' },
    { title: 'Gelen Evrak Kayıt', url: '/evrakkayit', icon: 'add' }
  ]);

  readonly title = "Gelen Evrak Kayıt";

  readonly securityDegreeOptions = Object.entries(SecurityDegreeLabels).map(([value, label]) => ({
    value: Number(value) as SecurityDegreeEnum,
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
      departmentId: new FormControl<DepartmentModel | null>(null),
      documentTypeId: [null as DocumentTypeEnum | null],
    });

    this.formDetail = this.fb.group({
      id: ['', Validators.required],
      status: [''],
      securityDegree: [DETAIL_DEFAULTS.securityDegree],
      actionRequired: [null],
      electronicCopy: [DETAIL_DEFAULTS.electronicCopy],
      languageId: [DETAIL_DEFAULTS.languageId],
      pageCount: [''],
      ocrStatus: [{ value: '', disabled: true }],
      release: [{ value: '', disabled: true }]
    });

    // Zoneless CD: şablondaki evrak sayısı metni ham form değeri yerine bu sinyalden okunur,
    // böylece patchValue sonrası görünüm güncellenir.
    this.form.controls['qrCode'].valueChanges.subscribe(v => this.documentNo.set(v ?? ''));

    this.loadDepartments();
    this.loadExternalInstitutions();

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

        if (doc.status === 6 || doc.status === 10)  // yayinla durumu
        {
          this.activeStatus.set(true);
          this.docStatus.set(doc.status);
        }

        if (!doc.documentName) {
          this.toast.showToast(
            "Belge henüz taranmamış",
            "Belge ön kaydı yapılmış fakat belge henüz taranmamış."
          );
          return;
        }

        this.form.patchValue({
          ...doc,
          departmentId: null,
          externalInstitutionId: null,
          documentDate: doc.documentDate?.split('T')[0]
        });

        if (doc.documentName)
          this.setPdf(doc.documentName);

        this.applyDepartment(doc.departmentId);
        this.applyExternalInstitution(doc.externalInstitutionId);

        this.patchDetail(doc);

      });

    }

    this.filteredDepartments$ = this.form.controls['departmentId'].valueChanges.pipe(
      startWith(''),
      map(value => this.filterDepartments(value))
    );

    this.filteredExternalInstitutions$ = this.form.controls['externalInstitutionId'].valueChanges.pipe(
      startWith(''),
      map(value => this.filterExternalInstitutions(value))
    );
  }

  private loadDepartments() {
    this.departmentService.getDepartments().subscribe({
      next: (res) => {
        this.departments = res;

        if (this.pendingDepartmentId) {
          const selected = this.departments.find(d => d.id === this.pendingDepartmentId);
          if (selected) {
            this.form.controls['departmentId'].setValue(selected);
          }
        }
      },
      error: (err) => {
        console.error(err);
        this.toast.showToast("Hata", "Birimler yüklenemedi");
      }
    });
  }


  private loadExternalInstitutions() {
    this.externalInstitutionService.getExternalInstitutions().subscribe({
      next: (res) => {
        this.externalInstitutions = res;

        if (this.pendingExternalInstitutionId) {
          const selected = this.externalInstitutions.find(
            d => d.id === this.pendingExternalInstitutionId
          );

          if (selected) {
            this.externalInstitutionControl.setValue(selected);
          }

          this.pendingExternalInstitutionId = null;
        }
      },
      error: (err) => {
        console.error(err);
        this.toast.showToast("Hata", "Dış kurumlar yüklenemedi");
      }
    });
  }


  private filterDepartments(value: string | DepartmentModel): DepartmentModel[] {
    const filterValue = typeof value === 'string' ? value.toLowerCase() : value?.name.toLowerCase();
    return this.departments.filter(d => d.name.toLowerCase().includes(filterValue ?? ''));
  }

  private filterExternalInstitutions(value: string | ExternalInstitutionModel): ExternalInstitutionModel[] {
    const filterValue = typeof value === 'string' ? value.toLowerCase() : value?.name.toLowerCase();
    return this.externalInstitutions.filter(d => d.name.toLowerCase().includes(filterValue ?? ''));
  }

  displayDepartment(dept: DepartmentModel): string {
    return dept?.name ?? '';
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

    const formData: IncomingDocumentModel = {
      ...raw,
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

    if (this.publish()) {
      this.docStatus.set(6);
      this.activeStatus.set(true);
    }
    else {
      this.docStatus.set(2);
      this.activeStatus.set(false);
    }


    const formData: IncomingDocumentModel = {
      ...raw,
      departmentId: raw.departmentId?.id ?? null,
      externalInstitutionId: raw.externalInstitutionId?.id ?? null,
      userId: userId,
      status: this.docStatus(),
    };

    // 🔹 Eğer ID varsa update, yoksa create
    const saveObs = formData.id
      ? this.incomingDocumentService.updateIncomingDocument(formData)
      : this.incomingDocumentService.createIncomingDocument(formData);

    saveObs.subscribe({
      next: () => {

        let msg = formData.id ? "Belge başarıyla güncellendi." : "Başarılı";

        if (this.publish())
          msg = formData.id ? "Belge güncellendi, yayınlanma sırasına alındı." : "Başarılı";

        this.toast.showToast("Başarılı", msg);
      },
      error: (err) => {
        console.error(err);
        this.toast.showToast("Kayıt Başarısız", "Belge kaydedilirken bir hata oluştu.");
      }
    });
  }


  getir(id: string) {
    this.incomingDocumentService.getIncomingDocumentByDocumentId(id).subscribe(doc => {
      if (!doc) return;

      this.form.patchValue({
        ...doc,
        departmentId: null,
        externalInstitutionId: null,
        documentDate: doc.documentDate?.split('T')[0]
      });

      if (doc.status === 6 || doc.status === 10) // yayinla durumu
      {
        this.activeStatus.set(true);
        this.docStatus.set(doc.status);
      }

      if (doc.documentName)
        this.setPdf(doc.documentName);

      this.applyDepartment(doc.departmentId);
      this.applyExternalInstitution(doc.externalInstitutionId);

      this.patchDetail(doc);

    });
  }

  // "Diğer Bilgiler" formunu belgeden doldurur; backend'de boş olan alanlar varsayılanla gelir.
  private patchDetail(doc: IncomingDocumentModel) {
    this.formDetail.patchValue({
      id: doc.id,
      securityDegree: doc.securityDegree ?? DETAIL_DEFAULTS.securityDegree,
      actionRequired: doc.actionRequired,
      languageId: doc.languageId ?? DETAIL_DEFAULTS.languageId,
      electronicCopy: doc.electronicCopy ?? DETAIL_DEFAULTS.electronicCopy,
      pageCount: doc.pageCount,
      ocrStatus: doc.ocrStatus,
      release: doc.release,
      status: doc.status,
    });
  }

  private applyExternalInstitution(id?: string | null) {
    if (!id) return;

    if (!this.externalInstitutions.length) {
      this.pendingExternalInstitutionId = id;
      return;
    }

    const found = this.externalInstitutions.find(d => d.id === id);
    if (found) {
      this.externalInstitutionControl.setValue(found);
    }
  }


  private applyDepartment(id?: string | null) {
    if (!id) return;

    if (!this.departments.length) {
      setTimeout(() => this.applyDepartment(id), 100);
      return;
    }

    const found = this.departments.find(d => d.id === id);
    if (found) {
      this.form.controls['departmentId'].setValue(found);
    }
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

  getStatusText(): string {
    const value = this.formDetail.get('status')?.value;

    switch (value) {
      case 1: return 'Ön Kayıt';
      case 2: return 'Kayıt Tamamlandı';
      case 3: return 'Yayınlandı';
      case 4: return 'Teslim Edildi';
      case 6: return 'Yayınlama Sırasında';
      default: return '-';
    }
  }
  getSecurityDegreeText(): string {
    const value = this.formDetail.get('securityDegree')?.value;
    return this.securityDegreeOptions.find(opt => opt.value === value)?.label ?? '-';
  }

  getReleaseText(): string {
    const value = this.formDetail.get('release')?.value;

    if (value === true) return 'Yayınlandı';
    return 'Yayınlanmadı'; // false veya null dahil
  }

  // İşlem Takip sekmesi: durum özet çipleri için renk sınıfı (metne göre belirlenir).
  statusChipClass(): string {
    const text = this.activeStatus() ? 'Yayınlandı' : this.getStatusText();
    if (text === 'Yayınlandı' || text === 'Teslim Edildi') return 'chip-success';
    if (text === 'Yayınlama Sırasında' || text === 'Kayıt Tamamlandı') return 'chip-warning';
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
    return this.getReleaseText() === 'Yayınlandı' ? 'chip-success' : 'chip-muted';
  }

  // İşlem geçmişi zaman çizelgesi: işlem tipine göre ikon ve renk.
  private readonly transactionIconMap: Record<number, string> = {
    1: 'save',
    3: 'edit_note',
    6: 'contract_edit',
    7: 'task_alt',
    8: 'document_scanner',
    9: 'assured_workload',
  };

  private readonly transactionColorMap: Record<number, string> = {
    1: 'transaction-dot-info',
    3: 'transaction-dot-info',
    6: 'transaction-dot-secondary',
    7: 'transaction-dot-success',
    8: 'transaction-dot-warning',
    9: 'transaction-dot-secondary',
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
