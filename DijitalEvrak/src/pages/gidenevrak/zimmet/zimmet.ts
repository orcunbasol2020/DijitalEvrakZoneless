import { AfterViewInit, ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, inject, OnDestroy, OnInit, signal, ViewChild, ViewEncapsulation } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import GenericModel from '../../../../components/generic-model/generic-model';
import { FlexiToastService } from 'flexi-toast';
import { EnvelopeDocumentService } from '../../../services/envelopedocument';
import { EnvelopeService } from '../../../services/envelope';
import { CommonModule } from '@angular/common';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { httpResource } from '@angular/common/http';
import { ChangeDetectorRef } from '@angular/core';
import { Common } from '../../../services/common';
import { firstValueFrom } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { EnvelopeModel, EnvelopeStatus, EnvelopeStatusBadgeClass, EnvelopeStatusLabels, envelopeStatusForZimmetMode, envelopeTargetName } from '../../../models/envelope.model';
import { Department, DepartmentModel } from '../../../services/department';
import { ZimmetStateService } from '../../../services/zimmet-state-service';
import { OutgoingDocumentService } from '../../../services/outgoingdocument';
import { OutgoingDocumentAllocation } from '../../../services/outgoingdocumentallocation';
import { AllocationStatusEnum, AllocationStatusLabels } from '../../../models/allocationstatus.model';
import { OutgoingDocumentAllocationModel } from '../../../models/outgoingdocumentallocation.model';
import { ExternalInstitution, ExternalInstitutionModel } from '../../../services/external-institution';
import { ExternalUserService, ExternalUserModel, initialExternalUser } from '../../../services/external-user';
import { UserModel } from '../../users/users';
import { SimpleAutocompleteComponent } from '../../simpleautocomplete/simpleautocomplete';
import { EnvelopeLabelComponent } from '../../envelope/envelope-label/envelope-label';
import { OutgoingDocumentShipmentService } from '../../../services/outgoingdocumentshipment';
import { OutgoingDocumentDistributionService } from '../../../services/outgoingdocumentdistribution';
import { OutgoingDocumentDistributionModel } from '../../../models/outgoingdocumentdistribution.model';
import { CargoCompanyEnum, CargoCompanyLabels, cargoCompanyOptions } from '../../../models/shipment.model';

// self: Teslim Al, internal: Zimmetle, external: Teslim Et (elden), cargo: Kargoya Ver
type ZimmetMode = 'self' | 'internal' | 'external' | 'cargo';
type PersonListItem = { id: string; name: string; surname: string; identityNo?: string; email?: string };

