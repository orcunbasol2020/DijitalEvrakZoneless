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
import { OutgoingDocumentAllocationModel } from '../../../models/outgoingdocumentallocation.model';
import { AllocationStatusEnum } from '../../../models/allocationstatus.model';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ExternalInstitutionModel } from '../../../services/external-institution';
import { DepartmentModel } from '../../../services/department';
import { ExternalUserService, ExternalUserModel, initialExternalUser } from '../../../services/external-user';
import { Common } from '../../../services/common';
import { UserModel } from '../../users/users';
import { SimpleAutocompleteComponent } from '../../simpleautocomplete/simpleautocomplete';

// Zarf zimmet ekranıyla (gidenevrak/zimmet) aynı üç mod:
// self: kendi üzerine alma, internal: iç kullanıcıya zimmet, external: dış kuruma teslim.
type ZimmetMode = 'self' | 'internal' | 'external';
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
  // Soldaki evrak bilgisi paneli Giden Evrak Teslim Bilgisi (outgoingteslim)
  // ekranıyla birebir aynı yapıdadır; ot-* sınıfları oradan, zm-*/gz-* sınıfları
  // zarf zimmet ekranlarından gelir.
  styleUrls: ['../zimmet/zimmet.css', '../gidenzimmet/gidenzimmet.css', '../outgoingteslim/outgoingteslim.css'],
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

  // Evrak bilgisi kartının sağ altındaki dipnot cümlesi.
  readonly sourceFootnoteMap: Record<number, string> = {
    1: 'Evrak Takip Sisteminde Oluşturuldu',
    2: 'Atlas Belge Sisteminden Aktarıldı'
  };

  readonly mode = signal<ZimmetMode>('self');
  readonly selectedPersonId = signal<string | null>(null);
  readonly personSearch = signal('');
  readonly selectedInstitutionId = signal<string | null>(null);

  readonly usersResult = httpResource<UserModel[]>(() => "api/Users/GetAll");
  readonly internalUserList = computed<PersonListItem[]>(() =>
    (this.usersResult.value() ?? []).filter((x): x is UserModel & { id: string } => !!x.id && !x.isDeleted && x.isActive)
  );

  // İç kullanıcılar doğrudan listelenmez; ad/soyad yazıldıkça autocomplete ile gelir.
  readonly internalUserControl = new FormControl<{ id: string, name: string } | null>(null);
  readonly internalUserOptions = computed(() =>
    this.internalUserList()
      .map(u => ({ id: u.id, name: `${u.name} ${u.surname}`.trim() }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  );
  readonly selectedInternalUser = computed<PersonListItem | null>(() => {
    const id = this.selectedPersonId();
    if (this.mode() !== 'internal' || !id) return null;
    return this.internalUserList().find(x => x.id === id) ?? null;
  });

  readonly selfInitials = computed(() => {
    const u = this.user();
    return `${u?.name?.charAt(0) ?? ''}${u?.surname?.charAt(0) ?? ''}`.toLocaleUpperCase('tr');
  });

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

  // Alt özet şeridinde "Evrak No → Ad Soyad" biçiminde gösterilecek hedef.
  readonly selectedTargetLabel = computed<string | null>(() => {
    const id = this.selectedPersonId();
    if (!id) return null;

    if (this.mode() === 'self') {
      const u = this.user();
      return u ? `${u.name} ${u.surname}` : null;
    }

    const p = this.currentPersonList().find(x => x.id === id);
    if (!p) return null;

    const fullName = `${p.name} ${p.surname}`;
    const inst = this.mode() === 'external' ? this.selectedInstitutionName() : null;
    return inst ? `${fullName} · ${inst}` : fullName;
  });

  // Tek personelli kurum için otomatik seçimin hangi kurumda yapıldığını tutar.
  private autoSelectedInstitutionId: string | null = null;

  readonly quickAddModalVisible = signal(false);
  readonly quickAddSaving = signal(false);
  quickAddForm: ExternalUserModel = { ...initialExternalUser };

  // Zimmetleme sırasında butonu kilitlemek için.
  readonly saving = signal(false);

  constructor() {
    // "Kendime" modundayken seçili kişi her zaman oturum açan kullanıcı olsun.
    effect(() => {
      if (this.mode() === 'self') {
        this.selectedPersonId.set(this.user()?.id ?? null);
      }
    });

    // Belgenin kurumu (ör. daha önce kayıtlı dış kurum) değiştiğinde arama
    // kutusunda gösterilen seçimi de eşitle.
    effect(() => {
      const id = this.selectedInstitutionId();
      const match = id ? this.institutionOptions().find(o => o.id === id) ?? null : null;
      if (this.institutionControl.value?.id !== match?.id) {
        this.institutionControl.setValue(match, { emitEvent: false });
      }
    });

    // Dış kurumda yalnızca tek personel tanımlıysa o kişi otomatik seçili gelsin;
    // kullanıcı seçimi bilerek kaldırırsa aynı kurum için yeniden dayatılmaz.
    effect(() => {
      const institutionId = this.selectedInstitutionId();
      const list = this.externalPersonList();
      if (this.mode() !== 'external' || !institutionId || list.length !== 1) return;
      if (this.selectedPersonId() || this.autoSelectedInstitutionId === institutionId) return;

      this.autoSelectedInstitutionId = institutionId;
      this.selectedPersonId.set(list[0].id);
    });

    this.institutionControl.valueChanges.subscribe(value => {
      this.selectInstitution(value?.id ?? null);
    });

    this.internalUserControl.valueChanges.subscribe(value => {
      if (this.mode() === 'internal') {
        this.selectedPersonId.set(value?.id ?? null);
      }
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

  // Evrak ve aktif zimmet kaydı birlikte yüklenir; başlangıç sekmesi ikisi de
  // geldikten sonra tek seferde belirlenir ki sekme açılışta değişip durmasın.
  loadDocument(id: string): void {
    this.loading.set(true);

    forkJoin({
      doc: this.outgoingDocumentService.getById(id),
      // Zimmet sorgusu hata verirse evrak yine açılır; zimmet yok kabul edilir.
      allocation: this.allocationService.getActiveByDocumentId(id).pipe(catchError(() => of(null)))
    }).subscribe({
      next: ({ doc, allocation }) => {
        this.document.set(doc);
        this.applyInitialMode(doc, allocation?.isActive ? allocation : null);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.showToast('Hata', 'Evrak bulunamadı', 'error');
      }
    });
  }

  // Aktif zimmet durumuna göre ekranın başlangıç davranışı:
  // - Teslim Edildi: bu ekranda yapılacak işlem yok, Teslim Bilgisi ekranına yönlendirilir.
  // - İlk Kayıt: sıradaki adım evrakın teslim alınmasıdır, "Teslim Al" sekmesi açılır.
  // - Teslim Alındı: sıradaki adım dış kuruma teslimdir, "Teslim Et" sekmesi açılır.
  // - Devir / zimmet yok: evrakın alıcı kurumu varsa "Teslim Et", yoksa "Teslim Al".
  private applyInitialMode(doc: OutgoingDocumentModel, allocation: OutgoingDocumentAllocationModel | null): void {
    // status tel üzerinde string gelebildiğinden sayıya çevrilerek karşılaştırılır.
    const status = allocation ? Number(allocation.status) : null;

    if (status === AllocationStatusEnum.Teslim) {
      this.goToTeslimInfo();
      return;
    }

    const initialMode: ZimmetMode =
      status === AllocationStatusEnum.IlkKayit ? 'self'
      : status === AllocationStatusEnum.TeslimAlindi ? 'external'
      : doc.externalInstitutonId ? 'external'
      : 'self';

    this.setMode(initialMode);
  }

  private goToTeslimInfo(): void {
    this.router.navigate(['/gidenevrak/outgoingteslim']);
  }

  setMode(mode: ZimmetMode): void {
    if (this.mode() === mode) return;
    this.mode.set(mode);
    this.selectedPersonId.set(mode === 'self' ? this.user()?.id ?? null : null);
    this.selectedInstitutionId.set(null);
    this.personSearch.set('');
    this.internalUserControl.setValue(null, { emitEvent: false });

    // Evrakın alıcı kurumu belliyse "Dış Kurum" modunda kurum otomatik seçili gelir;
    // kullanıcı isterse autocomplete'ten başka bir kurum seçebilir.
    const institutionId = this.document()?.externalInstitutonId;
    if (mode === 'external' && institutionId) {
      this.selectInstitution(institutionId);
    }
  }

  selectInstitution(id: string | null): void {
    this.selectedInstitutionId.set(id);
    this.selectedPersonId.set(null);
    this.autoSelectedInstitutionId = null;
  }

  clearInternalUser(): void {
    this.selectedPersonId.set(null);
    this.internalUserControl.setValue(null, { emitEvent: false });
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

    const mode = this.mode();

    // Zarf zimmet ekranıyla aynı kural: dış kuruma teslim (Teslim Et) Teslim,
    // kendi üzerine alma (Teslim Al) Teslim Alındı, iç kullanıcıya zimmet Devir.
    const allocationStatus = mode === 'external'
      ? AllocationStatusEnum.Teslim
      : mode === 'self'
        ? AllocationStatusEnum.TeslimAlindi
        : AllocationStatusEnum.Devir;

    // reallocate() önce evrakın mevcut aktif zimmetini pasife çeker, sonra yeni
    // kaydı açar; böylece aktif zimmet her zaman tek ve günceldir.
    this.allocationService.reallocate({
      outgoingDocumentId: doc.id,
      userId: this.selectedPersonId()!,
      createdUserId,
      status: allocationStatus,
      userType: mode === 'external' ? 2 : 1
    }).then(() => {
      this.saving.set(false);
      const docLabel = doc.qrCode ? `${doc.qrCode} numaralı evrak` : 'Evrak';

      // Sonuç mesajı moda göre; yalnızca dış kuruma teslimde Teslim Bilgisi ekranı açılır,
      // diğer modlarda listeye dönülür (evrak yeniden devredilebilir).
      if (mode === 'external') {
        const person = this.currentPersonList().find(p => p.id === this.selectedPersonId());
        const personName = person ? `${person.name} ${person.surname}` : null;
        const institution = this.selectedInstitutionName();
        const receiver = personName && institution
          ? `${institution} personeli ${personName} adlı kişiye`
          : personName ? `${personName} adlı kişiye` : 'dış kuruma';
        this.toast.showToast('Teslim Edildi', `${docLabel} ${receiver} teslim edildi.`, 'success');
        this.goToTeslimInfo();
      } else if (mode === 'self') {
        this.toast.showToast('Teslim Alındı', `${docLabel} üzerinize teslim alındı.`, 'success');
        this.reset();
      } else {
        const person = this.currentPersonList().find(p => p.id === this.selectedPersonId());
        const personName = person ? `${person.name} ${person.surname}` : null;
        this.toast.showToast(
          'Zimmetlendi',
          `${docLabel} ${personName ? `${personName} adlı kullanıcıya` : 'seçilen kullanıcıya'} zimmetlendi.`,
          'success'
        );
        this.reset();
      }
    }).catch(() => {
      this.saving.set(false);
      this.toast.showToast('Hata', 'Zimmetleme başarısız', 'error');
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
