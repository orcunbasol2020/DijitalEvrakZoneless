import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  signal,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  untracked
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import GenericModel from '../../../../components/generic-model/generic-model';
import { CommonModule } from '@angular/common';
import { FlexiToastService } from 'flexi-toast';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { OutgoingDocumentService } from '../../../services/outgoingdocument';
import { OutgoingDocumentModel, OutgoingDocumentStatus, OutgoingDocumentStatusBadgeClass } from '../../../models/outgoingdocument.model';
import { Common } from '../../../services/common';
import { SimpleAutocompleteComponent } from '../../simpleautocomplete/simpleautocomplete';
import { Department, DepartmentModel } from '../../../services/department';
import { ExternalInstitution, ExternalInstitutionModel } from '../../../services/external-institution';
import { Language, LanguageModel } from '../../../services/language';
import { SecurityDegreeEnum, SecurityDegreeLabels } from '../../../models/securitydegree.model';
import { UrgencyDegreeEnum, UrgencyDegreeLabels } from '../../../models/urgencydegree.model';
import { DocumentTypeEnum, DocumentTypeLabels } from '../../../models/documenttype.model';
import { actionRequiredOptions } from '../../../models/actionrequired.model';
import { OutgoingDocumentAllocation } from '../../../services/outgoingdocumentallocation';
import { AllocationStatusEnum } from '../../../models/allocationstatus.model';
import { OutgoingDocumentDistributionService } from '../../../services/outgoingdocumentdistribution';
import {
  OutgoingDocumentDistributionModel,
  OutgoingDocumentRecipientInput,
  distributionRecipientName
} from '../../../models/outgoingdocumentdistribution.model';
import { firstValueFrom, Subscription } from 'rxjs';

// Alıcı türü: iç birim (departmentId) ya da dış kurum (externalInstitutionId).
type RecipientKind = 'department' | 'institution';
type RecipientOption = { id: string; name: string };

// Formdaki tek alıcı satırı. id dolu ise sunucuda kayıtlı bir dağıtım satırıdır:
// alıcısı değiştirilemez (backend Update bunu desteklemez), yalnızca Gereği/Bilgi
// güncellenebilir ya da satır silinebilir. id boş ise Kaydet/Güncelle ile eklenir.
// Teslim yöntemi (Elden / Kargo / EBYS) burada seçilmez; kargoya verme zimmet
// ekranında yapılır ve backend satırı o anda günceller.
interface RecipientRow {
  key: number;
  id: string | null;
  kind: RecipientKind;
  control: FormControl<RecipientOption | null>;
  savedName: string | null;
  actionRequired: boolean;
  savedActionRequired: boolean | null;
  sub: Subscription | null;
}

