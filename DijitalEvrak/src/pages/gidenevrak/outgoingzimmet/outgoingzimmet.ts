import { ChangeDetectionStrategy, Component, computed, effect, inject, OnInit, signal, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { httpResource } from '@angular/common/http';
import GenericModel from '../../../../components/generic-model/generic-model';
import { FlexiToastService } from 'flexi-toast';
import { ZimmetStateService } from '../../../services/zimmet-state-service';
import { OutgoingDocumentService } from '../../../services/outgoingdocument';
import { OutgoingDocumentModel, OutgoingDocumentStatus } from '../../../models/outgoingdocument.model';
import { OutgoingDocumentAllocation } from '../../../services/outgoingdocumentallocation';
import { AllocationStatusEnum } from '../../../models/allocationstatus.model';
import { ExternalInstitutionModel } from '../../../services/external-institution';
import { DepartmentModel } from '../../../services/department';
import { ExternalUserService, ExternalUserModel, initialExternalUser } from '../../../services/external-user';
import { Common } from '../../../services/common';
import { UserModel } from '../../users/users';
import { SimpleAutocompleteComponent } from '../../simpleautocomplete/simpleautocomplete';

type ZimmetMode = 'internal' | 'external';
type PersonListItem = { id: string; name: string; surname: string; identityNo?: string; email?: string };

@Component({
  imports: [
    GenericModel,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SimpleAutocompleteComponent
  ],
  templateUrl: './outgoingzimmet.html',
  // Soldaki evrak özeti (koyu hero) Teslim Bilgisi (gidenzimmet) ekranıyla
  // aynı dili kullanır; zm-* ve gz-* sınıfları oradan gelir.
  styleUrls: ['../zimmet/zimmet.css', '../gidenzimmet/gidenzimmet.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Outgoingzimmet implements OnInit {
  private outgoingDocumentService = inject(OutgoingDocumentService);
  private allocationService = inject(OutgoingDocumentAllocation);
  private externalUserService = inject(ExternalUserService);
  private state = inject(ZimmetStateService);
  private toast = inject(FlexiToastService);
  private router = inject(Router);
  readonly #common = inject(Common);
  readonly user = computed(() => this.#common.user());

  readonly document = signal<OutgoingDocumentModel | null>(null);
  readonly loading = signal(false);

  readonly statusLabelMap: Record<number, string> = {
    [OutgoingDocumentStatus.Taslak]: 'Ön Kayıt',
    [OutgoingDocumentStatus.Gonderildi]: 'Gönderildi',
    [OutgoingDocumentStatus.TeslimEdildi]: 'Teslim Edildi',
    [OutgoingDocumentStatus.Iade]: 'İade'
  };

  // Evrak özeti (koyu hero) üzerindeki durum rozeti; Teslim Bilgisi ekranındaki
  // zarf durumu rozetiyle aynı "envelope-status-pill" stilini kullanır.
  readonly statusPillClassMap: Record<number, string> = {
    [OutgoingDocumentStatus.Taslak]: '',
    [OutgoingDocumentStatus.Gonderildi]: 'envelope-status-yeni',
    [OutgoingDocumentStatus.TeslimEdildi]: 'envelope-status-teslim',
    [OutgoingDocumentStatus.Iade]: 'envelope-status-iade'
  };

  readonly documentTypeLabelMap: Record<number, string> = {
    1: 'Nota',
    2: 'Evrak'
  };

  // Backend AllocationSourceEnum ile birebir: 1: Evrak Takip (bu sistemden manuel girilen kayıt), 2: Atlas'tan aktarılan kayıt.
  readonly sourceLabelMap: Record<number, string> = {
    1: 'Evrak Takip',
    2: 'Atlas'
  };

  readonly mode = signal<ZimmetMode>('internal');
  readonly selectedPersonId = signal<string | null>(null);
  readonly personSearch = signal('');
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

  // Belgenin gönderen/alan birim bilgilerini isim olarak göstermek için.
  readonly departmentsResult = httpResource<DepartmentModel[]>(() => "api/Departments/GetAll");

  readonly senderDepartmentName = computed(() => {
    const departmentId = this.document()?.departmentId;
    if (!departmentId) return null;
    return (this.departmentsResult.value() ?? []).find(d => d.id === departmentId)?.name ?? null;
  });

  readonly receiverInstitutionName = computed(() => {
    const institutionId = this.document()?.externalInstitutonId;
    if (!institutionId) return null;
    return this.institutionList().find(i => i.id === institutionId)?.name ?? null;
  });

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

  readonly filteredPersonList = computed(() => {
    const term = this.personSearch().trim().toLocaleLowerCase('tr');
    const list = this.currentPersonList();
    if (!term) return list;

    return list.filter(p =>
      `${p.name} ${p.surname}`.toLocaleLowerCase('tr').includes(term) ||
      (p.identityNo ?? '').toLocaleLowerCase('tr').includes(term)
    );
  });

  readonly selectedInstitutionName = computed(() => {
    const id = this.selectedInstitutionId();
    if (!id) return null;
    return this.institutionList().find(i => i.id === id)?.name ?? null;
  });

  readonly quickAddModalVisible = signal(false);
  readonly quickAddSaving = signal(false);
  quickAddForm: ExternalUserModel = { ...initialExternalUser };

  // Zimmetleme sırasında butonu kilitlemek için.
  readonly saving = signal(false);

  constructor() {
    // Belgenin kurumu (ör. daha önce kayıtlı dış kurum) değiştiğinde arama
    // kutusunda gösterilen seçimi de eşitle.
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

  ngOnInit(): void {
    const outgoingDocumentId = this.state.getOutgoingDocumentId();

    if (!outgoingDocumentId) {
      this.toast.showToast('Hata', 'Giden evrak bulunamadı', 'error');
      return;
    }

    this.loadDocument(outgoingDocumentId);
  }

  loadDocument(id: string): void {
    this.loading.set(true);

    this.outgoingDocumentService.getById(id).subscribe({
      next: (doc) => {
        this.document.set(doc);
        this.loading.set(false);

        if (doc.externalInstitutonId) {
          this.selectedInstitutionId.set(doc.externalInstitutonId);
          this.mode.set('external');
        }

        this.checkAlreadyDelivered(id);
      },
      error: () => {
        this.loading.set(false);
        this.toast.showToast('Hata', 'Evrak bulunamadı', 'error');
      }
    });
  }

  // Evrak daha önce zimmetlenmişse bu ekranda yapılacak işlem yoktur;
  // Teslim Bilgisi ekranına yönlendirilir.
  private checkAlreadyDelivered(outgoingDocumentId: string): void {
    this.allocationService.getActiveByDocumentId(outgoingDocumentId).subscribe({
      next: (allocation) => {
        if (allocation?.isActive) {
          this.goToTeslimInfo();
        }
      }
    });
  }

  private goToTeslimInfo(): void {
    this.router.navigate(['/gidenevrak/outgoingteslim']);
  }

  setMode(mode: ZimmetMode): void {
    if (this.mode() === mode) return;
    this.mode.set(mode);
    this.selectedPersonId.set(null);
    this.personSearch.set('');
  }

  selectInstitution(id: string | null): void {
    this.selectedInstitutionId.set(id);
    this.selectedPersonId.set(null);
  }

  selectPerson(id: string): void {
    this.selectedPersonId.set(this.selectedPersonId() === id ? null : id);
  }

  initials(p: PersonListItem): string {
    return `${p.name?.charAt(0) ?? ''}${p.surname?.charAt(0) ?? ''}`.toLocaleUpperCase('tr');
  }

  addZimmet(): void {
    if (!this.selectedPersonId()) {
      this.toast.showToast('Hata', 'Personel seçilmedi', 'error');
      return;
    }

    const doc = this.document();
    if (!doc) {
      this.toast.showToast('Hata', 'Evrak bilgisi alınamadı', 'error');
      return;
    }

    const createdUserId = this.user()?.id;
    if (!createdUserId) {
      this.toast.showToast('Hata', 'Kullanıcı bilgisi alınamadı', 'error');
      return;
    }

    if (this.saving()) return;
    this.saving.set(true);

    this.allocationService.createAllocation({
      outgoingDocumentId: doc.id,
      userId: this.selectedPersonId()!,
      createdUserId,
      status: AllocationStatusEnum.Devir,
      userType: this.mode() === 'internal' ? 1 : 2
    }).subscribe({
      next: () => {
        this.saving.set(false);
        const person = this.currentPersonList().find(p => p.id === this.selectedPersonId());
        const personName = person ? `${person.name} ${person.surname}` : null;
        const docLabel = doc.qrCode ? `${doc.qrCode} numaralı evrak` : 'Evrak';

        // Sonuç mesajı moda göre: iç kullanıcıya zimmet mi, dış kurum personeline teslim mi.
        if (this.mode() === 'external') {
          const institution = this.selectedInstitutionName();
          const receiver = personName && institution
            ? `${institution} personeli ${personName} adlı kişiye`
            : personName ? `${personName} adlı kişiye` : 'dış kuruma';
          this.toast.showToast('Teslim Edildi', `${docLabel} ${receiver} teslim edildi.`, 'success');
        } else {
          this.toast.showToast(
            'Zimmetlendi',
            `${docLabel} ${personName ? `${personName} adlı kullanıcıya` : 'seçilen kullanıcıya'} zimmetlendi.`,
            'success'
          );
        }

        // Zimmet bilgileri ayrı ekranda (Teslim Bilgisi) gösterilir.
        this.goToTeslimInfo();
      },
      error: () => {
        this.saving.set(false);
        this.toast.showToast('Hata', 'Zimmetleme başarısız', 'error');
      }
    });
  }

  reset(): void {
    this.state.clearOutgoingDocumentId();
    this.router.navigate(['/gidenevrak/outgoing']);
  }

  openQuickAddModal(): void {
    this.quickAddForm = { ...initialExternalUser, externalInstitutionId: this.selectedInstitutionId() };
    this.quickAddModalVisible.set(true);
  }

  closeQuickAddModal(): void {
    if (this.quickAddSaving()) return;
    this.quickAddModalVisible.set(false);
  }

  saveQuickAddPerson(): void {
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
}
