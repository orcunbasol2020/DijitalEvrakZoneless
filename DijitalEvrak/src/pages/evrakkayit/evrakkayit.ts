import { ChangeDetectionStrategy, Component, ViewEncapsulation, signal, computed, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule, FormControl } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FlexiToastService } from 'flexi-toast';
import GenericModel from '../../../components/generic-model/generic-model';
import { CommonModule } from '@angular/common';
import { BreadcrumbModel } from '../layouts/breadcrumb/breadcrumb';
import { DocumentDetail } from '../../services/document-detail';
import { DocumentService } from '../../services/document';
import { IncomingDocumentService } from '../../services/incomingdocument';
import { Department, DepartmentModel } from '../../services/department';
import { ExternalInstitution, ExternalInstitutionModel } from '../../services/external-institution';
import { Observable, startWith, map } from 'rxjs';
import { SimpleAutocompleteComponent } from '../simpleautocomplete/simpleautocomplete';
import { IncomingDocumentModel } from '../../models/incoming-document/incoming-document.model';
import { Common } from '../../services/common';
import { FlexiGridModule } from 'flexi-grid';

@Component({
  standalone: true,
  imports: [
    GenericModel,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SimpleAutocompleteComponent,
    FlexiGridModule
  ],
  templateUrl: './evrakkayit.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Evrakkayit implements OnInit {

  private fb = inject(FormBuilder);
  private router = inject(Router);
  private documentDetail = inject(DocumentDetail);
  private documentService = inject(DocumentService);
  private incomingDocumentService = inject(IncomingDocumentService);
  private departmentService = inject(Department);
  private externalInstitutionService = inject(ExternalInstitution);
  private toast = inject(FlexiToastService);
  private sanitizer = inject(DomSanitizer);
  private pendingDepartmentId: string | null = null;
  private pendingExternalInstitutionId: string | null = null;

  readonly user = computed(() => this.#common.user());
    readonly #common = inject(Common);

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

  readonly pdfUrl = computed<SafeResourceUrl>(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(`/assets/pdf/${this.pdfFileName()}#zoom=80`)
  );

  readonly breadcrumbs = signal<BreadcrumbModel[]>([
    { title: 'Taranmış Evraklar', url: '/scanlist', icon: '' },
    { title: 'Gelen Evrak Kayıt', url: '/evrakkayit', icon: 'add' }
  ]);

  readonly title = "Gelen Evrak Kayıt";

  ngOnInit(): void {
    this.form = this.fb.group({
      id: ['', Validators.required],
      qrCode: [''],
      orginalNo: [''],
      subject: ['', Validators.required],
      nereden: [''],
      nereye: [''],
      documentDate: [''],
      notes: [''],
      documentName: [''],
      externalInstitutionId: new FormControl<ExternalInstitutionModel | null>(null),
      departmentId: new FormControl<DepartmentModel | null>(null),
      documentTypeId: [''],
    });

        this.formDetail = this.fb.group({
      status: [''],
      securityDegree: [''],
      electronicCopy: [''],
      languageId: [''],
      pageCount: [''],
      ocrStatus: [{ value: '', disabled: true }],
      release: [{ value: '', disabled: true }]
    });

    this.loadDepartments();
    this.loadExternalInstitutions();

    const id = this.documentService.currentDocumentId;
    if (!id) {
      this.router.navigate(['/scanlist']);
      return;
    }

    if (this.documentService.currentDocumentUpdateType == "1") {
      this.getir(id);
    } else {
     this.incomingDocumentService.GetByQrCode(id).subscribe(doc => {
      console.log("API RESPONSE:", doc);
  if (!doc) return;

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

  this.setPdf(doc.documentName + '.pdf');

  this.applyDepartment(doc.departmentId);
  this.applyExternalInstitution(doc.externalInstitutionId); 

  this.formDetail.patchValue({
  securityDegree: doc.securityDegree,
  languageId: doc.languageId,
  electronicCopy: doc.electronicCopy,
  pageCount: doc.pageCount,
  ocrStatus: doc.ocrStatus,
  release: doc.release,
  status: doc.status,
});


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
    this.pdfFileName.set(fileName ?? '');
  }

saveDetail() {

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

  const formData: IncomingDocumentModel = {
    ...raw,
    departmentId: raw.departmentId?.id ?? null,
    externalInstitutionId: raw.externalInstitutionId?.id ?? null,
    userId: userId
  };

  // 🔹 Eğer ID varsa update, yoksa create
  const saveObs = formData.id
    ? this.incomingDocumentService.updateIncomingDocument(formData)
    : this.incomingDocumentService.createIncomingDocument(formData);

  saveObs.subscribe({
    next: () => {
      const msg = formData.id ? "Belge başarıyla güncellendi." : "Yeni belge eklendi.";
      this.toast.showToast("Başarılı", msg);
    },
    error: (err) => {
      console.error(err);
      this.toast.showToast("Kayıt Başarısız", "Belge kaydedilirken bir hata oluştu.");
    }
  });
}


  getir(id: string) {
    this.documentService.getDocumentById(id).subscribe(doc => {
      if (!doc) return;

      this.form.patchValue({
        ...doc,
        departmentId: null,
        externalInstitutionId: null,
        documentDate: doc.documentDate?.split('T')[0]
      });

      this.setPdf(doc.documentName + '.pdf');

      this.applyDepartment(doc.departmentId);
      this.applyExternalInstitution(doc.externalInstitutionId);

  this.formDetail.patchValue({
  securityDegree: doc.securityDegree,
  languageId: doc.languageId,
  electronicCopy: doc.electronicCopy,
  pageCount: doc.pageCount,
  ocrStatus: doc.ocrStatus,
  release: doc.release,
  status: doc.status,
});


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
    default: return '-';
  }
}

getStatusText(): string {
  const value = this.formDetail.get('status')?.value;

  switch (value) {
    case 1: return 'Ön Kayıt';
    case 2: return 'Kayıt Tamamlandı';
    case 3: return 'Yayınlandı';
    case 4: return 'Teslim Edildi';
    default: return '-';
  }
}
getReleaseText(): string {
  const value = this.formDetail.get('release')?.value;

  if (value === true) return 'Yayınlandı';
  return 'Yayınlanmadı'; // false veya null dahil
}

loadTransactions() {
  //transactionData = 
}



}