@Component({
  imports: [
    GenericModel,
    FormsModule,
    ReactiveFormsModule,
    CommonModule,
    SimpleAutocompleteComponent
  ],
  templateUrl: './outgoingcreate.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Outgoingcreate {
  readonly #common = inject(Common);
  readonly user = computed(() => this.#common.user());
  readonly #toast = inject(FlexiToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly outgoingDocumentService = inject(OutgoingDocumentService);
  private readonly distributionService = inject(OutgoingDocumentDistributionService);
  private readonly departmentService = inject(Department);
  private readonly externalInstitutionService = inject(ExternalInstitution);
  private readonly languageService = inject(Language);
  private readonly allocationService = inject(OutgoingDocumentAllocation);

  readonly saving = signal(false);
  // Güncelleme modunda evrak kaydının kendisi sunucudan çekilirken true.
  readonly loading = signal(false);
  // null: yeni kayıt oluşturuluyor, dolu: bu id'li kayıt güncelleniyor.
  readonly editingId = signal<string | null>(null);
  // Güncelleme modunda sağ üstte gösterilen, salt-okunur kaynak/durum bilgisi.
  readonly documentSource = signal<number | null>(null);
  readonly documentStatus = signal<number | null>(null);
  readonly departments = signal<DepartmentModel[]>([]);
  readonly externalInstitutions = signal<ExternalInstitutionModel[]>([]);
  readonly languages = signal<(LanguageModel & { id: string })[]>([]);

  // Seçenek listeleri ayrı ayrı yüklenir; her biri için yükleniyor/hata durumu
  // tutulur ki ilgili alan hazır olana kadar pasif görünsün ve hata olduğunda
  // kullanıcı "Tekrar dene" ile yalnızca başarısız olanları yeniden çekebilsin.
  readonly departmentsLoading = signal(true);
  readonly externalInstitutionsLoading = signal(true);
  readonly languagesLoading = signal(true);
  readonly departmentsError = signal(false);
  readonly externalInstitutionsError = signal(false);
  readonly languagesError = signal(false);

  // Güncellenen kaydın kendisi; "Nereden"/"Dil" alanlarını dolduran effect'ler
  // bu sinyal ile ilgili liste sinyalini birlikte izler.
  private readonly editItem = signal<OutgoingDocumentModel | null>(null);

  // ---- Alıcılar (dağıtım listesi) ----
  // Evrak birden fazla iç birime ve/veya dış kuruma gidebilir; alıcılar evrak
  // kaydından ayrı olarak OutgoingDocumentDistributions'a yazılır. GetById
  // yanıtı dağıtım listesini içermediğinden güncellemede ayrıca çekilir.
  readonly recipientRows = signal<RecipientRow[]>([]);
  // Güncellemede sunucudan gelen dağıtım satırları; null: henüz yüklenmedi.
  private readonly savedDistributions = signal<OutgoingDocumentDistributionModel[] | null>(null);
  readonly distributionsLoading = signal(false);
  readonly distributionsError = signal(false);
  // Kullanıcının kaldırdığı kayıtlı satırlar; Güncelle'ye basılınca silinir.
  private removedRecipientIds: string[] = [];
  private nextRecipientKey = 1;

  readonly recipientKindLabel: Record<RecipientKind, string> = {
    department: 'İç Birim',
    institution: 'Dış Kurum'
  };

  // "Nereden" alanı: kayıt VE birim listesi gelene kadar yükleniyor kabul edilir.
  readonly departmentFieldLoading = computed(() => this.loading() || this.departmentsLoading());
  readonly externalInstitutionFieldLoading = computed(() => this.loading() || this.externalInstitutionsLoading());
  readonly languageFieldLoading = computed(() => this.loading() || this.languagesLoading());

  readonly lookupsLoading = computed(() =>
    this.departmentsLoading() || this.externalInstitutionsLoading() || this.languagesLoading() || this.distributionsLoading()
  );

  readonly lookupsError = computed(() =>
    this.departmentsError() || this.externalInstitutionsError() || this.languagesError() || this.distributionsError()
  );

  readonly failedLookupNames = computed(() => {
    const names: string[] = [];
    if (this.departmentsError()) names.push('Birimler');
    if (this.externalInstitutionsError()) names.push('Dış kurumlar');
    if (this.languagesError()) names.push('Diller');
    if (this.distributionsError()) names.push('Alıcılar');
    return names;
  });

  // Kayıt ile zorunlu listeler (birim/kurum) ve güncellemede mevcut alıcılar
  // gelmeden Kaydet/Güncelle pasif kalır; aksi halde kullanıcı alanlar boşken
  // "zorunlu alan" uyarısıyla karşılaşıyor ya da alıcılar mükerrer ekleniyordu.
  // Dil isteğe bağlı olduğundan onun yüklenememesi kaydı engellemez.
  readonly formReady = computed(() =>
    !this.loading()
    && !this.departmentsLoading() && !this.externalInstitutionsLoading() && !this.distributionsLoading()
    && !this.departmentsError() && !this.externalInstitutionsError() && !this.distributionsError()
  );

  // Kurum adı -> id eşlemesi; alıcı listesinde alt kurumların üst kurumla
  // ilişkisini göstermek için kullanılır.
  private readonly externalInstitutionNameMap = computed(() => {
    const map: Record<string, string> = {};
    for (const i of this.externalInstitutions()) map[i.id] = i.name;
    return map;
  });

  // Alt kurumların adının önüne üst kurumun adı eklenir (ör. "İçişleri Bakanlığı / Nüfus Müdürlüğü")
  // böylece alıcı arama listesinde parent/child ilişkisi görünür olur.
  readonly externalInstitutionOptions = computed<RecipientOption[]>(() => {
    const nameMap = this.externalInstitutionNameMap();
    return this.externalInstitutions()
      .map(i => ({
        id: i.id,
        name: i.parentId && nameMap[i.parentId] ? `${nameMap[i.parentId]} / ${i.name}` : i.name
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  });

  // Güncellemede kayıttaki birim/dil, ilgili liste geldikten sonra bir kez
  // control'e yazılır. Bir kez uygulandıktan sonra kullanıcının seçimi liste
  // yeniden yüklense bile (ör. "Tekrar dene") üzerine yazılmaz.
  private editDepartmentApplied = false;
  private legacyRecipientApplied = false;
  private editLanguageApplied = false;
  readonly departmentControl = new FormControl<DepartmentModel | null>(null);
  readonly languageControl = new FormControl<LanguageModel | null>(null);

  // Sağdaki yardım panelindeki canlı "Evrak yolu" özeti için seçili birim adı;
  // FormControl değeri sinyale çevrilerek OnPush görünümde izlenir.
  private readonly selectedDepartment = toSignal(this.departmentControl.valueChanges, {
    initialValue: this.departmentControl.value
  });
  readonly selectedDepartmentName = computed(() => this.selectedDepartment()?.name ?? '');

  // Yardım panelindeki evrak yolu için alıcı özetleri. Satırlardaki FormControl
  // değerleri her değişimde recipientRows yeni dizi olarak yayınlandığından
  // (bkz. addRecipientRow) bu computed güncel değeri okur.
  readonly recipientSummary = computed(() =>
    this.recipientRows().map(r => ({
      kindLabel: this.recipientKindLabel[r.kind],
      name: r.savedName ?? r.control.value?.name ?? ''
    }))
  );

  model = {
    qrCode: '',
    originalDocumentNumber: '',
    documentDate: '',
    subject: '',
    type: DocumentTypeEnum.Yazi as number,
    securityDegree: SecurityDegreeEnum.ServiceUseOnly as number,
    urgencyDegree: UrgencyDegreeEnum.Normal as number,
    // Evrak düzeyindeki Gereği/Bilgi; yeni eklenen alıcı satırları bu değeri
    // varsayılan alır, satır bazında ayrıca değiştirilebilir.
    actionRequired: true as boolean | null
  };

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

  readonly statusBadgeClassMap: Record<number, string> = OutgoingDocumentStatusBadgeClass;

  get currentUserId(): string | undefined {
    return this.user()?.id;
  }

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');

    this.loadDepartments();
    this.loadExternalInstitutions();
    this.loadLanguages();

    if (id) {
      this.loadForEdit(id);
    }

    this.destroyRef.onDestroy(() => {
      for (const row of this.recipientRows()) row.sub?.unsubscribe();
    });

    // Yeni kayıtta "Nereden" alanı, rolden bağımsız olarak kullanıcının kendi
    // birimiyle önceden doldurulur; kullanıcı isterse değiştirebilir. Kullanıcı
    // bilgisi ve birim listesi farklı zamanlarda gelebildiğinden ikisi de hazır
    // olana kadar bekler.
    effect(() => {
      const departments = this.departments();
      const departmentId = this.user()?.departmentId;
      if (this.editingId() || departments.length === 0 || !departmentId) return;
      if (this.departmentControl.value) return;

      const own = departments.find(d => d.id === departmentId);
      if (own) this.departmentControl.setValue(own);
    });

    // Yeni kayıtta dil varsayılan olarak Türkçe gelir.
    effect(() => {
      const languages = this.languages();
      if (this.editingId() || languages.length === 0 || this.languageControl.value) return;
      const turkish = languages.find(l => l.name?.trim().toLocaleLowerCase('tr') === 'türkçe');
      if (turkish) this.languageControl.setValue(turkish);
    });

    // Güncellemede "Nereden"/"Dil" alanları: evrak kaydı ile ilgili seçenek
    // listesi hangi sırayla gelirse gelsin, ikisi de hazır olduğunda alan
    // doldurulur. (Önceki sürümde kayıt listeden önce geldiğinde bekleyen id
    // boşa düşüyor ve alanlar bazen boş kalıyordu.)
    effect(() => {
      const item = this.editItem();
      const departments = this.departments();
      if (!item || this.departmentsLoading() || this.editDepartmentApplied) return;
      this.editDepartmentApplied = true;
      if (!item.departmentId) return;

      const dept = departments.find(d => d.id === item.departmentId);
      if (dept) {
        this.departmentControl.setValue(dept);
      } else {
        this.#toast.showToast('Uyarı', 'Kayıttaki gönderen birim listede bulunamadı, lütfen yeniden seçiniz', 'warning');
      }
    });

    // Geçiş: dağıtım listesi olmayan eski kayıtlarda alıcı, evrak üzerindeki
    // eski tek alıcı alanında (externalInstitutonId) durur. Böyle bir kayıt
    // açıldığında o kurum kaydedilmemiş bir alıcı satırı olarak eklenir;
    // kullanıcı Güncelle deyince dağıtım listesine taşınmış olur.
    effect(() => {
      const item = this.editItem();
      const saved = this.savedDistributions();
      const options = this.externalInstitutionOptions();
      if (!item || saved === null || this.externalInstitutionsLoading() || this.legacyRecipientApplied) return;
      this.legacyRecipientApplied = true;
      if (saved.length > 0 || !item.externalInstitutonId) return;

      const inst = options.find(i => i.id === item.externalInstitutonId);
      if (inst) {
        untracked(() => this.addRecipientRow('institution', inst, item.actionRequired ?? true));
      } else {
        this.#toast.showToast('Uyarı', 'Kayıttaki alıcı kurum listede bulunamadı, lütfen alıcıyı yeniden ekleyiniz', 'warning');
      }
    });

    effect(() => {
      const item = this.editItem();
      const languages = this.languages();
      if (!item || this.languagesLoading() || this.editLanguageApplied) return;
      this.editLanguageApplied = true;
      if (!item.languageId) return;

      const lang = languages.find(l => l.id === item.languageId);
      if (lang) this.languageControl.setValue(lang);
    });
  }

  private loadForEdit(id: string): void {
    this.editingId.set(id);
    this.loading.set(true);
    this.editItem.set(null);
    this.editDepartmentApplied = false;
    this.legacyRecipientApplied = false;
    this.editLanguageApplied = false;

    this.outgoingDocumentService.getById(id).subscribe({
      next: (item) => this.applyItem(item),
      error: (err) => {
        this.loading.set(false);
        console.error(err);
        this.#toast.showToast('Hata', 'Giden evrak yüklenemedi', 'error');
        this.router.navigate(['/gidenevrak/outgoing']);
      }
    });

    this.loadDistributions(id);
  }

  private applyItem(item: OutgoingDocumentModel): void {
    this.documentSource.set(item.source ?? null);
    this.documentStatus.set(item.status ?? null);
    this.model = {
      qrCode: item.qrCode ?? '',
      originalDocumentNumber: item.originalDocumentNumber ?? '',
      documentDate: (item.documentDate ?? item.createdDate ?? '').split('T')[0],
      subject: item.subject ?? '',
      type: item.type ?? DocumentTypeEnum.Yazi,
      securityDegree: item.securityDegree ?? SecurityDegreeEnum.ServiceUseOnly,
      urgencyDegree: item.urgencyDegree ?? UrgencyDegreeEnum.Normal,
      actionRequired: item.actionRequired ?? true
    };
    // Sinyal yazımı, constructor'daki effect'lerin alanları doldurmasını tetikler.
    this.editItem.set(item);
    this.loading.set(false);
  }

  // Güncellemede mevcut alıcılar; her yüklemede formdaki satırlar sunucudaki
  // listeyle baştan kurulur, bekleyen silmeler sıfırlanır.
  private loadDistributions(outgoingDocumentId: string): void {
    this.distributionsLoading.set(true);
    this.distributionsError.set(false);
    this.distributionService.getByOutgoingDocumentId(outgoingDocumentId).subscribe({
      next: (list) => {
        const saved = list ?? [];
        this.savedDistributions.set(saved);
        this.replaceRecipientRows(saved.map(d => this.rowFromDistribution(d)));
        this.removedRecipientIds = [];
        this.distributionsLoading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.distributionsError.set(true);
        this.distributionsLoading.set(false);
        this.#toast.showToast('Hata', 'Alıcılar yüklenemedi', 'error');
      }
    });
  }

  private loadDepartments(): void {
    this.departmentsLoading.set(true);
    this.departmentsError.set(false);
    this.departmentService.getDepartments().subscribe({
      next: (res) => {
        this.departments.set(res);
        this.departmentsLoading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.departmentsError.set(true);
        this.departmentsLoading.set(false);
        this.#toast.showToast('Hata', 'Birimler yüklenemedi', 'error');
      }
    });
  }

  private loadExternalInstitutions(): void {
    this.externalInstitutionsLoading.set(true);
    this.externalInstitutionsError.set(false);
    this.externalInstitutionService.getExternalInstitutions().subscribe({
      next: (res) => {
        this.externalInstitutions.set(res);
        this.externalInstitutionsLoading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.externalInstitutionsError.set(true);
        this.externalInstitutionsLoading.set(false);
        this.#toast.showToast('Hata', 'Dış kurumlar yüklenemedi', 'error');
      }
    });
  }

  private loadLanguages(): void {
    this.languagesLoading.set(true);
    this.languagesError.set(false);
    this.languageService.getLanguages().subscribe({
      next: (res) => {
        this.languages.set(res.filter((l): l is LanguageModel & { id: string } => !!l.id));
        this.languagesLoading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.languagesError.set(true);
        this.languagesLoading.set(false);
        this.#toast.showToast('Hata', 'Diller yüklenemedi', 'error');
      }
    });
  }

  // Yalnızca yüklenemeyen listeleri yeniden çeker; başarılı olanlar ve
  // kullanıcının o ana kadar yaptığı seçimler korunur.
  retryFailedLookups(): void {
    if (this.departmentsError()) this.loadDepartments();
    if (this.externalInstitutionsError()) this.loadExternalInstitutions();
    if (this.languagesError()) this.loadLanguages();
    const editingId = this.editingId();
    if (this.distributionsError() && editingId) this.loadDistributions(editingId);
  }

  // ---- Alıcı satırları ----

  private rowFromDistribution(d: OutgoingDocumentDistributionModel): RecipientRow {
    const kind: RecipientKind = d.externalInstitutionId ? 'institution' : 'department';
    return {
      key: this.nextRecipientKey++,
      id: d.id,
      kind,
      control: new FormControl<RecipientOption | null>(null),
      savedName: distributionRecipientName(d),
      actionRequired: d.actionRequired ?? true,
      savedActionRequired: d.actionRequired ?? null,
      sub: null
    };
  }

  private replaceRecipientRows(rows: RecipientRow[]): void {
    for (const row of this.recipientRows()) row.sub?.unsubscribe();
    this.recipientRows.set(rows);
  }

  // actionRequired verilmezse evrak düzeyindeki Gereği/Bilgi değeri kullanılır.
  addRecipientRow(kind: RecipientKind = 'institution', preset: RecipientOption | null = null, actionRequired?: boolean): void {
    const control = new FormControl<RecipientOption | null>(preset);
    const row: RecipientRow = {
      key: this.nextRecipientKey++,
      id: null,
      kind,
      control,
      savedName: null,
      actionRequired: actionRequired ?? this.model.actionRequired ?? true,
      savedActionRequired: null,
      sub: null
    };
    // Autocomplete seçimi FormControl'de tutulur; OnPush görünüm ve yardım
    // panelindeki özet güncellensin diye her seçimde satır listesi yeniden yayınlanır.
    row.sub = control.valueChanges.subscribe(() => this.recipientRows.update(rows => [...rows]));
    this.recipientRows.update(rows => [...rows, row]);
  }

  // Tür değişince önceki seçim anlamını yitirdiğinden temizlenir.
  setRecipientKind(row: RecipientRow, kind: RecipientKind): void {
    if (row.id || row.kind === kind) return;
    row.control.setValue(null);
    this.recipientRows.update(rows => rows.map(r => r.key === row.key ? { ...r, kind } : r));
  }

  setRecipientAction(row: RecipientRow, actionRequired: boolean): void {
    this.recipientRows.update(rows => rows.map(r => r.key === row.key ? { ...r, actionRequired } : r));
  }

  // Kayıtlı satır hemen silinmez; Güncelle'ye basılınca sunucudan kaldırılır
  // (İptal ile vazgeçilebilsin diye).
  removeRecipientRow(row: RecipientRow): void {
    if (row.id) this.removedRecipientIds.push(row.id);
    row.sub?.unsubscribe();
    this.recipientRows.update(rows => rows.filter(r => r.key !== row.key));
  }

  private recipientInput(row: RecipientRow): OutgoingDocumentRecipientInput {
    const targetId = row.control.value!.id;
    return {
      departmentId: row.kind === 'department' ? targetId : null,
      externalInstitutionId: row.kind === 'institution' ? targetId : null,
      actionRequired: row.actionRequired
    };
  }

  // Alıcı satırlarını doğrular; sorun varsa uyarı gösterip false döner.
  private validateRecipients(): boolean {
    const rows = this.recipientRows();
    if (rows.length === 0) {
      this.#toast.showToast('Uyarı', 'En az bir alıcı eklenmelidir', 'warning');
      return false;
    }

    if (rows.some(r => !r.id && !r.control.value)) {
      this.#toast.showToast('Uyarı', 'Her alıcı satırında birim veya kurum seçilmelidir', 'warning');
      return false;
    }

    // Aynı birim/kurum iki kez eklenmesin (kayıtlı satırlar dahil). Kayıtlı
    // satırların hedef id'si sunucu listesinden okunur.
    const saved = this.savedDistributions() ?? [];
    const keys = rows.map(r => {
      if (r.id) {
        const d = saved.find(x => x.id === r.id);
        return d ? `${r.kind}:${d.externalInstitutionId ?? d.departmentId}` : `saved:${r.id}`;
      }
      return `${r.kind}:${r.control.value!.id}`;
    });
    if (new Set(keys).size !== keys.length) {
      this.#toast.showToast('Uyarı', 'Aynı alıcı birden fazla kez eklenmiş', 'warning');
      return false;
    }

    return true;
  }

  cancel(): void {
    this.router.navigate(['/gidenevrak/outgoing']);
  }

  async save(): Promise<void> {
    // Buton zaten pasif; klavye/çift tık gibi yollarla gelen çağrılara karşı ek güvence.
    if (!this.formReady() || this.saving()) {
      if (!this.formReady()) {
        this.#toast.showToast('Uyarı', 'Form bilgileri henüz yüklenmedi, lütfen bekleyiniz', 'warning');
      }
      return;
    }

    if (!this.model.qrCode.trim()) {
      this.#toast.showToast('Uyarı', 'Belge numarası zorunludur', 'warning');
      return;
    }

    if (!this.model.documentDate) {
      this.#toast.showToast('Uyarı', 'Belge tarihi zorunludur', 'warning');
      return;
    }

    if (!this.departmentControl.value) {
      this.#toast.showToast('Uyarı', 'Gönderen birim zorunludur', 'warning');
      return;
    }

    if (!this.validateRecipients()) return;

    const editingId = this.editingId();
    const rows = this.recipientRows();

    // Alıcılar artık dağıtım listesine yazılır; evrak üzerindeki eski tek alıcı
    // alanı (externalInstitutonId) gönderilmez ki iki kaynak birbirinden
    // ayrışmasın.
    const body: Partial<OutgoingDocumentModel> = {
      qrCode: this.model.qrCode.trim(),
      originalDocumentNumber: this.model.originalDocumentNumber.trim() || undefined,
      documentDate: this.model.documentDate,
      subject: this.model.subject.trim() || undefined,
      type: this.model.type,
      securityDegree: this.model.securityDegree,
      urgencyDegree: this.model.urgencyDegree,
      actionRequired: this.model.actionRequired,
      languageId: this.languageControl.value?.id ?? null,
      departmentId: this.departmentControl.value.id
    };

    // CreatedUserId yalnızca yeni kayıtta gönderilir; güncellemede backend
    // "!= null" ise üzerine yazdığından, düzenleyen kullanıcı orijinal
    // oluşturucunun yerine geçmesin diye Update isteğine eklenmiyor.
    const createdUserId = this.currentUserId;
    if (!editingId) {
      if (!createdUserId) {
        this.#toast.showToast('Hata', 'Kullanıcı bilgisi alınamadı', 'error');
        return;
      }
      body.createdUserId = createdUserId;
    }

    this.saving.set(true);

    try {
      if (editingId) {
        await firstValueFrom(this.outgoingDocumentService.updateOutgoingDocument({ ...body, id: editingId }));
        const recipientsOk = await this.syncRecipients(editingId);
        this.saving.set(false);

        if (!recipientsOk) {
          // Evrak güncellendi ama alıcı değişikliklerinin bir kısmı kaydedilemedi:
          // sayfada kalınır, liste sunucudan yeniden çekilir ki kullanıcı kalanı görüp tekrar denesin.
          this.#toast.showToast('Uyarı', 'Evrak güncellendi ancak alıcı değişikliklerinin bir kısmı kaydedilemedi, lütfen kontrol edip tekrar deneyiniz', 'warning');
          this.loadDistributions(editingId);
          return;
        }

        this.#toast.showToast('Başarılı', 'Giden evrak kaydı güncellendi', 'success');
        this.router.navigate(['/gidenevrak/outgoing']);
        return;
      }

      // Yeni kayıt (iki adım): önce evrak taslak olarak oluşturulur, ardından
      // aynı id ile alıcılar eklenir. Bu form yalnızca manuel kayıt için
      // kullanılıyor; kaynak sabit 1 (Evrak Takip, backend AllocationSourceEnum).
      const res = await firstValueFrom(
        this.outgoingDocumentService.createOutgoingDocument({ ...body, status: OutgoingDocumentStatus.Taslak, source: 1 })
      );
      const outgoingDocumentId = await this.resolveCreatedId(res, body.qrCode!);

      if (!outgoingDocumentId) {
        this.saving.set(false);
        this.#toast.showToast('Uyarı', 'Evrak kaydedildi ancak alıcılar ve zimmet eklenemedi, lütfen kaydı güncelleme ekranından tamamlayınız', 'warning');
        this.router.navigate(['/gidenevrak/outgoing']);
        return;
      }

      const recipientsOk = await this.createRecipients(outgoingDocumentId, rows);
      // Evrak, kaydı oluşturan kullanıcının zimmetine otomatik alınır; alıcılar
      // eklenememiş olsa bile zimmet denenir (ikisi birbirinden bağımsız).
      const allocated = await this.allocateToCurrentUser(outgoingDocumentId, createdUserId!);
      this.saving.set(false);

      if (!recipientsOk) {
        // Evrak taslak olarak duruyor; alıcısız taslak "kırık kayıt" değil doğal
        // bir ara durumdur. Kullanıcı güncelleme ekranına alınır, alıcıları orada ekler.
        this.#toast.showToast('Uyarı', 'Evrak taslak olarak kaydedildi ancak alıcılar eklenemedi, lütfen alıcıları bu ekrandan ekleyiniz', 'warning');
        this.router.navigate(['/gidenevrak/outgoing/create', outgoingDocumentId]);
        return;
      }

      this.#toast.showToast(
        'Başarılı',
        allocated ? 'Giden evrak kaydı oluşturuldu ve zimmetinize alındı' : 'Giden evrak kaydı oluşturuldu',
        'success'
      );
      this.router.navigate(['/gidenevrak/outgoing']);
    } catch (err) {
      this.saving.set(false);
      console.error(err);
      this.#toast.showToast('Hata', editingId ? 'Giden evrak güncellenemedi' : 'Giden evrak kaydedilemedi', 'error');
    }
  }

  // Create yanıtı MessageResponse { message, data: { id } } şeklindedir; id
  // gelmezse evrak belge numarasından bulunur.
  private async resolveCreatedId(createResponse: any, qrCode: string): Promise<string | null> {
    const direct: string | undefined = createResponse?.data?.id ?? createResponse?.id;
    if (direct) return direct;
    try {
      const doc = await firstValueFrom(this.outgoingDocumentService.getByQrCode(qrCode));
      return doc?.id ?? null;
    } catch (err) {
      console.error('Oluşturulan evrak bulunamadı:', err);
      return null;
    }
  }

  private async createRecipients(outgoingDocumentId: string, rows: RecipientRow[]): Promise<boolean> {
    const pending = rows.filter(r => !r.id && r.control.value);
    if (pending.length === 0) return true;
    try {
      await firstValueFrom(
        this.distributionService.create(outgoingDocumentId, pending.map(r => this.recipientInput(r)))
      );
      return true;
    } catch (err) {
      console.error('Alıcılar eklenemedi:', err);
      return false;
    }
  }

  // Güncellemede alıcı farkını sunucuya uygular: kaldırılanlar silinir,
  // Gereği/Bilgi değişenler güncellenir, yeni satırlar eklenir. Her adım
  // bağımsızdır; biri başarısız olsa da diğerleri denenir ve sonuç false döner.
  private async syncRecipients(outgoingDocumentId: string): Promise<boolean> {
    let ok = true;
    const rows = this.recipientRows();

    for (const id of this.removedRecipientIds) {
      try {
        await firstValueFrom(this.distributionService.remove(id));
      } catch (err) {
        console.error('Alıcı silinemedi:', err);
        ok = false;
      }
    }

    const changed = rows.filter(r => r.id && r.savedActionRequired !== r.actionRequired);
    for (const row of changed) {
      try {
        await firstValueFrom(this.distributionService.update({ id: row.id!, actionRequired: row.actionRequired }));
      } catch (err) {
        console.error('Alıcı güncellenemedi:', err);
        ok = false;
      }
    }

    if (!(await this.createRecipients(outgoingDocumentId, rows))) ok = false;

    return ok;
  }

  // Kayıt sonrası evrakı oluşturan kullanıcıya zimmetler. Zimmetleme başarısız
  // olsa bile evrak kaydı korunur; kullanıcı uyarı ile bilgilendirilir.
  private async allocateToCurrentUser(outgoingDocumentId: string, userId: string): Promise<boolean> {
    try {
      await firstValueFrom(
        this.allocationService.createAllocation({
          outgoingDocumentId,
          userId,
          createdUserId: userId,
          // Kayıtla birlikte oluşan ilk zimmet; devir değil ilk kayıt olarak işaretlenir.
          status: AllocationStatusEnum.IlkKayit,
          userType: 1
        })
      );
      return true;
    } catch (err) {
      console.error('Otomatik zimmetleme hatası:', err);
      this.#toast.showToast('Uyarı', 'Evrak kaydedildi ancak zimmet oluşturulamadı', 'warning');
      return false;
    }
  }
}
