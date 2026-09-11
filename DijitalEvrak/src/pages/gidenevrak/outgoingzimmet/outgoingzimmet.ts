import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { httpResource } from '@angular/common/http';
import GenericModel from '../../../../components/generic-model/generic-model';
import { FlexiToastService } from 'flexi-toast';
import { ZimmetStateService } from '../../../services/zimmet-state-service';
import { OutgoingDocumentService } from '../../../services/outgoingdocument';
import { OutgoingDocumentModel, OutgoingDocumentStatus } from '../../../models/outgoingdocument.model';
import { OutgoingDocumentAllocation } from '../../../services/outgoingdocumentallocation';
import { ExternalInstitutionModel } from '../../../services/external-institution';
import { ExternalUserService, ExternalUserModel, initialExternalUser } from '../../../services/external-user';
import { Common } from '../../../services/common';
import { UserModel } from '../../users/users';

type ZimmetMode = 'internal' | 'external';
type PersonListItem = { id: string; name: string; surname: string; identityNo?: string; email?: string };

@Component({
  imports: [
    GenericModel,
    CommonModule,
    FormsModule
  ],
  templateUrl: './outgoingzimmet.html',
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
    [OutgoingDocumentStatus.Taslak]: 'Taslak',
    [OutgoingDocumentStatus.Gonderildi]: 'Gönderildi',
    [OutgoingDocumentStatus.TeslimEdildi]: 'Teslim Edildi',
    [OutgoingDocumentStatus.Iade]: 'İade'
  };

  readonly statusBadgeStyle: Record<number, string> = {
    [OutgoingDocumentStatus.Taslak]: 'bg-secondary-subtle text-secondary border border-secondary-subtle',
    [OutgoingDocumentStatus.Gonderildi]: 'bg-info-subtle text-info border border-info-subtle',
    [OutgoingDocumentStatus.TeslimEdildi]: 'bg-success-subtle text-success border border-success-subtle',
    [OutgoingDocumentStatus.Iade]: 'bg-warning-subtle text-warning border border-warning-subtle'
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

  readonly quickAddModalVisible = signal(false);
  readonly quickAddSaving = signal(false);
  quickAddForm: ExternalUserModel = { ...initialExternalUser };

  // delivered: evrak daha önce ya da az önce zimmetlenmiş mi.
  // deliveredJustNow: zimmetleme bu oturumda az önce yapıldıysa true.
  readonly delivered = signal(false);
  readonly deliveredJustNow = signal(false);
  readonly deliveredPersonName = signal<string | null>(null);
  readonly deliveredByPersonName = signal<string | null>(null);
  readonly deliveredDate = signal<string | Date | null>(null);

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

  // Evrak daha önce zimmetlenmişse (sayfa yeniden açıldığında da) zimmet
  // bilgilerini göster.
  private checkAlreadyDelivered(outgoingDocumentId: string): void {
    if (this.deliveredJustNow()) return;

    this.allocationService.getActiveByDocumentId(outgoingDocumentId).subscribe({
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

  setMode(mode: ZimmetMode): void {
    if (this.mode() === mode) return;
    this.mode.set(mode);
    this.selectedPersonId.set(null);
    this.personSearch.set('');
  }

  selectInstitution(id: string): void {
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

    this.allocationService.createAllocation({
      outgoingDocumentId: doc.id,
      userId: this.selectedPersonId()!,
      createdUserId,
      status: '2',
      userType: this.mode() === 'internal' ? 1 : 2
    }).subscribe({
      next: () => {
        this.toast.showToast('Başarılı', 'Evrak zimmetlendi', 'info');

        const person = this.currentPersonList().find(p => p.id === this.selectedPersonId());
        this.deliveredPersonName.set(person ? `${person.name} ${person.surname}` : null);
        const currentUser = this.user();
        this.deliveredByPersonName.set(currentUser ? `${currentUser.name} ${currentUser.surname}` : null);
        this.deliveredDate.set(new Date());
        this.deliveredJustNow.set(true);
        this.delivered.set(true);
      },
      error: () => {
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
