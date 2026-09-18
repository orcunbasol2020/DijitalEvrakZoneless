import {
  ChangeDetectionStrategy,
  Component,
  signal,
  ViewEncapsulation,
  computed,
  inject,
  effect
} from '@angular/core';
import { FlexiGridModule } from 'flexi-grid';
import { Router } from '@angular/router';
import GenericModel from '../../../../components/generic-model/generic-model';
import { CommonModule } from '@angular/common';
import { FlexiToastService } from 'flexi-toast';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IncomingDocumentService } from '../../../services/incomingdocument';
import { OutgoingDocumentService } from '../../../services/outgoingdocument';
import { OutgoingDocumentModel, OutgoingDocumentStatus } from '../../../models/outgoingdocument.model';
import { Common } from '../../../services/common';
import { ZimmetStateService } from '../../../services/zimmet-state-service';
import { SimpleAutocompleteComponent } from '../../simpleautocomplete/simpleautocomplete';
import { Department, DepartmentModel } from '../../../services/department';
import { ExternalInstitution, ExternalInstitutionModel } from '../../../services/external-institution';
import { Language, LanguageModel } from '../../../services/language';
import { SecurityDegreeEnum, SecurityDegreeLabels } from '../../../models/securitydegree.model';
import { UrgencyDegreeEnum, UrgencyDegreeLabels } from '../../../models/urgencydegree.model';
import { DocumentTypeEnum, DocumentTypeLabels } from '../../../models/documenttype.model';
import { actionRequiredOptions, actionRequiredLabel } from '../../../models/actionrequired.model';

