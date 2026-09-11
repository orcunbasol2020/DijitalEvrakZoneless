import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import GenericModel from '../../../../components/generic-model/generic-model';
import { FlexiToastService } from 'flexi-toast';
import { EnvelopeDocumentService } from '../../../services/envelopedocument';
import { forkJoin } from 'rxjs';
import { ZimmetStateService } from '../../../services/zimmet-state-service';
import { EnvelopeModel } from '../../../models/envelope.model';
import { EnvelopeService } from '../../../services/envelope';
import { ExternalInstitution, ExternalInstitutionModel } from '../../../services/external-institution';
import { ExternalUserService, ExternalUserModel, initialExternalUser } from '../../../services/external-user';
import { OutgoingDocumentAllocation } from '../../../services/outgoingdocumentallocation';
import { Common } from '../../../services/common';
import { httpResource } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

@Component({
  imports: [
    GenericModel,
    CommonModule,
    FormsModule
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

  readonly externalUsersResult = httpResource<ExternalUserModel[]>(() => "api/ExternalUsers/GetAll");
  readonly personList = computed(() => {
    const institutionId = this.externalInstitutionId();
    if (!institutionId) return [];

    return (this.externalUsersResult.value() ?? [])
      .filter(x => !x.isDeleted && x.isActive && x.externalInstitutionId === institutionId);
  });

  readonly personSearch = signal('');
  readonly filteredPersonList = computed(() => {
    const term = this.personSearch().trim().toLocaleLowerCase('tr');
    const list = this.personList();
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
        } else {
          this.delivered.set(false);
        }
      },
      error: () => this.delivered.set(false)
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

  initials(p: ExternalUserModel): string {
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

  // OutgoingDocumentAllocations.OutgoingDocumentId alanına, EnvelopeDocuments
  // tablosunun kendi id'si (doc.id) değil, evrakın gerçek DocumentId'si (doc.documentId)
  // yazılmalı.
  const requests = docsToProcess.map(doc =>
    this.allocationService.createAllocation({
      outgoingDocumentId: doc.documentId,
      userId: this.selectedPersonId()!,
      createdUserId,
      status: '2',
      userType: 2
    })
  );

  forkJoin(requests).subscribe({
    next: () => {
      this.toast.showToast('Başarılı', 'Evraklar teslim edildi', 'info');

      const person = this.personList().find(p => p.id === this.selectedPersonId());
      this.deliveredPersonName.set(person ? `${person.name} ${person.surname}` : null);
      const currentUser = this.user();
      this.deliveredByPersonName.set(currentUser ? `${currentUser.name} ${currentUser.surname}` : null);
      this.deliveredDate.set(new Date());
      this.deliveredJustNow.set(true);
      this.delivered.set(true);

      this.selectedDocuments = [];
      this.loadDocuments(this.state.getEnvelopeId()!);
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
    this.state.clear();
    this.router.navigate(['/envelope']);
  }

  openQuickAddModal() {
    this.quickAddForm = { ...initialExternalUser, externalInstitutionId: this.externalInstitutionId() };
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
}