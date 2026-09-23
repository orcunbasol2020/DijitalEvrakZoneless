import {
  ChangeDetectionStrategy,
  Component,
  signal,
  ViewEncapsulation,
  computed,
  effect,
  inject
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
import { RoleService } from '../../../services/role-service';
import { OutgoingDocumentAllocation } from '../../../services/outgoingdocumentallocation';
import { AllocationStatusEnum } from '../../../models/allocationstatus.model';
import { firstValueFrom } from 'rxjs';

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
  private readonly outgoingDocumentService = inject(OutgoingDocumentService);
  private readonly departmentService = inject(Department);
  private readonly externalInstitutionService = inject(ExternalInstitution);
  private readonly languageService = inject(Language);
  private readonly roleService = inject(RoleService);
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

  // Güncellenen kaydın kendisi; "Nereden"/"Nereye"/"Dil" alanlarını dolduran
  // effect'ler bu sinyal ile ilgili liste sinyalini birlikte izler.
  private readonly editItem = signal<OutgoingDocumentModel | null>(null);

  // "Nereden"/"Nereye" alanları: kayıt VE ilgili liste gelene kadar yükleniyor kabul edilir.
  readonly departmentFieldLoading = computed(() => this.loading() || this.departmentsLoading());
  readonly externalInstitutionFieldLoading = computed(() => this.loading() || this.externalInstitutionsLoading());
  readonly languageFieldLoading = computed(() => this.loading() || this.languagesLoading());

  readonly lookupsLoading = computed(() =>
    this.departmentsLoading() || this.externalInstitutionsLoading() || this.languagesLoading()
  );

  readonly lookupsError = computed(() =>
    this.departmentsError() || this.externalInstitutionsError() || this.languagesError()
  );

  readonly failedLookupNames = computed(() => {
    const names: string[] = [];
    if (this.departmentsError()) names.push('Birimler');
    if (this.externalInstitutionsError()) names.push('Dış kurumlar');
    if (this.languagesError()) names.push('Diller');
    return names;
  });

  // Kayıt ile zorunlu listeler (birim/kurum) gelmeden Kaydet/Güncelle pasif
  // kalır; aksi halde kullanıcı alanlar boşken "zorunlu alan" uyarısıyla
  // karşılaşıyordu. Dil isteğe bağlı olduğundan onun yüklenememesi kaydı engellemez.
  readonly formReady = computed(() =>
    !this.loading()
    && !this.departmentsLoading() && !this.externalInstitutionsLoading()
    && !this.departmentsError() && !this.externalInstitutionsError()
  );

  // Kurum adı -> id eşlemesi; "Nereye" alanında alt kurumların üst kurumla
  // ilişkisini göstermek için kullanılır.
  private readonly externalInstitutionNameMap = computed(() => {
    const map: Record<string, string> = {};
    for (const i of this.externalInstitutions()) map[i.id] = i.name;
    return map;
  });

  // Alt kurumların adının önüne üst kurumun adı eklenir (ör. "İçişleri Bakanlığı / Nüfus Müdürlüğü")
  // böylece "Nereye" arama listesinde parent/child ilişkisi görünür olur.
  readonly externalInstitutionOptions = computed(() => {
    const nameMap = this.externalInstitutionNameMap();
    return this.externalInstitutions()
      .map(i => ({
        id: i.id,
        name: i.parentId && nameMap[i.parentId] ? `${nameMap[i.parentId]} / ${i.name}` : i.name
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  });

  // Güncellemede kayıttaki birim/kurum/dil, ilgili liste geldikten sonra bir kez
  // control'e yazılır. Bir kez uygulandıktan sonra kullanıcının seçimi liste
  // yeniden yüklense bile (ör. "Tekrar dene") üzerine yazılmaz.
  private editDepartmentApplied = false;
  private editInstitutionApplied = false;
  private editLanguageApplied = false;
  readonly departmentControl = new FormControl<DepartmentModel | null>(null);
  readonly externalInstitutionControl = new FormControl<{ id: string; name: string } | null>(null);
  readonly languageControl = new FormControl<LanguageModel | null>(null);

  // Sağdaki yardım panelindeki canlı "Evrak yolu" özeti için seçili birim/kurum
  // adları; FormControl değerleri sinyale çevrilerek OnPush görünümde izlenir.
  private readonly selectedDepartment = toSignal(this.departmentControl.valueChanges, {
    initialValue: this.departmentControl.value
  });
  private readonly selectedInstitution = toSignal(this.externalInstitutionControl.valueChanges, {
    initialValue: this.externalInstitutionControl.value
  });
  readonly selectedDepartmentName = computed(() => this.selectedDepartment()?.name ?? '');
  readonly selectedInstitutionName = computed(() => this.selectedInstitution()?.name ?? '');

  model = {
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

    // Yeni kayıtta, Birim Evrak Sorumlusu için "Nereden" alanı kullanıcının
    // kendi birimiyle önceden doldurulur. Kullanıcı bilgisi ve birim listesi
    // farklı zamanlarda gelebildiğinden ikisi de hazır olana kadar bekler.
    effect(() => {
      const departments = this.departments();
      const departmentId = this.user()?.departmentId;
      if (this.editingId() || departments.length === 0 || !departmentId) return;
      if (!this.roleService.has('Birim Evrak Sorumlusu')) return;
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

    // Güncellemede "Nereden"/"Nereye"/"Dil" alanları: evrak kaydı ile ilgili
    // seçenek listesi hangi sırayla gelirse gelsin, ikisi de hazır olduğunda
    // alan doldurulur. (Önceki sürümde kayıt listeden önce geldiğinde bekleyen
    // id boşa düşüyor ve alanlar bazen boş kalıyordu.)
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

    effect(() => {
      const item = this.editItem();
      const options = this.externalInstitutionOptions();
      if (!item || this.externalInstitutionsLoading() || this.editInstitutionApplied) return;
      this.editInstitutionApplied = true;
      if (!item.externalInstitutonId) return;

      const inst = options.find(i => i.id === item.externalInstitutonId);
      if (inst) {
        this.externalInstitutionControl.setValue(inst);
      } else {
        this.#toast.showToast('Uyarı', 'Kayıttaki alıcı kurum listede bulunamadı, lütfen yeniden seçiniz', 'warning');
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
    this.editInstitutionApplied = false;
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
  }

  cancel(): void {
    this.router.navigate(['/gidenevrak/outgoing']);
  }

  save(): void {
    // Buton zaten pasif; klavye/çift tık gibi yollarla gelen çağrılara karşı ek güvence.
    if (!this.formReady()) {
      this.#toast.showToast('Uyarı', 'Form bilgileri henüz yüklenmedi, lütfen bekleyiniz', 'warning');
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

    if (!this.externalInstitutionControl.value) {
      this.#toast.showToast('Uyarı', 'Alan birim zorunludur', 'warning');
      return;
    }

    const editingId = this.editingId();

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
      departmentId: this.departmentControl.value.id,
      externalInstitutonId: this.externalInstitutionControl.value.id
    };

    // CreatedUserId yalnızca yeni kayıtta gönderilir; güncellemede backend
    // "!= null" ise üzerine yazdığından, düzenleyen kullanıcı orijinal
    // oluşturucunun yerine geçmesin diye Update isteğine eklenmiyor.
    if (!editingId) {
      const createdUserId = this.currentUserId;
      if (!createdUserId) {
        this.#toast.showToast('Hata', 'Kullanıcı bilgisi alınamadı', 'error');
        return;
      }
      body.createdUserId = createdUserId;
    }

    const request$ = editingId
      ? this.outgoingDocumentService.updateOutgoingDocument({ ...body, id: editingId })
      // Bu form yalnızca manuel kayıt için kullanılıyor; kaynak sabit 1 (Evrak Takip, backend AllocationSourceEnum).
      : this.outgoingDocumentService.createOutgoingDocument({ ...body, status: OutgoingDocumentStatus.Taslak, source: 1 });

    this.saving.set(true);
    request$.subscribe({
      next: async (res) => {
        if (editingId) {
          this.saving.set(false);
          this.#toast.showToast('Başarılı', 'Giden evrak kaydı güncellendi', 'success');
          this.router.navigate(['/gidenevrak/outgoing']);
          return;
        }

        // Yeni kayıt: evrak, kaydı oluşturan kullanıcının zimmetine otomatik alınır.
        const allocated = await this.allocateToCurrentUser(res, body.qrCode!, body.createdUserId!);
        this.saving.set(false);
        this.#toast.showToast(
          'Başarılı',
          allocated ? 'Giden evrak kaydı oluşturuldu ve zimmetinize alındı' : 'Giden evrak kaydı oluşturuldu',
          'success'
        );
        this.router.navigate(['/gidenevrak/outgoing']);
      },
      error: (err) => {
        this.saving.set(false);
        console.error(err);
        this.#toast.showToast('Hata', editingId ? 'Giden evrak güncellenemedi' : 'Giden evrak kaydedilemedi', 'error');
      }
    });
  }

  // Kayıt sonrası evrakı oluşturan kullanıcıya zimmetler. Zimmetleme başarısız
  // olsa bile evrak kaydı korunur; kullanıcı uyarı ile bilgilendirilir.
  private async allocateToCurrentUser(createResponse: any, qrCode: string, userId: string): Promise<boolean> {
    try {
      // Create yanıtında id yoksa evrak belge numarasından bulunur.
      let outgoingDocumentId: string | undefined = createResponse?.id ?? createResponse?.data?.id;
      if (!outgoingDocumentId) {
        const doc = await firstValueFrom(this.outgoingDocumentService.getByQrCode(qrCode));
        outgoingDocumentId = doc?.id;
      }

      if (!outgoingDocumentId) {
        this.#toast.showToast('Uyarı', 'Evrak kaydedildi ancak zimmet oluşturulamadı', 'warning');
        return false;
      }

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
