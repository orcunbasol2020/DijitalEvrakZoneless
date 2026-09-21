import { ChangeDetectionStrategy, Component, ViewEncapsulation, OnInit, inject, computed, signal, ElementRef, ViewChild } from '@angular/core';
import GenericModel from '../../../../components/generic-model/generic-model';
import { FlexiGridModule } from 'flexi-grid';
import { RouterLink } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { SimpleAutocompleteComponent } from '../../simpleautocomplete/simpleautocomplete';
import { ExternalInstitution, ExternalInstitutionModel } from '../../../services/external-institution';
import { EnvelopeService } from '../../../services/envelope';
import { FlexiToastService } from 'flexi-toast';
import { EnvelopeModel } from '../../../models/envelope.model';
import { Common } from '../../../services/common';
import { ChangeDetectorRef } from '@angular/core';
import { PrintPreview } from '../../printpreview/printpreview';
import html2pdf from "html2pdf.js";
import { EnvelopeDocumentService } from '../../../services/envelopedocument';
import { EnvelopeDocumentModel } from '../../../models/envelopedocument.model';
import { firstValueFrom } from 'rxjs';
import { QRCodeComponent } from 'angularx-qrcode';
import { RoleService } from '../../../services/role-service';
import { OutgoingDocumentService } from '../../../services/outgoingdocument';
import { OutgoingDocumentAllocation } from '../../../services/outgoingdocumentallocation';
import { OutgoingDocumentModel, OutgoingDocumentStatus, OutgoingDocumentStatusBadgeClass } from '../../../models/outgoingdocument.model';
import { Department, DepartmentModel } from '../../../services/department';
import { DocumentTypeEnum, DocumentTypeLabels } from '../../../models/documenttype.model';
import { SecurityDegreeEnum, SecurityDegreeLabels } from '../../../models/securitydegree.model';
import { UrgencyDegreeEnum, UrgencyDegreeLabels } from '../../../models/urgencydegree.model';
import { actionRequiredLabel, actionRequiredOptions } from '../../../models/actionrequired.model';

// Evrak bilgisi popup'ının görünüm modeli: üstte konu + durum/tür/tarih,
// altta sade etiket-değer listesi.
interface DocumentDetailView {
  subject: string;
  hasSubject: boolean;
  statusLabel: string;
  statusClass: string;
  typeLabel: string;
  dateLabel: string;
  rows: { label: string; value: string }[];
  // Yalnızca kullanıcının kendi manuel eklediği (source 1) evraklar düzenlenebilir.
  canEdit: boolean;
}

// Popup içindeki düzenleme formu; select alanları [ngValue] ile sayı/boolean tipini korur.
interface DocumentEditForm {
  originalDocumentNumber: string;
  documentDate: string;
  subject: string;
  type: number;
  securityDegree: number;
  urgencyDegree: number;
  actionRequired: boolean | null;
  externalInstitutionId: string | null;
}