@Component({
  imports: [
    GenericModel,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SimpleAutocompleteComponent,
    EnvelopeLabelComponent
  ],
  templateUrl: './zimmet.html',
  styleUrls: ['./zimmet.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Zimmet implements OnInit, AfterViewInit, OnDestroy {

  private keydownHandler: any;
  detailsVisible = signal(false);
  @ViewChild('qrInput') qrInput?: ElementRef<HTMLInputElement>;
  // QR okutma alanı odaktayken "Okumaya Hazır" durumunu gösterir.
  qrActive = false;
  readonly #toast = inject(FlexiToastService);
  private buffer: string = '';
  private envelopeDocumentService = inject(EnvelopeDocumentService);
  private outgoingDocumentService = inject(OutgoingDocumentService);
  private allocationService = inject(OutgoingDocumentAllocation);
  private envelopeService = inject(EnvelopeService);
  private externalUserService = inject(ExternalUserService);
  private externalInstitutionService = inject(ExternalInstitution);
  private departmentService = inject(Department);
  private shipmentService = inject(OutgoingDocumentShipmentService);
  private distributionService = inject(OutgoingDocumentDistributionService);
  private zimmetState = inject(ZimmetStateService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);
  readonly #common = inject(Common);
  readonly user = computed(() => this.#common.user());

  // Kurum içi birime giden zarfların hedef adı için (GetByNo birim adını join'lemeyebilir).
  private departments: DepartmentModel[] = [];

  // Okutulan zarfın gideceği yer: kurum içi birim, yabancı misyon ya da dış kurum adı.
  get envelopeTargetName(): string {
    return envelopeTargetName(this.previewEnvelope, this.departments);
  }

  ngOnInit(): void {
    this.keydownHandler = (e: KeyboardEvent) => {
      this.handleKeydown(e);
    };
    window.addEventListener('keydown', this.keydownHandler);

    this.departmentService.getDepartments().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        this.departments = res ?? [];
        this.cdr.markForCheck();
      },
      error: (err) => console.error('Birimler yüklenemedi:', err)
    });
  }
  ngAfterViewInit(): void {
    this.focusQrInputSoon();

    // Zarflar listesinden "Teslim Al / Teslim Et" ile gelindiğinde etiket numarası
    // ?envelopeNo= ile, istenen sekme ?mode= (self | internal | external | cargo) ile
    // taşınır; sekme seçilip zarf elle okutulmuş gibi otomatik aranır. Sekme,
    // zarf okutulmadan önce seçilir ki "Teslim Et" modunda zarfın alıcı kurumu
    // otomatik gelsin. Paramlar ardından URL'den silinir; böylece zimmetleme
    // sonrası sayfa yenilenince aynı zarf yeniden yüklenmez.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const envelopeNo = params.get('envelopeNo')?.trim();
        if (!envelopeNo) return;

        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { envelopeNo: null, mode: null },
          queryParamsHandling: 'merge',
          replaceUrl: true
        });

        const mode = params.get('mode');
        if (mode === 'self' || mode === 'internal' || mode === 'external' || mode === 'cargo') {
          this.setMode(mode);
        }
        this.onQrScanned(envelopeNo);
      });
  }
  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.keydownHandler);
  }
  // Odak bir form alanındayken (personel arama, popup formu, QR alanının kendisi)
  // tuşlar tampona alınmaz; aksi halde oraya yazılan metin QR olarak okunmaya çalışılırdı.
  private handleKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;

    // Okutma alanı daraltılmışken okuyucu pasiftir; tuşlar tampona alınmaz.
    if (this.scanCollapsed) {
      this.buffer = '';
      return;
    }

    if (!this.detailsVisible()) {
      if (e.key === 'Enter') {
        this.onQrScanned(this.buffer.trim());
        this.buffer = '';
      } else if (e.key.length === 1) {
        this.buffer += e.key;
      }
    }
  }

  private focusQrInputSoon() {
    setTimeout(() => this.qrInput?.nativeElement.focus());
  }

  // Zarf bulunup evrakları listelendiğinde QR okutma bloğu tek satıra daralır;
  // böylece liste ve zarf özeti için yer açılır. Daraltılmışken okuyucu pasiftir
  // (handleKeydown tuşları yoksayar); kullanıcı "Aç" ile açınca yeniden aktif olur.
  scanCollapsed = false;

  collapseScan(): void {
    if (this.scanCollapsed) return;
    this.scanCollapsed = true;
    this.buffer = '';
    // Gizlenen alandaki odak kalmasın; "Okumaya Hazır" chip'i de pasife dönsün.
    this.qrInput?.nativeElement.blur();
    this.qrActive = false;
    this.cdr.markForCheck();
  }

  expandScan(): void {
    if (!this.scanCollapsed) return;
    this.scanCollapsed = false;
    this.cdr.markForCheck();
    this.focusQrInputSoon();
  }

  // QR alanına yazıp / okutup Enter'a basılınca çalışır; alan temizlenip odak korunur.
  async onQrKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    event.preventDefault();

    const input = event.target as HTMLInputElement;
    const value = input.value.trim();
    if (!value) return;

    await this.onQrScanned(value);
    input.value = '';
    this.focusQrInputSoon();
  }
  documents: any[] = [];
  loading = false;
  // Zimmetle butonuna basıldıktan sonra istekler bitene kadar buton kilitlenir.
  readonly saving = signal(false);
  alertVisible = true;
  currentItem: {
    type: 'envelope' | 'document';
    code: string;
  } | null = null;
  // Zarf okutulduğunda etiket popup'ında gösterebilmek için zarf verisini burada tutuyoruz.
  previewEnvelope: EnvelopeModel | null = null;
  envelopeLabelVisible = false;

  // Okutulan zarf özetindeki durum rozeti (Zarflar listesiyle aynı stil).
  get envelopeStatusLabel(): string {
    const status = this.previewEnvelope?.status;
    return (status != null && EnvelopeStatusLabels[status]) || '-';
  }

  get envelopeStatusClass(): string {
    const status = this.previewEnvelope?.status;
    return (status != null && EnvelopeStatusBadgeClass[status]) || '';
  }

  searchTerm = '';
  searchVisible = false;
  sortField: 'qrCode' | 'createdDate' = 'createdDate';
  sortDirection: 'asc' | 'desc' = 'desc';

  get filteredDocuments() {
    const term = this.searchTerm.trim().toLowerCase();
    const filtered = term
      ? this.documents.filter(doc => doc.qrCode?.toLowerCase().includes(term))
      : this.documents;

    const dir = this.sortDirection === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (this.sortField === 'qrCode') {
        return a.qrCode.localeCompare(b.qrCode) * dir;
      }
      return (new Date(a.createdDate).getTime() - new Date(b.createdDate).getTime()) * dir;
    });
  }

  // ---- Sağ panel başlığı: aktif zimmet çipi (gelen evrak zimmet ekranıyla aynı) ----
  readonly allocationStatusLabels: Record<number, string> = AllocationStatusLabels;

  // qrCode -> evrakın aktif zimmeti (null: zimmet yok). Henüz yüklenmemiş evrak
  // haritada yer almaz. documents dizisi signal olmadığından evrak sayısı ayrıca
  // tutulur; ikisi birlikte çipin ne göstereceğini belirler.
  readonly activeAllocations = signal<Record<string, OutgoingDocumentAllocationModel | null>>({});
  readonly documentCount = signal(0);

  // Zarftaki evraklar çoğunlukla aynı kişide olur; hepsi tek kişideyse o kişi,
  // farklı kişilerdeyse kaç kişide olduğu, hiçbirinde zimmet yoksa "Zimmet yok" gösterilir.
  readonly ownerSummary = computed<
    | { kind: 'loading' }
    | { kind: 'none' }
    | { kind: 'single'; allocation: OutgoingDocumentAllocationModel; count: number }
    | { kind: 'mixed'; count: number; holders: number }
    | null
  >(() => {
    const count = this.documentCount();
    if (count === 0) return null;

    const loaded = Object.values(this.activeAllocations());
    if (loaded.length < count) return { kind: 'loading' };

    const active = loaded.filter((a): a is OutgoingDocumentAllocationModel => !!a);
    if (active.length === 0) return { kind: 'none' };

    const holders = new Set(active.map(a => a.userId?.toLowerCase()));
    if (holders.size === 1 && active.length === loaded.length) {
      return { kind: 'single', allocation: active[0], count };
    }
    return { kind: 'mixed', count, holders: holders.size };
  });

  // Listedeki tüm evraklar zaten oturum açan kullanıcının üzerindeyse "Teslim Al" anlamsızdır.
  readonly isActiveOnCurrentUser = computed(() => {
    const summary = this.ownerSummary();
    const me = this.user()?.id?.toLowerCase();
    return !!me && summary?.kind === 'single' && summary.allocation.userId?.toLowerCase() === me;
  });

  // Evraklar (hepsi) kullanıcının üzerinde değilse önce "Teslim Al" ile üzerine alması
  // gerekir; bu durumda Zimmetle / Teslim Et / Kargoya Ver seçilemez. Zimmet bilgisi
  // yüklenirken de kapalı tutulur ki kullanıcı sonradan geri alınacak bir seçim yapmasın.
  readonly mustTakeOverFirst = computed(() => !this.isActiveOnCurrentUser());

  // Zimmet bilgisi yüklendi ve evraklar kullanıcıda değil: sekme Teslim Al'a zorlanır.
  private readonly ownershipKnownNotMine = computed(() => {
    const summary = this.ownerSummary();
    return !!summary && summary.kind !== 'loading' && !this.isActiveOnCurrentUser();
  });

  // documents değiştikten sonra çağrılır: sayıyı günceller, haritada olmayan evrakların
  // aktif zimmetini yükler ve listeden çıkanları haritadan düşer.
  private syncActiveAllocations(): void {
    const codes = new Set(this.documents.map(d => d.qrCode as string));
    this.documentCount.set(codes.size);

    this.activeAllocations.update(map => {
      const next: Record<string, OutgoingDocumentAllocationModel | null> = {};
      for (const [code, value] of Object.entries(map)) {
        if (codes.has(code)) next[code] = value;
      }
      return next;
    });

    for (const doc of this.documents) {
      if (doc.qrCode in this.activeAllocations()) continue;
      this.loadActiveAllocation(doc);
    }
  }

  private async loadActiveAllocation(doc: { documentId?: string; qrCode: string }): Promise<void> {
    let allocation: OutgoingDocumentAllocationModel | null = null;
    try {
      const outgoingDocumentId = await this.resolveOutgoingDocumentId(doc);
      if (outgoingDocumentId) {
        const res = await firstValueFrom(this.allocationService.getActiveByDocumentId(outgoingDocumentId)).catch(() => null);
        allocation = res?.isActive && !res.isDeleted ? res : null;
      }
    } catch (err) {
      console.error(`Aktif zimmet alınamadı (${doc.qrCode}):`, err);
    }

    // Bu arada evrak listeden çıkarılmış olabilir.
    if (!this.documents.some(d => d.qrCode === doc.qrCode)) return;
    this.activeAllocations.update(map => ({ ...map, [doc.qrCode]: allocation }));
    this.cdr.markForCheck();
  }

  initialsOf(fullName: string | null | undefined): string {
    const parts = (fullName ?? '').replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const first = parts[0].charAt(0);
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return `${first}${last}`.toLocaleUpperCase('tr');
  }

  // Yalnızca tek tek okutulan evraklar listeden çıkarılabilir (zarf içeriği bütün olarak işlenir).
  removeDocument(qrCode: string) {
    this.documents = this.documents.filter(d => d.qrCode !== qrCode);
    this.syncActiveAllocations();
    if (this.documents.length === 0) {
      this.currentItem = null;
      this.alertVisible = true;
      this.scanCollapsed = false;
      this.focusQrInputSoon();
    }
  }

  toggleSort(field: 'qrCode' | 'createdDate') {
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDirection = 'asc';
    }
  }

  // ---- Zimmetle paneli: toplanan evrakları bir kişiye zimmetlemek için ----
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
    return id ? this.institutionList().find(x => x.id === id)?.name ?? null : null;
  });

  // ---- Kargoya Ver paneli ----
  // Zarf ya elden teslim edilir ya kargolanır; bu yüzden kargo işlemi listedeki
  // tüm evrakları tek paket olarak kapsar. Alıcı kurum ekranda seçilmez: zarfın
  // alıcısı (applyEnvelopeInstitution) kullanılır; zarf yoksa backend kurumu
  // dağıtım satırlarından alır.
  readonly cargoCompanyOptions = cargoCompanyOptions;
  readonly cargoCompany = signal<CargoCompanyEnum>(CargoCompanyEnum.Ptt);
  readonly trackingNumber = signal('');

  readonly cargoReady = computed(() => this.trackingNumber().trim().length > 0);

  // Gönder butonunun aktifliği: kargo modunda takip numarası, diğer modlarda kişi seçimi gerekir.
  // Seçili sekme o an izinli olmalı: Teslim Al yalnızca evraklar kullanıcıda değilken,
  // diğerleri yalnızca evraklar kullanıcıdayken gönderilebilir.
  readonly canSubmit = computed(() => {
    const allowed = this.mode() === 'self' ? !this.isActiveOnCurrentUser() : !this.mustTakeOverFirst();
    if (!allowed) return false;
    return this.mode() === 'cargo' ? this.cargoReady() : !!this.selectedPersonId();
  });

  // Alt özet şeridinde "3 evrak → Ad Soyad" biçiminde gösterilecek hedef.
  // Kargo modunda "PTT · 1234567890" ya da kurum seçiliyse "Kurum Adı · PTT · 1234567890".
  readonly selectedTargetLabel = computed<string | null>(() => {
    if (this.mode() === 'cargo') {
      const tracking = this.trackingNumber().trim();
      if (!tracking) return null;
      const parts = [this.selectedInstitutionName(), CargoCompanyLabels[this.cargoCompany()], tracking];
      return parts.filter(Boolean).join(' · ');
    }

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

  constructor() {
    // "Kendim" modundayken seçili kişi her zaman oturum açan kullanıcı olsun
    // (kullanıcı bilgisi ilk yüklendiğinde de senkron kalsın).
    effect(() => {
      if (this.mode() === 'self') {
        this.selectedPersonId.set(this.user()?.id ?? null);
      }
    });

    // Belgenin kurumu değiştiğinde arama kutusunda gösterilen seçimi de eşitle.
    effect(() => {
      const id = this.selectedInstitutionId();
      const match = id ? this.institutionOptions().find(o => o.id === id) ?? null : null;
      if (this.institutionControl.value?.id !== match?.id) {
        this.institutionControl.setValue(match, { emitEvent: false });
      }
    });

    // Dış kurumda yalnızca tek personel tanımlıysa o kişi otomatik seçili gelsin.
    // Personel listesi sonradan yüklense de çalışır; kullanıcı seçimi bilerek
    // kaldırırsa aynı kurum için yeniden dayatılmaz.
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

    // Evraklar zaten kullanıcının üzerindeyse "Teslim Al" seçilemez; bir sonraki
    // doğal adıma (kurum içi birim: Zimmetle, dış kurum: Teslim Et) geçilir.
    effect(() => {
      if (this.isActiveOnCurrentUser() && this.mode() === 'self') {
        this.setMode(this.previewEnvelope?.targetDepartmentId ? 'internal' : 'external');
      }
    });

    // Tersi: evraklar kullanıcının üzerinde değilse (zarf durumu ya da ?mode= başka bir
    // sekme seçtirmiş olsa bile) yalnızca Teslim Al kullanılabilir.
    effect(() => {
      if (this.ownershipKnownNotMine() && this.mode() !== 'self') {
        this.setMode('self');
      }
    });
  }

  setMode(mode: ZimmetMode): void {
    if (this.mode() === mode) return;
    this.mode.set(mode);
    this.selectedPersonId.set(mode === 'self' ? this.user()?.id ?? null : null);
    this.selectedInstitutionId.set(null);
    this.personSearch.set('');
    this.internalUserControl.setValue(null, { emitEvent: false });

    if (mode === 'external' || mode === 'cargo') {
      this.applyEnvelopeInstitution();
    }
  }

  // Zarfın alıcı kurumu belliyse "Teslim Et" ve "Kargoya Ver" modlarında kurum
  // otomatik seçili gelir; kullanıcı isterse autocomplete'ten başka bir kurum seçebilir.
  private applyEnvelopeInstitution(): void {
    const institutionId = this.previewEnvelope?.externalInstitutionId;
    if (!institutionId || (this.mode() !== 'external' && this.mode() !== 'cargo')) return;
    if (this.selectedInstitutionId() === institutionId) return;

    this.selectInstitution(institutionId);
  }

  clearInternalUser(): void {
    this.selectedPersonId.set(null);
    this.internalUserControl.setValue(null, { emitEvent: false });
  }

  selectInstitution(id: string | null): void {
    this.selectedInstitutionId.set(id);
    this.selectedPersonId.set(null);
    this.autoSelectedInstitutionId = null;
  }

  selectPerson(id: string): void {
    this.selectedPersonId.set(this.selectedPersonId() === id ? null : id);
  }

  initials(p: PersonListItem): string {
    return `${p.name?.charAt(0) ?? ''}${p.surname?.charAt(0) ?? ''}`.toLocaleUpperCase('tr');
  }

  get selfInitials(): string {
    const u = this.user();
    return `${u?.name?.charAt(0) ?? ''}${u?.surname?.charAt(0) ?? ''}`.toLocaleUpperCase('tr');
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
      this.#toast.showToast('Uyarı', 'Ad ve soyad zorunludur', 'warning');
      return;
    }

    if (!this.quickAddForm.email?.trim()) {
      this.#toast.showToast('Uyarı', 'E-posta zorunludur', 'warning');
      return;
    }

    if (!this.quickAddForm.externalInstitutionId) {
      this.#toast.showToast('Hata', 'Kurum bilgisi bulunamadı', 'error');
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
        this.#toast.showToast('Başarılı', 'Personel eklendi', 'success');
        this.quickAddSaving.set(false);
        this.quickAddModalVisible.set(false);
        this.externalUsersResult.reload();
      },
      error: () => {
        this.quickAddSaving.set(false);
        this.#toast.showToast('Hata', 'Personel eklenemedi', 'error');
      }
    });
  }

  async onQrScanned(result: string) {

    if (this.loading) return;

    if (!result) {
      this.showToast('Bilgi', 'QR okutunuz', 'warning');
      return;
    }

    this.loading = true;
    // QR okuyucu, native window 'keydown' olayı üzerinden tetiklendiğinde
    // OnPush bileşen otomatik olarak işaretlenmiyor; loading spinner'ının
    // hemen görünmesi için burada elle bildiriyoruz.
    this.cdr.markForCheck();

    try {

      // ZARF KONTROLÜ (prefix ile)
      if (result.startsWith('ZRF')) {
        this.currentItem = {
          type: 'envelope',
          code: result
        };
        const envelope = await this.envelopeService.getEnvelopeByNo(result);

        if (!envelope) {
          this.documents = [];
          this.previewEnvelope = null;
          this.showToast('Bilgi', 'Zarf bulunamadı.', 'warning');
          return;
        }

        // Teslim edilmiş zarf üzerinde yeniden zimmetleme yapılamaz; kullanıcı
        // salt okunur Teslim Bilgisi ekranına yönlendirilir.
        // Oradaki "Geri" butonu bu okutma ekranına döner.
        if (envelope.status === EnvelopeStatus.TeslimEdildi) {
          this.documents = [];
          this.previewEnvelope = null;
          this.currentItem = null;
          this.showToast('Bilgi', 'Bu zarf teslim edilmiş, teslim bilgileri gösteriliyor.', 'info');
          this.zimmetState.setEnvelopeId(envelope.id, '/gidenevrak/zimmet');
          this.router.navigate(['/gidenzimmet']);
          return;
        }

        // Kargoya verilmiş zarf birimden çıkmıştır; üzerinde işlem yapılamaz.
        // Teslim Bilgisi ekranı bilgiyi aktif zimmetten okuduğundan oraya gidilmez
        // (kargoda zimmet kapanır).
        if (envelope.status === EnvelopeStatus.KargoyaVerildi) {
          this.documents = [];
          this.previewEnvelope = null;
          this.currentItem = null;
          this.showToast('Bilgi', 'Bu zarf kargoya verilmiş, üzerinde işlem yapılamaz.', 'warning');
          return;
        }

        this.previewEnvelope = envelope;

        // Zarf daha önce "Teslim Al" ile alınmışsa (Evrak Birimde) bir sonraki
        // doğal adım teslimdir: dış kuruma / misyona giden zarfta Teslim Et,
        // kurum içi birime giden zarfta Zimmetle sekmesi otomatik seçilir.
        // Kullanıcı okutmadan önce başka bir sekmeyi bilerek seçmişse (ya da
        // ?mode= ile gelmişse) o seçim korunur.
        if (envelope.status === EnvelopeStatus.EvrakBirimde && this.mode() === 'self') {
          this.setMode(envelope.targetDepartmentId ? 'internal' : 'external');
        }

        this.applyEnvelopeInstitution();

        // GetByNo, GetById gibi kurum adını (externalInstitutionName) join'lemeden
        // dönebiliyor; yalnızca id geldiyse burada ayrıca çekiyoruz.
        if (!envelope.externalInstitutionName && envelope.externalInstitutionId) {
          this.externalInstitutionService.getExternalInstitutionById(envelope.externalInstitutionId).subscribe({
            next: (institution: ExternalInstitutionModel) => {
              if (this.previewEnvelope === envelope) {
                this.previewEnvelope = { ...envelope, externalInstitutionName: institution.name };
                this.cdr.markForCheck();
              }
            }
          });
        }

        const docs = await this.envelopeDocumentService
          .getEnvelopeDocumentsByEnvelopeId(envelope.id);

        if (docs.length > 0) {
          this.documents = docs;
          this.alertVisible = false;
          this.collapseScan();
        } else {
          this.documents = [];
          this.showToast('Bilgi', 'Zarf içinde evrak yok.', 'warning');
        }
        this.syncActiveAllocations();

        return;
      }
      else {
        this.currentItem = {
          type: 'document',
          code: result
        };
        this.previewEnvelope = null;
        const isValidDocument = /^20\d{2}/.test(result);
        if (!isValidDocument) {
          this.showToast(
            'Hata',
            'Lütfen geçerli bir evrak numarasını girin.' + "( geçersiz : " + result + ")",
            'warning'
          );
          return;
        }
        //  BELGE AKIŞI
        const exists = this.documents.some(x => x.qrCode === result);

        if (exists) {
          this.showToast('Bilgi', 'Bu belge zaten eklendi', 'info');
          return;
        }

        // ( burada backend doğrulama gelecek)

        this.documents = [
          ...this.documents,
          {
            qrCode: result,
            createdDate: new Date()
          }
        ];
        this.syncActiveAllocations();

        this.alertVisible = false;
      }

    } catch (err) {
      console.error(err);
      this.showToast('Hata', 'Bir hata oluştu', 'error');
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }
  private toastVisible = false;
  private showToast(title: string, message: string, type: 'info' | 'warning' | 'error') {
    if (this.toastVisible) return;
    this.toastVisible = true;
    this.#toast.showToast(title, message, type);
    setTimeout(() => this.toastVisible = false, 2000);
  }
  getCaptionTitle(): string {
    if (!this.currentItem) {
      return 'Belgeler';
    }

    return this.currentItem.type === 'envelope'
      ? 'Zarf İçindeki Belgeler'
      : 'Eklenen Evrak ';
  }

  reset() {
    this.documents = [];
    this.activeAllocations.set({});
    this.documentCount.set(0);
    this.buffer = '';
    this.loading = false;
    this.alertVisible = true;
    this.currentItem = null;
    this.previewEnvelope = null;
    this.envelopeLabelVisible = false;
    this.searchTerm = '';
    this.searchVisible = false;
    this.scanCollapsed = false;
    this.mode.set('self');
    this.selectedPersonId.set(this.user()?.id ?? null);
    this.selectedInstitutionId.set(null);
    this.personSearch.set('');
    this.internalUserControl.setValue(null, { emitEvent: false });
    this.cargoCompany.set(CargoCompanyEnum.Ptt);
    this.trackingNumber.set('');
    this.focusQrInputSoon();
  }

  // Zimmetleme: her evrak için önce üzerindeki aktif zimmet kayıtları pasife
  // (isActive=false) çekilir, ardından seçilen kişi adına yeni zimmet kaydı
  // oluşturulur. Böylece evrak yeni kişiye geçerken eski kayıtlar geçmiş
  // olarak izlenebilir kalır. Kargo modunda ise zimmet frontend'de yazılmaz;
  // bkz. shipCargo (backend Create zimmeti kendisi kapatır).
  async addZimmet() {
    if (this.saving()) return;

    if (this.mode() === 'cargo') {
      await this.shipCargo();
      return;
    }

    const personId = this.selectedPersonId();
    if (!personId) {
      this.#toast.showToast('Hata', 'Personel seçilmedi', 'error');
      return;
    }

    if (this.documents.length === 0) {
      this.#toast.showToast('Hata', 'Zimmetlenecek evrak yok', 'error');
      return;
    }

    const createdUserId = this.user()?.id;
    if (!createdUserId) {
      this.#toast.showToast('Hata', 'Kullanıcı bilgisi alınamadı', 'error');
      return;
    }

    const userType = this.mode() === 'external' ? 2 : 1;

    // Dış kuruma teslimde (Teslim Et) evrak artık birimden çıktığı için zimmet
    // kaydı Teslim olarak yazılır; kullanıcının kendi üzerine aldığı (Teslim Al)
    // evraklar Teslim Alındı, birim içi zimmetleme (Zimmetle) ise Devir'dir.
    const allocationStatus = this.mode() === 'external'
      ? AllocationStatusEnum.Teslim
      : this.mode() === 'self'
        ? AllocationStatusEnum.TeslimAlindi
        : AllocationStatusEnum.Devir;

    // reset() zarf ve seçim bilgisini temizlediği için zarf durumu güncellemesi ve
    // sonuç mesajı için gereken bilgiler önceden saklanır.
    const envelopeId = this.currentItem?.type === 'envelope' ? this.previewEnvelope?.id ?? null : null;
    const envelopeNo = envelopeId ? this.previewEnvelope?.envelopeNo ?? null : null;
    const envelopeStatus = envelopeStatusForZimmetMode(this.mode());
    const mode = this.mode();
    const targetPerson = this.currentPersonList().find(x => x.id === personId);
    const targetName = targetPerson ? `${targetPerson.name} ${targetPerson.surname}` : null;
    const institutionName = mode === 'external' ? this.selectedInstitutionName() : null;

    this.saving.set(true);
    this.cdr.markForCheck();

    let successCount = 0;
    const failedCodes: string[] = [];

    // Evraklar sırayla işlenir; bir evrak başarısız olsa da diğerleri devam eder.
    for (const doc of this.documents) {
      try {
        const outgoingDocumentId = await this.resolveOutgoingDocumentId(doc);
        if (!outgoingDocumentId) {
          failedCodes.push(doc.qrCode);
          continue;
        }

        await this.allocationService.reallocate({
          outgoingDocumentId,
          userId: personId,
          createdUserId,
          status: allocationStatus,
          userType
        });
        successCount++;
      } catch (err) {
        console.error(`Zimmet devri başarısız (${doc.qrCode}):`, err);
        failedCodes.push(doc.qrCode);
      }
    }

    this.saving.set(false);

    if (failedCodes.length > 0) {
      this.#toast.showToast(
        'Uyarı',
        `${failedCodes.length} evrak işlenemedi (${failedCodes.join(', ')}). Bu evraklar için işlemi yeniden deneyin.`,
        'warning'
      );
    }

    if (successCount === 0) {
      this.cdr.markForCheck();
      return;
    }

    // Sonuç mesajı moda göre: ne yapıldı, kime yapıldı, zarf hangi duruma geçti.
    const { title, message } = this.buildSuccessMessage(mode, successCount, targetName, institutionName, envelopeNo);
    this.#toast.showToast(title, message, 'success');

    // Evraklar zimmetlendiyse zarfın durumu da moda göre güncellenir
    // (Teslim Al / Zimmetle: Evrak Birimde, Teslim Et: Teslim Edildi).
    if (envelopeId) {
      this.updateEnvelopeStatus(envelopeId, envelopeStatus);
    }

    // TEMİZLEME
    this.reset();
    this.cdr.detectChanges();
  }

  // Kayıt sonrası toast: "Teslim Al" -> üzerinize alındı, "Zimmetle" -> kullanıcıya
  // zimmetlendi, "Teslim Et" -> dış kurum personeline teslim edildi. Zarf okutulduysa
  // zarfın geçtiği yeni durum da eklenir.
  private buildSuccessMessage(
    mode: ZimmetMode,
    count: number,
    targetName: string | null,
    institutionName: string | null,
    envelopeNo: string | null
  ): { title: string; message: string } {
    const docs = count === 1 ? '1 evrak' : `${count} evrak`;
    const envelopeSuffix = (statusLabel: string) =>
      envelopeNo ? ` ${envelopeNo} numaralı zarf "${statusLabel}" durumuna geçti.` : '';

    switch (mode) {
      case 'self':
        return {
          title: 'Teslim Alındı',
          message: `${docs} üzerinize teslim alındı.${envelopeSuffix(EnvelopeStatusLabels[EnvelopeStatus.EvrakBirimde])}`
        };
      case 'external': {
        // Örn. "3 evrak X Kurumu personeli Ali Veli'ye teslim edildi."
        const receiver = targetName && institutionName
          ? `${institutionName} personeli ${targetName} adlı kişiye`
          : targetName
            ? `${targetName} adlı kişiye`
            : institutionName
              ? `${institutionName} kurumuna`
              : 'dış kuruma';
        return {
          title: 'Teslim Edildi',
          message: `${docs} ${receiver} teslim edildi.${envelopeSuffix(EnvelopeStatusLabels[EnvelopeStatus.TeslimEdildi])}`
        };
      }
      default:
        return {
          title: 'Zimmetlendi',
          message: `${docs} ${targetName ? `${targetName} adlı kullanıcıya` : 'seçilen kullanıcıya'} zimmetlendi.${envelopeSuffix(EnvelopeStatusLabels[EnvelopeStatus.ZimmetDevri])}`
        };
    }
  }

  // ---- Kargoya Ver ----
  // Listedeki evraklar tek paket olarak OutgoingDocumentShipments/Create'e gider.
  // Backend paketi oluşturur, dağıtım satırlarını bağlar (DeliveryMethod = Kargo),
  // aktif zimmetleri "Kargoya Verildi" ile kapatır ve "Gönderildi" işlemi yazar.
  // Zarf okutulduysa envelopeId de gönderilir; zarfın durumu backend'de aynı
  // işlemle "Kargoya Verildi" olur (frontend ayrıca UpdateStatus çağırmaz).
  // Backend ya hepsini kaydeder ya hiçbirini; bu yüzden hazırlık aşamasında
  // (dağıtım satırı bulma, zimmet ön kontrolü) tek evrak bile takılırsa istek
  // gönderilmez ve kullanıcıya hangi evrakların neden takıldığı söylenir.
  private async shipCargo() {
    const trackingNumber = this.trackingNumber().trim();
    if (!trackingNumber) {
      this.#toast.showToast('Uyarı', 'Kargo takip numarası girilmedi', 'warning');
      return;
    }

    if (this.documents.length === 0) {
      this.#toast.showToast('Hata', 'Kargoya verilecek evrak yok', 'error');
      return;
    }

    const sentUserId = this.user()?.id;
    if (!sentUserId) {
      this.#toast.showToast('Hata', 'Kullanıcı bilgisi alınamadı', 'error');
      return;
    }

    const envelopeId = this.currentItem?.type === 'envelope' ? this.previewEnvelope?.id ?? null : null;
    const envelopeNo = envelopeId ? this.previewEnvelope?.envelopeNo ?? null : null;
    const institutionId = this.selectedInstitutionId();
    const institutionName = this.selectedInstitutionName();
    const companyLabel = CargoCompanyLabels[this.cargoCompany()];

    this.saving.set(true);
    this.cdr.markForCheck();

    const distributionIds: string[] = [];
    const problems: string[] = [];

    for (const doc of this.documents) {
      try {
        const outgoingDocumentId = await this.resolveOutgoingDocumentId(doc);
        if (!outgoingDocumentId) {
          problems.push(`${doc.qrCode}: evrak bulunamadı`);
          continue;
        }

        // Backend ile aynı kural: aktif zimmet kargoya veren kullanıcıda olmalı.
        // Hata mesajını topluca ve evrak numarasıyla verebilmek için burada da bakılır.
        const active = await firstValueFrom(this.allocationService.getActiveByDocumentId(outgoingDocumentId)).catch(() => null);
        if (active?.isActive && active.userId && active.userId.toLowerCase() !== sentUserId.toLowerCase()) {
          problems.push(`${doc.qrCode}: zimmeti sizde değil, önce Teslim Al yapın`);
          continue;
        }

        const ids = await this.resolveDistributionIds(outgoingDocumentId, institutionId);
        if (ids.length === 0) {
          // Yalnızca zarfsız okutulan, alıcısı hiç tanımlanmamış evrakta olur.
          problems.push(`${doc.qrCode} için alıcı kurum tanımlı değil`);
        } else {
          distributionIds.push(...ids);
        }
      } catch (err) {
        console.error(`Kargo hazırlığı başarısız (${doc.qrCode}):`, err);
        problems.push(`${doc.qrCode}: bilgiler alınamadı`);
      }
    }

    if (problems.length > 0) {
      this.saving.set(false);
      this.cdr.markForCheck();
      this.#toast.showToast('Uyarı', `Kargo kaydı oluşturulmadı. ${problems.join('; ')}.`, 'warning');
      return;
    }

    try {
      const shipment = await firstValueFrom(this.shipmentService.create({
        distributionIds,
        cargoCompany: this.cargoCompany(),
        trackingNumber,
        sentUserId,
        sentDate: null,
        externalInstitutionId: institutionId,
        // Zarfın durumu backend'de aynı işlemle "Kargoya Verildi" olur.
        envelopeId
      }));

      const count = shipment?.items?.length ?? distributionIds.length;
      const docs = count === 1 ? '1 evrak' : `${count} evrak`;
      const receiver = shipment?.externalInstitutionName || institutionName;
      const envelopeSuffix = envelopeNo
        ? ` ${envelopeNo} numaralı zarf "${EnvelopeStatusLabels[EnvelopeStatus.KargoyaVerildi]}" durumuna geçti.`
        : '';
      this.#toast.showToast(
        'Kargoya Verildi',
        `${docs} ${receiver ? `${receiver} adresine ` : ''}${companyLabel} ile kargoya verildi (takip no ${trackingNumber}).${envelopeSuffix}`,
        'success'
      );

      this.reset();
    } catch (err: any) {
      console.error('Kargo kaydı oluşturulamadı:', err);
      const message = err?.error?.message || err?.error?.Message || 'Kargo kaydı oluşturulamadı';
      this.#toast.showToast('Hata', message, 'error');
    } finally {
      this.saving.set(false);
      this.cdr.detectChanges();
    }
  }

  // Evrağın kargo paketine girecek dağıtım satırları. Backend kargoyu dağıtım
  // satırına bağladığı için en az bir satır gerekir; kullanıcı bu yüzden
  // durdurulmaz, satır bulunur ya da oluşturulur:
  //   - Hedef belliyse (zarfın alıcı kurumu ya da kurum içi birimi): o hedefe
  //     giden henüz kargolanmamış satır kullanılır, yoksa hedef için yeni satır
  //     oluşturulur. Zarf nereye gidiyorsa evrak da oraya gider.
  //   - Hedef yoksa (zarfsız okutulan evrak): evrağın kargolanmamış tüm satırları
  //     aynı pakete girer; hiç satır yoksa evrağın eski tek alıcı alanındaki
  //     kurum (externalInstitutonId) için satır oluşturulur.
  // Boş dizi yalnızca evrağın hiçbir alıcı bilgisi yoksa döner.
  private async resolveDistributionIds(
    outgoingDocumentId: string,
    institutionId: string | null
  ): Promise<string[]> {
    const rows: OutgoingDocumentDistributionModel[] =
      ((await firstValueFrom(this.distributionService.getByOutgoingDocumentId(outgoingDocumentId))) ?? [])
        .filter(r => !(r as { isDeleted?: boolean }).isDeleted);
    const open = rows.filter(r => !r.shipmentId);

    const sameId = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
    const createRow = async (departmentId: string | null, externalInstitutionId: string | null) => {
      const created = await firstValueFrom(this.distributionService.create(outgoingDocumentId, [{
        departmentId,
        externalInstitutionId,
        actionRequired: null
      }]));
      return created?.[0]?.id ? [created[0].id] : [];
    };

    const targetDepartmentId = institutionId ? null : this.previewEnvelope?.targetDepartmentId ?? null;
    if (institutionId || targetDepartmentId) {
      const match = open.find(r => institutionId
        ? sameId(r.externalInstitutionId, institutionId)
        : sameId(r.departmentId, targetDepartmentId));
      return match ? [match.id] : createRow(targetDepartmentId, institutionId);
    }

    if (open.length > 0) return open.map(r => r.id);

    const legacyInstitutionId = (await firstValueFrom(this.outgoingDocumentService.getById(outgoingDocumentId)).catch(() => null))
      ?.externalInstitutonId ?? null;
    return legacyInstitutionId ? createRow(null, legacyInstitutionId) : [];
  }

  // Zarf içeriği EnvelopeDocuments kaydı olarak gelir ve evrakın gerçek id'sini
  // documentId alanında taşır; tek tek okutulan evraklarda ise yalnızca QR kod
  // bilinir ve id OutgoingDocuments üzerinden bulunur. Allocation kaydına
  // EnvelopeDocuments'ın kendi id'si değil, evrakın gerçek id'si yazılmalı.
  private async resolveOutgoingDocumentId(doc: { documentId?: string; qrCode: string }): Promise<string | null> {
    if (doc.documentId) return doc.documentId;

    const outgoingDoc = await firstValueFrom(this.outgoingDocumentService.getByQrCode(doc.qrCode));
    return outgoingDoc?.id ?? null;
  }

  // Zarf durumu güncellenemezse zimmetler zaten kaydedilmiş olduğundan yalnızca uyarı verilir.
  private updateEnvelopeStatus(envelopeId: string, status: ReturnType<typeof envelopeStatusForZimmetMode>) {
    this.envelopeService.updateEnvelopeStatus(envelopeId, status).subscribe({
      error: (err) => {
        console.error('Zarf durumu güncellenemedi:', err);
        this.#toast.showToast('Uyarı', 'Evraklar zimmetlendi ancak zarf durumu güncellenemedi', 'warning');
      }
    });
  }

}
