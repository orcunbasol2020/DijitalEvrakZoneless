import { ChangeDetectionStrategy, Component, computed, effect, inject, OnInit, signal, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import GenericModel from '../../../../components/generic-model/generic-model';
import { FlexiToastService } from 'flexi-toast';
import { EnvelopeDocumentService } from '../../../services/envelopedocument';
import { forkJoin } from 'rxjs';
import { ZimmetStateService } from '../../../services/zimmet-state-service';
import { EnvelopeModel, envelopeStatusForZimmetMode } from '../../../models/envelope.model';
import { EnvelopeService } from '../../../services/envelope';
import { ExternalInstitution, ExternalInstitutionModel } from '../../../services/external-institution';
import { ExternalUserService, ExternalUserModel, initialExternalUser } from '../../../services/external-user';
import { OutgoingDocumentAllocation } from '../../../services/outgoingdocumentallocation';
import { OutgoingDocumentAllocationModel } from '../../../models/outgoingdocumentallocation.model';
import { AllocationStatusEnum } from '../../../models/allocationstatus.model';
import { Common } from '../../../services/common';
import { httpResource } from '@angular/common/http';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { QRCodeComponent } from 'angularx-qrcode';
import { UserModel } from '../../users/users';
import { SimpleAutocompleteComponent } from '../../simpleautocomplete/simpleautocomplete';

type ZimmetMode = 'self' | 'internal' | 'external';
type PersonListItem = { id: string; name: string; surname: string; identityNo?: string; email?: string };

@Component({
  imports: [
    GenericModel,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SimpleAutocompleteComponent,
    QRCodeComponent
  ],
  templateUrl: './gidenzimmet.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Gidenzimmet implements OnInit {
  private envelopeService = inject(EnvelopeService);
  private externalService = inject(ExternalInstitution);
  private state = inject(ZimmetStateService);
  private envelopeDocumentService = inject(EnvelopeDocumentService);
  private externalUserService = inject(ExternalUserService);
  private allocationService = inject(OutgoingDocumentAllocation);
  private toast = inject(FlexiToastService);
  private router = inject(Router);
  readonly #common = inject(Common);
  readonly user = computed(() => this.#common.user());
  readonly selectedPersonId = signal<string | null>(null);

  // ---- Zimmetle paneli: gidenevrak/zimmet ekranıyla aynı mod seçimi ----
  readonly mode = signal<ZimmetMode>('external');
  readonly selectedInstitutionId = signal<string | null>(null);

  readonly usersResult = httpResource<UserModel[]>(() => "api/Users/GetAll");
  readonly internalUserList = computed<PersonListItem[]>(() =>
    (this.usersResult.value() ?? []).filter((x): x is UserModel & { id: string } => !!x.id && !x.isDeleted && x.isActive)
  );

  readonly institutionsResult = httpResource<ExternalInstitutionModel[]>(() => "api/ExternalInstitutions/GetAll");
  readonly institutionList = computed(() =>
    (this.institutionsResult.value() ?? []).filter(x => !x.isDeleted)
  );

  // Kurumlar parentId ile hiyerarşik olabildiğinden, autocomplete listesinde
  // üst kurumun hemen altına alt kurumlar girintili şekilde sıralanır.
  readonly institutionOptions = computed(() => {
    const list = this.institutionList();
    const byParent = new Map<string | null, ExternalInstitutionModel[]>();

    for (const inst of list) {
      const key = list.some(p => p.id === inst.parentId) ? inst.parentId! : null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(inst);
    }
    for (const group of byParent.values()) {
      group.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    }

    const result: { id: string; name: string; level: number }[] = [];
    const addChildren = (parentId: string | null, level: number) => {
      for (const inst of byParent.get(parentId) ?? []) {
        result.push({ id: inst.id, name: inst.name, level });
        addChildren(inst.id, level + 1);
      }
    };
    addChildren(null, 0);

    return result;
  });
  readonly institutionControl = new FormControl<{ id: string, name: string } | null>(null);

  readonly externalUsersResult = httpResource<ExternalUserModel[]>(() => "api/ExternalUsers/GetAll");
  readonly externalPersonList = computed<PersonListItem[]>(() => {
    const institutionId = this.selectedInstitutionId();
    if (!institutionId) return [];

    return (this.externalUsersResult.value() ?? [])
      .filter(x => !x.isDeleted && x.isActive && x.externalInstitutionId === institutionId);
  });

  readonly currentPersonList = computed<PersonListItem[]>(() =>
    this.mode() === 'internal' ? this.internalUserList() : this.externalPersonList()
  );

  readonly personSearch = signal('');
  readonly filteredPersonList = computed(() => {
    const term = this.personSearch().trim().toLocaleLowerCase('tr');
    const list = this.currentPersonList();
    if (!term) return list;

    return list.filter(p =>
      `${p.name} ${p.surname}`.toLocaleLowerCase('tr').includes(term) ||
      (p.identityNo ?? '').toLocaleLowerCase('tr').includes(term)
    );
  });

  readonly documents = signal<any[]>([]);
  selectedDocuments: any[] = [];
  externalName = signal<string | null>(null);
  externalType = signal<number | null>(null);
  externalInstitutionId = signal<string | null>(null);
  showFilters = false;
  readonly loading = signal(false);
  readonly envelopeLabelVisible = signal(false);

  searchTerm = '';
  searchVisible = false;
  sortField: 'qrCode' | 'createdDate' = 'createdDate';
  sortDirection: 'asc' | 'desc' = 'desc';

  get filteredDocuments() {
    const term = this.searchTerm.trim().toLowerCase();
    const docs = this.documents();
    const filtered = term
      ? docs.filter(doc => doc.qrCode?.toLowerCase().includes(term))
      : docs;

    const dir = this.sortDirection === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (this.sortField === 'qrCode') {
        return a.qrCode.localeCompare(b.qrCode) * dir;
      }
      return (new Date(a.createdDate).getTime() - new Date(b.createdDate).getTime()) * dir;
    });
  }

  toggleSort(field: 'qrCode' | 'createdDate') {
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDirection = 'asc';
    }
  }

  readonly quickAddModalVisible = signal(false);
  readonly quickAddSaving = signal(false);
  quickAddForm: ExternalUserModel = { ...initialExternalUser };

  // delivered: bu zarf (daha önce ya da az önce) teslim edilmiş mi.
  // deliveredJustNow: teslim işlemi bu oturumda az önce yapıldıysa true.
  readonly delivered = signal(false);
  readonly deliveredJustNow = signal(false);
  readonly deliveredPersonName = signal<string | null>(null);
  readonly deliveredByPersonName = signal<string | null>(null);
  readonly deliveredDate = signal<string | Date | null>(null);

  // Islak imzalı belge (taranmış, imzalı zimmet formu) bilgileri
  readonly wetSignedAllocationId = signal<string | null>(null);
  readonly wetSignedFileName = signal<string | null>(null);
  readonly wetSignedUploadDate = signal<string | Date | null>(null);
  readonly wetSignedUploadedBy = signal<string | null>(null);
  readonly wetSignedUploading = signal(false);

  // Zarftaki evraklar ayrı ayrı zimmetleniyor; ıslak imzalı belge, teslim
  // durumu takibinde kullanılan ilk evrağın allocation kaydına bağlanıyor.
  readonly primaryDocumentId = computed(() => this.documents()[0]?.documentId ?? null);

  constructor() {
    // "Kendim" modundayken seçili kişi her zaman oturum açan kullanıcı olsun.
    effect(() => {
      if (this.mode() === 'self') {
        this.selectedPersonId.set(this.user()?.id ?? null);
      }
    });

    // Seçili kurum değiştiğinde arama kutusunda gösterilen seçimi de eşitle.
    effect(() => {
      const id = this.selectedInstitutionId();
      const match = id ? this.institutionOptions().find(o => o.id === id) ?? null : null;
      if (this.institutionControl.value?.id !== match?.id) {
        this.institutionControl.setValue(match, { emitEvent: false });
      }
    });

    this.institutionControl.valueChanges.subscribe(value => {
      this.selectInstitution(value?.id ?? null);
    });
  }

  setMode(mode: ZimmetMode): void {
    if (this.mode() === mode) return;
    this.mode.set(mode);
    this.selectedPersonId.set(mode === 'self' ? this.user()?.id ?? null : null);
    this.selectedInstitutionId.set(mode === 'external' ? this.externalInstitutionId() : null);
    this.personSearch.set('');
  }

  selectInstitution(id: string | null): void {
    this.selectedInstitutionId.set(id);
    this.selectedPersonId.set(null);
  }

  get selfInitials(): string {
    const u = this.user();
    return `${u?.name?.charAt(0) ?? ''}${u?.surname?.charAt(0) ?? ''}`.toLocaleUpperCase('tr');
  }

  ngOnInit(): void {
    const envelopeId = this.state.getEnvelopeId();

    if (!envelopeId) {
      this.toast.showToast('Hata', 'EnvelopeId bulunamadı', 'error');
      return;
    }


    this.envelopeService.getEnvelopeById(envelopeId).subscribe({
      next: (res: EnvelopeModel) => {
        console.log(res);
        if (res) {
          this.previewEnvelope.set(res);
          this.loadDocuments(envelopeId);

          //giden kurum bilgisi cekiliyor
          if (res.externalInstitutionId) {
            console.log("external : " + res.externalInstitutionId)
            this.externalInstitutionId.set(res.externalInstitutionId);
            if (this.mode() === 'external') {
              this.selectedInstitutionId.set(res.externalInstitutionId);
            }
            this.externalService.getExternalInstitutionById(res.externalInstitutionId).subscribe({
              next: (result: ExternalInstitutionModel) => {
                this.externalName.set(result.name);
                this.externalType.set(result.type);
              }
            });
          }
        }
      }
    });

  }

  async loadDocuments(envelopeId: string) {
    this.loading.set(true);

    try {
      const docs = await this.envelopeDocumentService
        .getEnvelopeDocumentsByEnvelopeId(envelopeId);
      docs.sort((a, b) => new Date(a.createdDate ?? 0).getTime() - new Date(b.createdDate ?? 0).getTime());
      this.documents.set(docs);
      this.checkAlreadyDelivered(docs);
    } catch {
      this.toast.showToast('Hata', 'Evraklar yüklenemedi', 'error');
    } finally {
      this.loading.set(false);
    }
  }

  // Zarf daha önce teslim edilmişse (sayfa yeniden açıldığında da) teslim
  // bilgilerini göster.
  private checkAlreadyDelivered(docs: any[]): void {
    if (this.deliveredJustNow()) return;

    const firstDoc = docs[0];
    if (!firstDoc?.documentId) {
      this.delivered.set(false);
      return;
    }

    this.allocationService.getActiveByDocumentId(firstDoc.documentId).subscribe({
      next: (allocation) => {
        if (allocation?.isActive) {
          this.delivered.set(true);
          this.deliveredPersonName.set(allocation.fullName ?? null);
          this.deliveredByPersonName.set(allocation.createdFullName ?? null);
          this.deliveredDate.set(allocation.createdDate ?? null);
          this.applyWetSignedInfo(allocation);
        } else {
          this.delivered.set(false);
        }
      },
      error: () => this.delivered.set(false)
    });
  }

  // Bir allocation kaydındaki ıslak imzalı belge bilgilerini state'e yansıtır.
  private applyWetSignedInfo(allocation: OutgoingDocumentAllocationModel | null): void {
    this.wetSignedAllocationId.set(allocation?.id ?? null);
    this.wetSignedFileName.set(allocation?.wetSignedDocumentFileName ?? null);
    this.wetSignedUploadDate.set(allocation?.wetSignedDocumentUploadDate ?? null);
    this.wetSignedUploadedBy.set(allocation?.wetSignedDocumentUploadedByFullName ?? null);
  }

  // Teslim işlemi bu oturumda az önce yapıldığında checkAlreadyDelivered erken
  // döndüğü için, allocation id'sini (ve varsa ıslak imzalı belge bilgisini)
  // almak amacıyla ayrıca çağrılır.
  private refreshWetSignedInfo(documentId: string): void {
    this.allocationService.getActiveByDocumentId(documentId).subscribe({
      next: (allocation) => this.applyWetSignedInfo(allocation),
      error: () => this.applyWetSignedInfo(null)
    });
  }

  toggleSelection(doc: any) {
    const exists = this.selectedDocuments.find(x => x.qrCode === doc.qrCode);

    if (exists) {
      this.selectedDocuments = this.selectedDocuments.filter(x => x.qrCode !== doc.qrCode);
    } else {
      this.selectedDocuments = [...this.selectedDocuments, doc];
    }
  }

  selectPerson(id: string): void {
    this.selectedPersonId.set(this.selectedPersonId() === id ? null : id);
  }

  initials(p: PersonListItem): string {
    return `${p.name?.charAt(0) ?? ''}${p.surname?.charAt(0) ?? ''}`.toLocaleUpperCase('tr');
  }

addZimmet() {

  if (!this.selectedPersonId()) {
    this.toast.showToast('Hata', 'Personel seçilmedi', 'error');
    return;
  }

  // 👉 Selection varsa onu kullan, yoksa tüm listeyi
  const docsToProcess = this.selectedDocuments.length > 0
    ? this.selectedDocuments
    : this.documents();

  if (docsToProcess.length === 0) {
    this.toast.showToast('Hata', 'Zimmetlenecek evrak yok', 'error');
    return;
  }

  const createdUserId = this.user()?.id;
  if (!createdUserId) {
    this.toast.showToast('Hata', 'Kullanıcı bilgisi alınamadı', 'error');
    return;
  }

  const userType = this.mode() === 'internal' ? 1 : 2;

  // OutgoingDocumentAllocations.OutgoingDocumentId alanına, EnvelopeDocuments
  // tablosunun kendi id'si (doc.id) değil, evrakın gerçek DocumentId'si (doc.documentId)
  // yazılmalı.
  const requests = docsToProcess.map(doc =>
    this.allocationService.createAllocation({
      outgoingDocumentId: doc.documentId,
      userId: this.selectedPersonId()!,
      createdUserId,
      status: AllocationStatusEnum.Devir,
      userType
    })
  );

  forkJoin(requests).subscribe({
    next: () => {
      this.toast.showToast('Başarılı', 'Evraklar teslim edildi', 'info');

      const person = this.mode() === 'self'
        ? this.user()
        : this.currentPersonList().find(p => p.id === this.selectedPersonId());
      this.deliveredPersonName.set(person ? `${person.name} ${person.surname}` : null);
      const currentUser = this.user();
      this.deliveredByPersonName.set(currentUser ? `${currentUser.name} ${currentUser.surname}` : null);
      this.deliveredDate.set(new Date());
      this.deliveredJustNow.set(true);
      this.delivered.set(true);

      this.selectedDocuments = [];
      const envelopeId = this.state.getEnvelopeId()!;
      this.loadDocuments(envelopeId);
      this.refreshWetSignedInfo(docsToProcess[0].documentId);

      // Zarfın durumu da moda göre güncellenir
      // (Teslim Al / Zimmetle: Evrak Birimde, Teslim Et: Teslim Edildi).
      this.envelopeService.updateEnvelopeStatus(envelopeId, envelopeStatusForZimmetMode(this.mode())).subscribe({
        error: (err) => {
          console.error('Zarf durumu güncellenemedi:', err);
          this.toast.showToast('Uyarı', 'Evraklar teslim edildi ancak zarf durumu güncellenemedi', 'warning');
        }
      });
    },
    error: () => {
      this.toast.showToast('Hata', 'Teslim işlemi başarısız', 'error');
    }
  });
}
  reset() {
    this.documents.set([]);
    this.selectedDocuments = [];
    this.delivered.set(false);
    this.deliveredJustNow.set(false);
    this.deliveredPersonName.set(null);
    this.deliveredByPersonName.set(null);
    this.deliveredDate.set(null);
    this.applyWetSignedInfo(null);
    this.envelopeLabelVisible.set(false);
    this.searchVisible = false;
    this.searchTerm = '';
    this.mode.set('external');
    this.selectedInstitutionId.set(this.externalInstitutionId());
    this.selectedPersonId.set(null);
    this.personSearch.set('');
    this.state.clear();
    this.router.navigate(['/envelope']);
  }

  openQuickAddModal() {
    this.quickAddForm = { ...initialExternalUser, externalInstitutionId: this.selectedInstitutionId() };
    this.quickAddModalVisible.set(true);
  }

  closeQuickAddModal() {
    if (this.quickAddSaving()) return;
    this.quickAddModalVisible.set(false);
  }

  saveQuickAddPerson() {
    if (!this.quickAddForm.name?.trim() || !this.quickAddForm.surname?.trim()) {
      this.toast.showToast('Uyarı', 'Ad ve soyad zorunludur', 'warning');
      return;
    }

    if (!this.quickAddForm.email?.trim()) {
      this.toast.showToast('Uyarı', 'E-posta zorunludur', 'warning');
      return;
    }

    if (!this.quickAddForm.externalInstitutionId) {
      this.toast.showToast('Hata', 'Kurum bilgisi bulunamadı', 'error');
      return;
    }

    this.quickAddSaving.set(true);

    const body: Partial<ExternalUserModel> = {
      name: this.quickAddForm.name,
      surname: this.quickAddForm.surname,
      email: this.quickAddForm.email,
      identityNo: this.quickAddForm.identityNo,
      userType: this.quickAddForm.userType,
      externalInstitutionId: this.quickAddForm.externalInstitutionId,
      isActive: true
    };

    this.externalUserService.create(body).subscribe({
      next: () => {
        this.toast.showToast('Başarılı', 'Personel eklendi', 'success');
        this.quickAddSaving.set(false);
        this.quickAddModalVisible.set(false);
        this.externalUsersResult.reload();
      },
      error: () => {
        this.quickAddSaving.set(false);
        this.toast.showToast('Hata', 'Personel eklenemedi', 'error');
      }
    });
  }

  readonly previewEnvelope = signal<EnvelopeModel | null>(null);

  private static readonly wetSignedAllowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.tif', '.tiff'];
  private static readonly wetSignedMaxSizeBytes = 20 * 1024 * 1024;

  onWetSignedFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    // Aynı dosyanın tekrar seçilebilmesi için input'u temizle
    input.value = '';

    if (!file) return;

    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!Gidenzimmet.wetSignedAllowedExtensions.includes(extension)) {
      this.toast.showToast('Hata', 'Desteklenmeyen dosya türü. İzin verilenler: PDF, JPG, PNG, TIFF', 'error');
      return;
    }

    if (file.size > Gidenzimmet.wetSignedMaxSizeBytes) {
      this.toast.showToast('Hata', "Dosya boyutu 20 MB'ı geçemez", 'error');
      return;
    }

    const documentId = this.primaryDocumentId();
    if (!documentId) {
      this.toast.showToast('Hata', 'Evrak bilgisi bulunamadı', 'error');
      return;
    }

    this.wetSignedUploading.set(true);
    this.allocationService.uploadWetSignedDocument(documentId, file, this.user()?.id).subscribe({
      next: (res) => {
        this.wetSignedUploading.set(false);

        // Backend, iş kuralı ihlallerinde (ör. evrak henüz zimmetlenmedi) de
        // HTTP 200 dönüp hatayı mesaj gövdesinde iletiyor; bu yüzden gerçekten
        // kaydedilip kaydedilmediğini mesaj içeriğinden anlamamız gerekiyor.
        const message = res?.message ?? '';
        if (message.includes('başarıyla')) {
          this.toast.showToast('Başarılı', message, 'success');
          this.refreshWetSignedInfo(documentId);
        } else {
          this.toast.showToast('Uyarı', message || 'Islak imzalı belge yüklenemedi', 'warning');
        }
      },
      error: () => {
        this.wetSignedUploading.set(false);
        this.toast.showToast('Hata', 'Islak imzalı belge yüklenemedi', 'error');
      }
    });
  }

  downloadWetSignedDocument(): void {
    const allocationId = this.wetSignedAllocationId();
    if (!allocationId) return;

    window.open(this.allocationService.getWetSignedDownloadUrl(allocationId), '_blank');
  }
}