@Component({
  standalone: true,
  imports: [
    GenericModel,
    FlexiGridModule,
    FormsModule,
    ReactiveFormsModule,
    CommonModule,
    SimpleAutocompleteComponent,
    PrintPreview,
    QRCodeComponent
  ],
  templateUrl: './ticket.html',
  styleUrls: ['./ticket.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Ticket implements OnInit {
  previewOpen = false;
  private envelopeService = inject(EnvelopeService);
  private envelopeDocumentService = inject(EnvelopeDocumentService);
  private outgoingDocumentService = inject(OutgoingDocumentService);
  private allocationService = inject(OutgoingDocumentAllocation);
  readonly #roleService = inject(RoleService);
  readonly #toast = inject(FlexiToastService);
  private externalInstitutionService = inject(ExternalInstitution);
  externalInstitutionControl = new FormControl<ExternalInstitutionModel | null>(null);
  externalInstitutions: ExternalInstitutionModel[] = [];
  readonly #common = inject(Common);
  readonly user = computed(() => this.#common.user());
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('qrInput') qrInput!: ElementRef<HTMLInputElement>;
  documents: EnvelopeDocumentModel[] = [];
  selectedEnvelope: EnvelopeModel | null = null;
  // Zarflar listesinden "Detaya Git" ile gelindiğinde true olur;
  // yeni etiket oluşturma formu yerine mevcut zarfın özeti gösterilir.
  isViewMode = false;


  qrActive = false;      // QR okutma aktif mi

  // Evrak Ekle paneli göründüğü an imleç doğrudan QR alanında olsun diye
  // *ngIf render'ının tamamlanmasını bekleyip odaklanıyoruz.
  private focusQrInputSoon() {
    setTimeout(() => this.qrInput?.nativeElement.focus());
  }

  activateQr() {
    this.qrInput.nativeElement.focus();  // input’a odaklan
    this.qrActive = true;
    // sonra tekrar pasif yapmak 
    setTimeout(() => this.qrActive = false, 10000);
  }

  focusQrInput() {
    this.qrInput.nativeElement.focus();
    this.qrActive = true;

    // 3 saniye sonra aktifliği geri alabiliriz
    setTimeout(() => this.qrActive = false, 5000);
  }

  onQrKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      const qrValue = (event.target as HTMLInputElement).value.trim();
      if (!qrValue) return;

      // EnvelopeId zaten seçili veya başka bir değişkende tutuluyor olmalı
      const envelopeId = this.selectedEnvelope?.id;
      if (!envelopeId) {
        this.#toast.showToast('Uyarı', 'Önce bir zarf oluşturun ya da seçin', 'warning');
        return;
      }

      this.addDocumentByQr(qrValue, envelopeId);

      // Inputu temizle
      (event.target as HTMLInputElement).value = '';
    }
  }

  loadingTable = false;

  loading = false;

  async addDocumentByQr(qrCode: string, envelopeId: string) {

    if (!envelopeId) {
      console.error("EnvelopeId yok, belge eklenemiyor!");
      return;
    }

    const createdUserId = this.user()?.id;
    if (!createdUserId) {
      this.#toast.showToast('Hata', 'Kullanıcı bilgisi alınamadı', 'error');
      return;
    }

    const alreadyAdded = this.documents.some(x => x.qrCode === qrCode);
    if (alreadyAdded) {
      this.#toast.showToast('Uyarı', 'Bu evrak zarfa daha önce eklenmiş', 'warning');
      return;
    }

    // Birim Evrak Sorumlusu: sadece kendi biriminin evrakını zarfa ekleyebilir;
    // girilen numaraya ait giden evrak yoksa manuel evrak ekleme popup'ı açılır.
    if (this.#roleService.has('Birim Evrak Sorumlusu')) {
      await this.addDocumentByQrForBirimSorumlusu(qrCode, envelopeId, createdUserId);
      return;
    }

    try {
      this.loading = true;
      this.cdr.markForCheck();
      await this.attachToEnvelope(qrCode, envelopeId, createdUserId);
    } catch (error) {
      this.#toast.showToast('Hata', 'Evrak eklenemedi. QR kodu kontrol ediniz.', 'error');
      console.error("Evrak ekleme hatası:", error);
    } finally {
      this.loading = false;
      this.cdr.markForCheck(); // kritik satır
    }
  }

  private async addDocumentByQrForBirimSorumlusu(qrCode: string, envelopeId: string, createdUserId: string) {
    this.loading = true;
    this.cdr.markForCheck();

    try {
      const doc = await firstValueFrom(this.outgoingDocumentService.getByQrCode(qrCode));

      if (!doc) {
        this.openManualEntryModal(qrCode, envelopeId);
        return;
      }

      const myDepartmentId = this.user()?.departmentId;
      if (doc.departmentId !== myDepartmentId) {
        this.#toast.showToast('Hata', 'Bu evrak kendi biriminize ait değil, zarfa ekleyemezsiniz', 'error');
        return;
      }

      await this.attachToEnvelope(qrCode, envelopeId, createdUserId);
    } catch (err: any) {
      if (err?.status === 404) {
        this.openManualEntryModal(qrCode, envelopeId);
      } else {
        this.#toast.showToast('Hata', 'Evrak sorgulanamadı', 'error');
        console.error('Evrak sorgulama hatası:', err);
      }
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  private async attachToEnvelope(qrCode: string, envelopeId: string, createdUserId: string) {
    const newEnvelopeDoc: EnvelopeDocumentModel = {
      id: '',
      envelopeId: envelopeId,
      documentId: '',
      qrCode: qrCode,
      createdUserId: createdUserId,
    };

    const createdDoc = await firstValueFrom(
      this.envelopeDocumentService.createEnvelopeDocument(newEnvelopeDoc)
    );

    const envelopeDoc: EnvelopeDocumentModel = createdDoc.data;
    this.documents.push(envelopeDoc);
    this.#toast.showToast('Başarılı', 'Evrak zarfa eklendi', 'success');

    // Zarfa eklenen evrakın zimmeti, ekleyen kullanıcıya geçer.
    await this.allocateToCurrentUser(envelopeDoc, createdUserId);
  }

  // Evrak zarfa eklendiği anda zimmet, işlemi yapan kullanıcının üzerine alınır.
  // Zimmetleme başarısız olsa bile evrak zarfta kalır; kullanıcı uyarı ile bilgilendirilir.
  private async allocateToCurrentUser(envelopeDoc: EnvelopeDocumentModel, userId: string) {
    try {
      // Create yanıtı documentId döndürmezse evrakın gerçek id'si QR koddan bulunur.
      let outgoingDocumentId = envelopeDoc.documentId;
      if (!outgoingDocumentId) {
        const doc = await firstValueFrom(this.outgoingDocumentService.getByQrCode(envelopeDoc.qrCode));
        outgoingDocumentId = doc?.id ?? '';
      }

      if (!outgoingDocumentId) {
        this.#toast.showToast('Uyarı', 'Evrak zarfa eklendi ancak zimmet aktarılamadı', 'warning');
        return;
      }

      // OutgoingDocumentAllocations.OutgoingDocumentId alanına EnvelopeDocuments kaydının
      // id'si değil, evrakın gerçek DocumentId'si yazılır (bkz. gidenzimmet).
      await firstValueFrom(
        this.allocationService.createAllocation({
          outgoingDocumentId,
          userId,
          createdUserId: userId,
          status: '2',
          userType: 1
        })
      );
    } catch (err) {
      this.#toast.showToast('Uyarı', 'Evrak zarfa eklendi ancak zimmet aktarılamadı', 'warning');
      console.error('Zimmet aktarma hatası:', err);
    }
  }

  // ---- Manuel Evrak Ekleme Popup (Birim Evrak Sorumlusu) ----

  readonly manualEntryModalVisible = signal(false);
  readonly manualEntrySaving = signal(false);
  private pendingManualEnvelopeId: string | null = null;

  manualEntryForm: { qrCode: string; documentDate: string; subject: string; externalInstitutionId: string | null } = {
    qrCode: '',
    documentDate: '',
    subject: '',
    externalInstitutionId: null
  };

  private openManualEntryModal(qrCode: string, envelopeId: string) {
    this.pendingManualEnvelopeId = envelopeId;
    this.manualEntryForm = {
      qrCode,
      documentDate: '',
      subject: '',
      externalInstitutionId: null
    };
    this.manualEntryModalVisible.set(true);
    this.cdr.markForCheck();
  }

  closeManualEntryModal() {
    if (this.manualEntrySaving()) return;
    this.manualEntryModalVisible.set(false);
  }

  async saveManualEntry() {
    if (!this.manualEntryForm.documentDate) {
      this.#toast.showToast('Uyarı', 'Belge tarihi zorunludur', 'warning');
      return;
    }

    if (!this.manualEntryForm.externalInstitutionId) {
      this.#toast.showToast('Uyarı', 'Alan birim zorunludur', 'warning');
      return;
    }

    const envelopeId = this.pendingManualEnvelopeId;
    const createdUserId = this.user()?.id;
    const departmentId = this.user()?.departmentId;

    if (!envelopeId || !createdUserId || !departmentId) {
      this.#toast.showToast('Hata', 'Kullanıcı/zarf bilgisi alınamadı', 'error');
      return;
    }

    this.manualEntrySaving.set(true);

    try {
      await firstValueFrom(
        this.outgoingDocumentService.createOutgoingDocument({
          qrCode: this.manualEntryForm.qrCode,
          documentDate: this.manualEntryForm.documentDate,
          subject: this.manualEntryForm.subject.trim() || undefined,
          departmentId,
          externalInstitutonId: this.manualEntryForm.externalInstitutionId,
          status: OutgoingDocumentStatus.Taslak,
          source: 1,
          createdUserId
        })
      );

      await this.attachToEnvelope(this.manualEntryForm.qrCode, envelopeId, createdUserId);

      this.manualEntryModalVisible.set(false);
    } catch (err) {
      this.#toast.showToast('Hata', 'Evrak kaydedilemedi', 'error');
      console.error('Manuel evrak kaydetme hatası:', err);
    } finally {
      this.manualEntrySaving.set(false);
      this.cdr.markForCheck();
    }
  }

  // ---- Evrak Bilgisi Popup (sağdaki listede evraka tıklanınca) ----

  private readonly departmentService = inject(Department);
  private departments: DepartmentModel[] | null = null;

  readonly documentDetailVisible = signal(false);
  readonly documentDetailLoading = signal(false);
  readonly documentDetailQr = signal('');
  // null: yükleniyor ya da bulunamadı; dolu: gösterilecek evrak
  readonly documentDetail = signal<DocumentDetailView | null>(null);
  readonly documentDetailNotFound = signal(false);
  // Düzenleme modu için ham kayıt ve form durumu
  private documentDetailRaw: OutgoingDocumentModel | null = null;
  readonly documentDetailEditing = signal(false);
  readonly documentDetailSaving = signal(false);

  documentEditForm: DocumentEditForm = this.emptyDocumentEditForm();

  readonly documentTypeOptions = Object.entries(DocumentTypeLabels).map(([value, label]) => ({
    value: Number(value) as DocumentTypeEnum,
    label
  }));
  readonly securityDegreeOptions = Object.entries(SecurityDegreeLabels).map(([value, label]) => ({
    value: Number(value) as SecurityDegreeEnum,
    label
  }));
  readonly urgencyDegreeOptions = Object.entries(UrgencyDegreeLabels).map(([value, label]) => ({
    value: Number(value) as UrgencyDegreeEnum,
    label
  }));
  readonly actionRequiredOptions = actionRequiredOptions;

  private emptyDocumentEditForm(): DocumentEditForm {
    return {
      originalDocumentNumber: '',
      documentDate: '',
      subject: '',
      type: DocumentTypeEnum.Yazi,
      securityDegree: SecurityDegreeEnum.ServiceUseOnly,
      urgencyDegree: UrgencyDegreeEnum.Normal,
      actionRequired: true,
      externalInstitutionId: null
    };
  }

  private readonly outgoingStatusLabels: Record<number, string> = {
    [OutgoingDocumentStatus.Taslak]: 'Ön Kayıt',
    [OutgoingDocumentStatus.Gonderildi]: 'Gönderildi',
    [OutgoingDocumentStatus.TeslimEdildi]: 'Teslim Edildi',
    [OutgoingDocumentStatus.Iade]: 'İade'
  };

  async openDocumentDetail(doc: EnvelopeDocumentModel) {
    this.documentDetailQr.set(doc.qrCode);
    this.documentDetail.set(null);
    this.documentDetailRaw = null;
    this.documentDetailEditing.set(false);
    this.documentDetailNotFound.set(false);
    this.documentDetailVisible.set(true);
    this.documentDetailLoading.set(true);
    this.cdr.markForCheck();

    try {
      // Birim adları için birim listesi ilk açılışta bir kez çekilir.
      const [detail, departments] = await Promise.all([
        firstValueFrom(this.outgoingDocumentService.getByQrCode(doc.qrCode)),
        this.departments ? Promise.resolve(this.departments) : firstValueFrom(this.departmentService.getDepartments()).catch(() => [] as DepartmentModel[])
      ]);
      this.departments = departments;

      if (!detail) {
        this.documentDetailNotFound.set(true);
        return;
      }

      this.documentDetailRaw = detail;
      this.documentDetail.set(this.buildDocumentDetailView(detail));
    } catch (err: any) {
      if (err?.status === 404) {
        this.documentDetailNotFound.set(true);
      } else {
        this.#toast.showToast('Hata', 'Evrak bilgisi alınamadı', 'error');
        console.error('Evrak bilgisi hatası:', err);
        this.documentDetailVisible.set(false);
      }
    } finally {
      this.documentDetailLoading.set(false);
      this.cdr.markForCheck();
    }
  }

  closeDocumentDetail() {
    if (this.documentDetailSaving()) return;
    this.documentDetailVisible.set(false);
    this.documentDetailEditing.set(false);
  }

  startDocumentEdit() {
    const d = this.documentDetailRaw;
    if (!d || !this.documentDetail()?.canEdit) return;

    this.documentEditForm = {
      originalDocumentNumber: d.originalDocumentNumber ?? '',
      documentDate: (d.documentDate ?? '').split('T')[0],
      subject: d.subject ?? '',
      type: d.type ?? DocumentTypeEnum.Yazi,
      securityDegree: d.securityDegree ?? SecurityDegreeEnum.ServiceUseOnly,
      urgencyDegree: d.urgencyDegree ?? UrgencyDegreeEnum.Normal,
      actionRequired: d.actionRequired ?? true,
      externalInstitutionId: d.externalInstitutonId ?? null
    };
    this.documentDetailEditing.set(true);
  }

  cancelDocumentEdit() {
    if (this.documentDetailSaving()) return;
    this.documentDetailEditing.set(false);
  }

  async saveDocumentEdit() {
    const d = this.documentDetailRaw;
    if (!d) return;

    if (!this.documentEditForm.documentDate) {
      this.#toast.showToast('Uyarı', 'Belge tarihi zorunludur', 'warning');
      return;
    }

    if (!this.documentEditForm.externalInstitutionId) {
      this.#toast.showToast('Uyarı', 'Alan birim zorunludur', 'warning');
      return;
    }

    // createdUserId bilerek gönderilmiyor: backend "!= null" ise üzerine yazdığından
    // düzenleyen kullanıcı orijinal oluşturucunun yerine geçmesin (bkz. outgoingcreate).
    const body: Partial<OutgoingDocumentModel> = {
      id: d.id,
      qrCode: d.qrCode,
      originalDocumentNumber: this.documentEditForm.originalDocumentNumber.trim() || undefined,
      documentDate: this.documentEditForm.documentDate,
      subject: this.documentEditForm.subject.trim() || undefined,
      type: this.documentEditForm.type,
      securityDegree: this.documentEditForm.securityDegree,
      urgencyDegree: this.documentEditForm.urgencyDegree,
      actionRequired: this.documentEditForm.actionRequired,
      languageId: d.languageId ?? null,
      departmentId: d.departmentId,
      externalInstitutonId: this.documentEditForm.externalInstitutionId
    };

    this.documentDetailSaving.set(true);
    try {
      await firstValueFrom(this.outgoingDocumentService.updateOutgoingDocument(body));

      // Sunucudan tekrar çekmek yerine bilinen alanları yerel kayda işleyip görünümü tazeliyoruz.
      const updated: OutgoingDocumentModel = { ...d, ...body, externalInstitutonId: body.externalInstitutonId };
      this.documentDetailRaw = updated;
      this.documentDetail.set(this.buildDocumentDetailView(updated));
      this.documentDetailEditing.set(false);
      this.#toast.showToast('Başarılı', 'Evrak bilgisi güncellendi', 'success');
    } catch (err) {
      this.#toast.showToast('Hata', 'Evrak güncellenemedi', 'error');
      console.error('Evrak güncelleme hatası:', err);
    } finally {
      this.documentDetailSaving.set(false);
      this.cdr.markForCheck();
    }
  }

  private buildDocumentDetailView(d: OutgoingDocumentModel): DocumentDetailView {
    const departmentName = this.departments?.find(x => x.id === d.departmentId)?.name;
    const institutionName = this.externalInstitutions.find(x => x.id === d.externalInstitutonId)?.name;
    const formatDate = (value?: string) => {
      if (!value) return '-';
      const date = new Date(value);
      return isNaN(date.getTime()) ? '-' : date.toLocaleDateString('tr-TR');
    };
    const labelOf = (map: Record<number, string>, value?: number) =>
      value != null && map[value] ? map[value] : '-';

    const subject = (d.subject ?? '').trim();
    const currentUserId = this.user()?.id;

    return {
      subject: subject || 'Konu belirtilmemiş',
      hasSubject: !!subject,
      // source 1: Evrak Takip / manuel kayıt (Atlas'tan gelenler düzenlenemez)
      canEdit: d.source === 1 && !!currentUserId && d.createdUserId === currentUserId,
      statusLabel: labelOf(this.outgoingStatusLabels, d.status),
      statusClass: (d.status != null && OutgoingDocumentStatusBadgeClass[d.status]) || '',
      typeLabel: labelOf(DocumentTypeLabels, d.type),
      dateLabel: formatDate(d.documentDate),
      rows: [
        { label: 'Orijinal Belge No', value: d.originalDocumentNumber || '-' },
        { label: 'Gereği / Bilgi', value: actionRequiredLabel(d.actionRequired) },
        { label: 'Gizlilik Derecesi', value: labelOf(SecurityDegreeLabels, d.securityDegree) },
        { label: 'İvedilik', value: labelOf(UrgencyDegreeLabels, d.urgencyDegree) },
        { label: 'Nereden', value: departmentName || '-' },
        { label: 'Nereye', value: institutionName || '-' }
      ]
    };
  }

  // Model tipini EnvelopeModel olarak ayarladık
  model: Partial<EnvelopeModel> = {
    externalInstitutionId: '',
    departmentId: undefined,
    createdByUserId: '',
    unitName: '',
    address: '',
    envelopeNo: ''
  };

  ngOnInit(): void {
    this.loadExternalInstitutions();

    const envelopeId = this.envelopeService.currentEnvelopeId;
    if (envelopeId) {
      this.loadEnvelopeDetail(envelopeId);
      this.envelopeService.clearSelectedEnvelope();
    }
  }

  private loadEnvelopeDetail(envelopeId: string) {
    this.envelopeService.getEnvelopeById(envelopeId).subscribe({
      next: (res: EnvelopeModel) => {
        if (res) {
          this.previewEnvelope = res;
          this.selectedEnvelope = res;
          this.isViewMode = true;
          this.cdr.markForCheck();
          this.focusQrInputSoon();
          this.loadEnvelopeDocuments(envelopeId);

          // GetById uçları, GetAll'ın aksine kurum adını (externalInstitutionName)
          // join'lemeden dönüyor; yalnızca id geldiği için burada ayrıca çekiyoruz.
          if (!res.externalInstitutionName && res.externalInstitutionId) {
            this.externalInstitutionService.getExternalInstitutionById(res.externalInstitutionId).subscribe({
              next: (institution) => {
                if (this.previewEnvelope === res) {
                  this.previewEnvelope = { ...res, externalInstitutionName: institution.name };
                  this.cdr.markForCheck();
                }
              }
            });
          }
        }
      },
      error: (err) => {
        this.#toast.showToast('Hata', 'Zarf bilgileri yüklenemedi', 'error');
        console.error(err);
      }
    });
  }

  private async loadEnvelopeDocuments(envelopeId: string) {
    this.loading = true;
    this.cdr.markForCheck();

    try {
      this.documents = await this.envelopeDocumentService.getEnvelopeDocumentsByEnvelopeId(envelopeId);
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  private loadExternalInstitutions() {
    this.externalInstitutionService.getExternalInstitutions().subscribe({
      next: (res) => {
        this.externalInstitutions = res;
      },
      error: (err) => {
        console.error(err);
      }
    });
  }

  previewEnvelope: EnvelopeModel | null = null;

  createEnvelope() {

    const userId = this.user()?.id;
    if (!userId) {
      this.#toast.showToast("Hata", "Kullanıcı bilgisi alınamadı", "error");
      return;
    }

    if (this.externalInstitutionControl.value) {
      this.model.externalInstitutionId = this.externalInstitutionControl.value.id;
    }
    this.model.createdByUserId = userId;
    this.model.departmentId = this.user()?.departmentId;

    //console.log(this.model);
    this.envelopeService.createEnvelope(this.model as EnvelopeModel).subscribe({
      next: (res: EnvelopeModel) => {
        if (res) {
          this.previewEnvelope = res;
          this.selectedEnvelope = res;
          this.cdr.markForCheck();
          this.focusQrInputSoon();
          this.#toast.showToast('Bilgi', 'Etiket Oluşturuldu', 'success');

          // Formu temizleme
          this.model = {
            id: '',
            envelopeNo: '',
            createdByUserId: '',
            externalInstitutionId: undefined,
            departmentId: undefined,
            unitName: '',
            address: ''
          };

          // Autocomplete kontrolünü temizle
          this.externalInstitutionControl.setValue(null);
        }
      },
      error: (err) => {
        this.#toast.showToast('Hata', 'Etiket oluşturulamadı', 'error');
        console.error(err);
      }
    });
  }

  previewData: any;

  openPreview() {
    if (!this.previewEnvelope) return;

    this.previewData = {
      ...this.previewEnvelope,
      departmentName: this.user()?.departmentName
    };

    this.previewOpen = true;
  }

  directPrint() {
    const element = document.getElementById('print-area');
    if (!element) return;

    const opt: any = {
      margin: 0,
      filename: 'zarf-etiketi.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 3, useCORS: true, scrollY: -window.scrollY },
      jsPDF: { unit: 'mm', format: [110, 106], orientation: 'landscape' }
    };

    html2pdf()
      .from(element)
      .set(opt)
      .outputPdf('blob')
      .then((pdfBlob: Blob) => {

        const blobUrl = URL.createObjectURL(pdfBlob);

        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = blobUrl;

        document.body.appendChild(iframe);

        iframe.onload = () => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        };
      });

  }

// Ticket component içinde
loadingRemove = false; // yeni değişken

async removeDocument(id: string) {
  try {
    this.loadingRemove = true;
    this.cdr.markForCheck();

    await firstValueFrom(this.envelopeDocumentService.removeEnvelopeDocument(id));

    // Evrak listesinden çıkar
    this.documents = this.documents.filter(x => x.id !== id);

  } catch (error) {
    this.#toast.showToast('Hata', 'Evrak çıkarılamadı', 'error');
    console.error(error);
  } finally {
    this.loadingRemove = false;
    this.cdr.markForCheck();
  }
}
}