@Component({
  imports: [
    FlexiGridModule,
    GenericModel,
    FormsModule,
    ReactiveFormsModule,
    CommonModule,
    SimpleAutocompleteComponent
  ],
  templateUrl: './outgoing.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Outgoing {
  readonly #common = inject(Common);
  readonly user = computed(() => this.#common.user());
  readonly scanListData = signal<OutgoingDocumentModel[]>([]);
  readonly documentsResourceSig = signal<any>(null);
  readonly #toast = inject(FlexiToastService);
  private readonly router = inject(Router);
  // NOT: "Süreçler" satır aksiyonu hâlâ IncomingDocumentService üzerinden
  // çalışıyor; OutgoingDocuments artık ayrı bir tablo/servis olduğu için bu
  // id'lerle doğru şekilde eşleşmeyebilir. Giden evrağa özel bir süreç ekranı
  // netleşene kadar davranışı değiştirilmedi. "Zimmet" aksiyonu ise artık
  // /gidenevrak/outgoingzimmet üzerinden OutgoingDocumentAllocations'a gidiyor.
  private readonly incomingDocumentService = inject(IncomingDocumentService);
  private readonly outgoingDocumentService = inject(OutgoingDocumentService);
  private readonly zimmetState = inject(ZimmetStateService);
  private readonly departmentService = inject(Department);
  private readonly externalInstitutionService = inject(ExternalInstitution);
  private readonly languageService = inject(Language);
  readonly loading = computed(() => this.documentsResourceSig()?.isLoading?.() ?? false);

  // Manuel giden evrak kaydı / güncelleme popup'ı
  readonly createModalVisible = signal(false);
  readonly createSaving = signal(false);
  // null: yeni kayıt oluşturuluyor, dolu: bu id'li kayıt güncelleniyor.
  readonly editingId = signal<string | null>(null);
  departments: DepartmentModel[] = [];
  externalInstitutions: ExternalInstitutionModel[] = [];
  languages: (LanguageModel & { id: string })[] = [];
  private optionsLoaded = false;
  private pendingEditDepartmentId: string | null = null;
  private pendingEditInstitutionId: string | null = null;
  private pendingEditLanguageId: string | null = null;
  readonly departmentControl = new FormControl<DepartmentModel | null>(null);
  readonly externalInstitutionControl = new FormControl<ExternalInstitutionModel | null>(null);
  readonly languageControl = new FormControl<LanguageModel | null>(null);
  createModel = {
    qrCode: '',
    originalDocumentNumber: '',
    documentDate: '',
    subject: '',
    type: DocumentTypeEnum.Yazi as number,
    securityDegree: SecurityDegreeEnum.ServiceUseOnly as number,
    urgencyDegree: UrgencyDegreeEnum.Normal as number,
    actionRequired: true as boolean | null
  };

  readonly documentTypeOptions = Object.entries(DocumentTypeLabels).map(([value, label]) => ({
    value: Number(value) as DocumentTypeEnum,
    label
  }));

  readonly documentTypeLabelMap: Record<number, string> = DocumentTypeLabels;

  readonly securityDegreeOptions = Object.entries(SecurityDegreeLabels).map(([value, label]) => ({
    value: Number(value) as SecurityDegreeEnum,
    label
  }));

  readonly securityDegreeMap: Record<number, string> = SecurityDegreeLabels;

  readonly urgencyDegreeOptions = Object.entries(UrgencyDegreeLabels).map(([value, label]) => ({
    value: Number(value) as UrgencyDegreeEnum,
    label
  }));

  readonly urgencyDegreeMap: Record<number, string> = UrgencyDegreeLabels;

  readonly actionRequiredOptions = actionRequiredOptions;
  readonly actionRequiredLabel = actionRequiredLabel;

  // Backend AllocationSourceEnum ile birebir: 1: Evrak Takip (bu sistemden manuel girilen kayıt), 2: Atlas'tan aktarılan kayıt.
  readonly sourceLabelMap: Record<number, string> = {
    1: 'Evrak Takip',
    2: 'Atlas'
  };

  readonly statusLabelMap: Record<number, string> = {
    [OutgoingDocumentStatus.Taslak]: 'Ön Kayıt',
    [OutgoingDocumentStatus.Gonderildi]: 'Gönderildi',
    [OutgoingDocumentStatus.TeslimEdildi]: 'Teslim Edildi',
    [OutgoingDocumentStatus.Iade]: 'İade'
  };

  showFilters = false;

  private emptyToastShown = false;

  constructor() {
    this.setupDocumentsEffect();
    this.loadDocuments();
  }

  get currentUserId(): string | undefined {
    return this.user()?.id;
  }

  private setupDocumentsEffect(): void {
    effect(() => {
      const res = this.documentsResourceSig();
      if (!res || res.isLoading?.()) return;

      const docs = res.value?.();

      if (!docs || docs.length === 0) {
        if (!this.emptyToastShown) {
          this.#toast.showToast('Uyarı', 'Herhangi bir belge bulunamadı');
          this.emptyToastShown = true;
        }
        this.scanListData.set([]);
        return;
      }

      this.emptyToastShown = false;
      this.scanListData.set(this.sortDocuments(docs));
    });
  }

  // Kayıt tarihine göre en yeni en üstte; kayıt tarihi eşit olan kayıtlarda belge tarihi ile kırılır.
  private sortDocuments(docs: OutgoingDocumentModel[]): OutgoingDocumentModel[] {
    return [...docs].sort((a, b) => {
      const createdDiff = new Date(b.createdDate ?? 0).getTime() - new Date(a.createdDate ?? 0).getTime();
      if (createdDiff !== 0) return createdDiff;
      return new Date(b.documentDate ?? 0).getTime() - new Date(a.documentDate ?? 0).getTime();
    });
  }

  loadDocuments(): void {
    this.documentsResourceSig.set(
      this.outgoingDocumentService.getAll()
    );
  }

  toggleFilter() {
    this.showFilters = !this.showFilters;
  }

  goToProcess(id: string) {
    this.incomingDocumentService.setSelectedIncomingDocument(id);
    this.router.navigate(['/surecler']);
  }

  goToZimmet(id: string) {
    this.zimmetState.setOutgoingDocumentId(id);
    this.router.navigate(['/gidenevrak/outgoingzimmet']);
  }

  delete(id: string) {
    this.#toast.showSwal(
      'Giden Evrakı Sil?',
      'Giden evrakı silmek istiyor musunuz?',
      'Sil',
      () => {
        this.outgoingDocumentService.deleteOutgoingDocument(id).subscribe(() => {
          this.loadDocuments();
        });
      }
    );
  }

  openCreateModal(): void {
    this.editingId.set(null);
    this.pendingEditDepartmentId = null;
    this.pendingEditInstitutionId = null;
    this.pendingEditLanguageId = null;
    this.createModel = {
      qrCode: '',
      originalDocumentNumber: '',
      documentDate: '',
      subject: '',
      type: DocumentTypeEnum.Yazi,
      securityDegree: SecurityDegreeEnum.ServiceUseOnly,
      urgencyDegree: UrgencyDegreeEnum.Normal,
      actionRequired: true
    };
    this.departmentControl.setValue(null);
    this.externalInstitutionControl.setValue(null);
    this.languageControl.setValue(null);

    if (!this.optionsLoaded) {
      this.optionsLoaded = true;
      this.loadDepartments();
      this.loadExternalInstitutions();
      this.loadLanguages();
    } else {
      this.applyOwnDepartment();
    }

    this.createModalVisible.set(true);
  }

  openEditModal(item: OutgoingDocumentModel): void {
    this.editingId.set(item.id);
    this.createModel = {
      qrCode: item.qrCode ?? '',
      originalDocumentNumber: item.originalDocumentNumber ?? '',
      documentDate: (item.documentDate ?? item.createdDate ?? '').split('T')[0],
      subject: item.subject ?? '',
      type: item.type ?? DocumentTypeEnum.Yazi,
      securityDegree: item.securityDegree ?? SecurityDegreeEnum.ServiceUseOnly,
      urgencyDegree: item.urgencyDegree ?? UrgencyDegreeEnum.Normal,
      actionRequired: item.actionRequired ?? true
    };
    this.departmentControl.setValue(null);
    this.externalInstitutionControl.setValue(null);
    this.languageControl.setValue(null);
    this.pendingEditDepartmentId = item.departmentId ?? null;
    this.pendingEditInstitutionId = item.externalInstitutonId ?? null;
    this.pendingEditLanguageId = item.languageId ?? null;

    if (!this.optionsLoaded) {
      this.optionsLoaded = true;
      this.loadDepartments();
      this.loadExternalInstitutions();
      this.loadLanguages();
    } else {
      this.applyPendingEditDepartment();
      this.applyPendingEditInstitution();
      this.applyPendingEditLanguage();
    }

    this.createModalVisible.set(true);
  }

  closeCreateModal(): void {
    if (this.createSaving()) return;
    this.createModalVisible.set(false);
  }

  private loadDepartments(): void {
    this.departmentService.getDepartments().subscribe({
      next: (res) => {
        this.departments = res;

        if (this.pendingEditDepartmentId) {
          this.applyPendingEditDepartment();
        } else if (!this.editingId()) {
          this.applyOwnDepartment();
        }
      },
      error: (err) => {
        console.error(err);
        this.#toast.showToast('Hata', 'Birimler yüklenemedi', 'error');
      }
    });
  }

  private loadExternalInstitutions(): void {
    this.externalInstitutionService.getExternalInstitutions().subscribe({
      next: (res) => {
        this.externalInstitutions = res;
        this.applyPendingEditInstitution();
      },
      error: (err) => {
        console.error(err);
        this.#toast.showToast('Hata', 'Dış kurumlar yüklenemedi', 'error');
      }
    });
  }

  private loadLanguages(): void {
    this.languageService.getLanguages().subscribe({
      next: (res) => {
        this.languages = res.filter((l): l is LanguageModel & { id: string } => !!l.id);
        this.applyPendingEditLanguage();
      },
      error: (err) => {
        console.error(err);
        this.#toast.showToast('Hata', 'Diller yüklenemedi', 'error');
      }
    });
  }

  private applyPendingEditDepartment(): void {
    if (!this.pendingEditDepartmentId) return;
    const dept = this.departments.find(d => d.id === this.pendingEditDepartmentId);
    if (dept) this.departmentControl.setValue(dept);
    this.pendingEditDepartmentId = null;
  }

  private applyPendingEditInstitution(): void {
    if (!this.pendingEditInstitutionId) return;
    const inst = this.externalInstitutions.find(i => i.id === this.pendingEditInstitutionId);
    if (inst) this.externalInstitutionControl.setValue(inst);
    this.pendingEditInstitutionId = null;
  }

  private applyPendingEditLanguage(): void {
    if (!this.pendingEditLanguageId) return;
    const lang = this.languages.find(l => l.id === this.pendingEditLanguageId);
    if (lang) this.languageControl.setValue(lang);
    this.pendingEditLanguageId = null;
  }

  private applyOwnDepartment(): void {
    const ownDepartmentId = this.user()?.departmentId;
    const own = this.departments.find(d => d.id === ownDepartmentId);
    if (own) {
      this.departmentControl.setValue(own);
    }
  }

  saveManualDocument(): void {
    if (!this.createModel.qrCode.trim()) {
      this.#toast.showToast('Uyarı', 'Belge numarası zorunludur', 'warning');
      return;
    }

    if (!this.createModel.documentDate) {
      this.#toast.showToast('Uyarı', 'Belge tarihi zorunludur', 'warning');
      return;
    }

    if (!this.departmentControl.value) {
      this.#toast.showToast('Uyarı', 'Gönderen birim zorunludur', 'warning');
      return;
    }

    if (!this.externalInstitutionControl.value) {
      this.#toast.showToast('Uyarı', 'Alan birim zorunludur', 'warning');
      return;
    }

    const editingId = this.editingId();

    const body: Partial<OutgoingDocumentModel> = {
      qrCode: this.createModel.qrCode.trim(),
      originalDocumentNumber: this.createModel.originalDocumentNumber.trim() || undefined,
      documentDate: this.createModel.documentDate,
      subject: this.createModel.subject.trim() || undefined,
      type: this.createModel.type,
      securityDegree: this.createModel.securityDegree,
      urgencyDegree: this.createModel.urgencyDegree,
      actionRequired: this.createModel.actionRequired,
      languageId: this.languageControl.value?.id ?? null,
      departmentId: this.departmentControl.value.id,
      externalInstitutonId: this.externalInstitutionControl.value.id
    };

    const request$ = editingId
      ? this.outgoingDocumentService.updateOutgoingDocument({ ...body, id: editingId })
      // Bu form yalnızca manuel kayıt için kullanılıyor; kaynak sabit 1 (Evrak Takip, backend AllocationSourceEnum).
      : this.outgoingDocumentService.createOutgoingDocument({ ...body, status: OutgoingDocumentStatus.Taslak, source: 1 });

    this.createSaving.set(true);
    request$.subscribe({
      next: () => {
        this.createSaving.set(false);
        this.createModalVisible.set(false);
        this.#toast.showToast('Başarılı', editingId ? 'Giden evrak kaydı güncellendi' : 'Giden evrak kaydı oluşturuldu', 'success');
        this.loadDocuments();
      },
      error: (err) => {
        this.createSaving.set(false);
        console.error(err);
        this.#toast.showToast('Hata', editingId ? 'Giden evrak güncellenemedi' : 'Giden evrak kaydedilemedi', 'error');
      }
    });
  }

}
