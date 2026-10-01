import {
  ChangeDetectionStrategy,
  Component,
  signal,
  ViewEncapsulation,
  computed,
  inject,
  effect
} from '@angular/core';
import { FlexiGridFilterDataModel, FlexiGridModule } from 'flexi-grid';
import { Router } from '@angular/router';
import GenericModel from '../../../../components/generic-model/generic-model';
import { CommonModule } from '@angular/common';
import { FlexiToastService } from 'flexi-toast';
import { OutgoingDocumentService } from '../../../services/outgoingdocument';
import { OutgoingDocumentModel } from '../../../models/outgoingdocument.model';
import { distributionRecipientName } from '../../../models/outgoingdocumentdistribution.model';
import { OutgoingDocumentAllocation } from '../../../services/outgoingdocumentallocation';
import { OutgoingDocumentAllocationModel } from '../../../models/outgoingdocumentallocation.model';
import { AllocationStatusEnum, AllocationStatusLabels } from '../../../models/allocationstatus.model';
import { ZimmetStateService } from '../../../services/zimmet-state-service';
import { Department, DepartmentModel } from '../../../services/department';
import { ExternalInstitution, ExternalInstitutionModel } from '../../../services/external-institution';
import { SecurityDegreeLabels, SecurityDegreeIcons, SecurityDegreeBadgeClass } from '../../../models/securitydegree.model';
import { UrgencyDegreeLabels, UrgencyDegreeInitials, UrgencyDegreeBadgeClass } from '../../../models/urgencydegree.model';
import { DocumentTypeLabels } from '../../../models/documenttype.model';
import { Common } from '../../../services/common';
import { RoleService } from '../../../services/role-service';

// Guid eşlemeleri harf duyarsız: kayıtlardaki Id'ler listelerdekinden farklı harfle gelebilir
const key = (id: string) => id.toLowerCase();

@Component({
  imports: [
    FlexiGridModule,
    GenericModel,
    CommonModule
  ],
  templateUrl: './outgoing.html',
  styleUrls: ['./outgoing.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Outgoing {
  readonly scanListData = signal<OutgoingDocumentModel[]>([]);
  readonly documentsResourceSig = signal<any>(null);
  readonly #toast = inject(FlexiToastService);
  private readonly router = inject(Router);
  // "Zimmet" aksiyonu /gidenevrak/outgoingzimmet üzerinden OutgoingDocumentAllocations'a gidiyor.
  private readonly outgoingDocumentService = inject(OutgoingDocumentService);
  private readonly allocationService = inject(OutgoingDocumentAllocation);
  private readonly zimmetState = inject(ZimmetStateService);
  private readonly departmentService = inject(Department);
  private readonly externalInstitutionService = inject(ExternalInstitution);
  private readonly common = inject(Common);
  private readonly roleService = inject(RoleService);
  readonly loading = computed(() => this.documentsResourceSig()?.isLoading?.() ?? false);

  readonly departments = signal<DepartmentModel[]>([]);
  readonly externalInstitutions = signal<ExternalInstitutionModel[]>([]);

  // Liste görünümünde "Nereden"/"Nereye" sütunları için id -> ad eşlemesi.
  // Anahtarlar küçük harfle tutulur: evrak/dağıtım kayıtlarındaki Guid'ler
  // birim listesindekinden farklı harfle gelebilir (bkz. key()).
  readonly departmentNameMap = computed(() => {
    const map: Record<string, string> = {};
    for (const d of this.departments()) map[key(d.id)] = d.name;
    return map;
  });

  // "Nereden" ve "Nereye" sütunlarında merkez birimler kısa adla gösterilir (yer
  // kazanmak için); kısa adı olmayan birimlerde tam ada düşülür.
  readonly departmentShortNameMap = computed(() => {
    const map: Record<string, string> = {};
    for (const d of this.departments()) map[key(d.id)] = d.shortName?.trim() || d.name;
    return map;
  });

  readonly externalInstitutionNameMap = computed(() => {
    const map: Record<string, string> = {};
    for (const i of this.externalInstitutions()) map[key(i.id)] = i.name;
    return map;
  });

  // Grid sütun filtreleri "Nereden"/"Nereye"/"Türü"/"Giz. Der."/"İvedilik" için
  // ham (id/enum) değer yerine ekranda gösterilen metin üzerinden filtrelenebilsin
  // diye satırlara bu türetilmiş alanlar ekleniyor; görünüm (ikon/rozet) hâlâ
  // hücre şablonlarındaki ham alanlardan (type, securityDegree, ...) hesaplanıyor.
  readonly gridData = computed(() => {
    const deptMap = this.departmentNameMap();
    const deptShortMap = this.departmentShortNameMap();
    const instMap = this.externalInstitutionNameMap();
    return this.scanListData().map(doc => {
      // Hücrede kısa biçim (iç birimler kısa adla) virgülle ayrılmış tek
      // satırda; üzerine gelince tam adlar alt alta gösterilir.
      const recipientNames = this.recipientNames(doc, deptShortMap, instMap);
      const recipientFullNames = this.recipientNames(doc, deptMap, instMap);
      return {
        ...doc,
        documentTypeLabel: (doc.type != null && this.documentTypeLabelMap[doc.type]) || '-',
        securityDegreeLabel: (doc.securityDegree != null && this.securityDegreeMap[doc.securityDegree]) || '-',
        urgencyDegreeLabel: (doc.urgencyDegree != null && this.urgencyDegreeMap[doc.urgencyDegree]) || '-',
        departmentName: (doc.departmentId && deptShortMap[key(doc.departmentId)]) || '-',
        departmentTitle: (doc.departmentId && deptMap[key(doc.departmentId)]) || '',
        externalInstitutionName: recipientNames.length ? recipientNames.join(', ') : '-',
        recipientTitle: recipientFullNames.join('\n')
      };
    });
  });

  // "Nereye" sütunu: evrak birden fazla iç birime ve/veya dış kuruma gidebilir.
  // GetAll yanıtındaki dağıtım listesi (silinmemiş satırlar) okunur; dağıtımı
  // olmayan eski kayıtlarda evrak üzerindeki tek alıcı alanına düşülür.
  // İç birimler verilen eşlemedeki adla (hücrede kısa, title'da tam) yazılır;
  // dış kurumlar her iki durumda da tam adla gösterilir.
  private recipientNames(
    doc: OutgoingDocumentModel,
    deptMap: Record<string, string>,
    instMap: Record<string, string>
  ): string[] {
    const names = (doc.distributions ?? [])
      .map(d => {
        if (d.departmentId) {
          const name = deptMap[key(d.departmentId)] || d.departmentName || '';
          return name;
        }
        return d.externalInstitutionName
          || (d.externalInstitutionId && instMap[key(d.externalInstitutionId)])
          || distributionRecipientName(d);
      })
      .filter(n => n && n !== '-');
    if (names.length) return names;
    const legacy = doc.externalInstitutonId && instMap[key(doc.externalInstitutonId)];
    return legacy ? [legacy] : [];
  }

  readonly documentTypeFilterData = computed((): FlexiGridFilterDataModel[] =>
    Object.values(this.documentTypeLabelMap).map(label => ({ name: label, value: label }))
  );

  readonly securityDegreeFilterData = computed((): FlexiGridFilterDataModel[] =>
    Object.values(this.securityDegreeMap).map(label => ({ name: label, value: label }))
  );

  readonly urgencyDegreeFilterData = computed((): FlexiGridFilterDataModel[] =>
    Object.values(this.urgencyDegreeMap).map(label => ({ name: label, value: label }))
  );

  // "Nereden" hücresi kısa adı gösterdiği için filtre seçenekleri de kısa ad
  readonly departmentFilterData = computed((): FlexiGridFilterDataModel[] =>
    [...new Set(this.departments().map(d => d.shortName?.trim() || d.name))]
      .map(name => ({ name, value: name }))
  );

  readonly documentTypeLabelMap: Record<number, string> = DocumentTypeLabels;

  readonly securityDegreeMap: Record<number, string> = SecurityDegreeLabels;
  readonly securityDegreeIconMap: Record<number, string> = SecurityDegreeIcons;
  readonly securityDegreeBadgeClassMap: Record<number, string> = SecurityDegreeBadgeClass;

  readonly urgencyDegreeMap: Record<number, string> = UrgencyDegreeLabels;
  readonly urgencyDegreeInitialMap: Record<number, string> = UrgencyDegreeInitials;
  readonly urgencyDegreeBadgeClassMap: Record<number, string> = UrgencyDegreeBadgeClass;

  showFilters = false;

  readonly isBirimEvrakSorumlusu = computed(() => this.roleService.hasBirimEvrakRole());

  private emptyToastShown = false;

  constructor() {
    this.setupDocumentsEffect();
    this.loadDocuments();

    // Liste ekranındaki "Nereden"/"Nereye" sütunları için birim/kurum adları lazım.
    this.loadDepartments();
    this.loadExternalInstitutions();
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

  // Yönetici ve Giden Evrak rolündeki kullanıcılar hiçbir filtre göndermez
  // (tüm kayıtları görür); diğer kullanıcılar kendi departmentId'siyle
  // sınırlanır, böylece aynı birimdeki herkesin oluşturduğu evrakları görür
  // (sadece kendi oluşturduklarını değil).
  private get departmentFilterId(): string | undefined {
    return this.roleService.hasAny(['Yönetici', 'Giden Evrak']) ? undefined : this.common.user()?.departmentId;
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
      this.outgoingDocumentService.getAll(undefined, this.departmentFilterId)
    );
  }

  toggleFilter() {
    this.showFilters = !this.showFilters;
  }

  // Yalnızca aktif zimmeti "Teslim Edildi" (3) durumundaki evraklar salt okunur
  // Teslim Bilgisi ekranına gider; diğer tüm durumlar (İlk Kayıt, Devir, Teslim Alındı,
  // zimmet yok) Zimmetleme ekranını açar.
  goToZimmet(id: string) {
    this.zimmetState.setOutgoingDocumentId(id);

    this.allocationService.getActiveByDocumentId(id).subscribe({
      next: (allocation) => {
        // status tel üzerinde string gelebildiğinden sayıya çevrilerek karşılaştırılır.
        const delivered = !!allocation?.isActive && Number(allocation.status) === AllocationStatusEnum.Teslim;
        this.router.navigate([delivered ? '/gidenevrak/outgoingteslim' : '/gidenevrak/outgoingzimmet']);
      },
      error: () => this.router.navigate(['/gidenevrak/outgoingzimmet'])
    });
  }

  // ---- Zimmet Geçmişi popup (tüm roller) ----
  // Evrakın mevcut ve geçmiş zimmetleri salt okunur bir popup'ta gösterilir.
  // Birim Evrak Sorumlusu zimmetleme ekranına gidemediği için onun tek erişimi budur.

  readonly zimmetHistoryVisible = signal(false);
  readonly zimmetHistoryLoading = signal(false);
  readonly zimmetHistoryDoc = signal<OutgoingDocumentModel | null>(null);
  readonly zimmetHistory = signal<OutgoingDocumentAllocationModel[]>([]);
  readonly activeZimmet = computed(() => this.zimmetHistory().find(h => h.isActive) ?? null);
  // Hareketler bölümü açılır/kapanır; popup her açılışta açık başlar.
  readonly zimmetHistoryExpanded = signal(true);
  readonly allocationStatusLabels: Record<number, string> = AllocationStatusLabels;

  // Zaman çizelgesindeki nokta ikonu ve renk sınıfı zimmet durumuna göre değişir.
  readonly allocationStatusIcons: Record<number, string> = {
    [AllocationStatusEnum.IlkKayit]: 'post_add',
    [AllocationStatusEnum.Devir]: 'swap_horiz',
    [AllocationStatusEnum.Teslim]: 'handshake',
    [AllocationStatusEnum.Arsiv]: 'inventory_2',
    [AllocationStatusEnum.TeslimAlindi]: 'move_to_inbox',
    [AllocationStatusEnum.KargoyaVerildi]: 'local_shipping'
  };

  readonly allocationStatusClass: Record<number, string> = {
    [AllocationStatusEnum.IlkKayit]: 'is-ilkkayit',
    [AllocationStatusEnum.Devir]: 'is-devir',
    [AllocationStatusEnum.Teslim]: 'is-teslim',
    [AllocationStatusEnum.Arsiv]: 'is-arsiv',
    [AllocationStatusEnum.TeslimAlindi]: 'is-teslimalindi',
    [AllocationStatusEnum.KargoyaVerildi]: 'is-kargo'
  };

  // "Teslim eden" satırı yalnızca evrakın bir başkasından devralındığı kayıtlarda anlamlıdır:
  // İlk Kayıt'ta kimseden devralınmaz, Teslim Alındı'da ise kullanıcı evrakı kendi üzerine
  // aldığı için teslim eden işlemi yapan kişinin kendisidir.
  showsDeliverer(h: OutgoingDocumentAllocationModel): boolean {
    return !!h.createdFullName
      && h.status !== AllocationStatusEnum.IlkKayit
      && h.status !== AllocationStatusEnum.TeslimAlindi;
  }

  initials(fullName?: string | null): string {
    const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    const first = parts[0].charAt(0);
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return `${first}${last}`.toLocaleUpperCase('tr');
  }

  openZimmetHistory(item: OutgoingDocumentModel): void {
    this.zimmetHistoryDoc.set(item);
    this.zimmetHistory.set([]);
    this.zimmetHistoryExpanded.set(true);
    this.zimmetHistoryVisible.set(true);
    this.zimmetHistoryLoading.set(true);

    this.allocationService.getByDocumentId(item.id).subscribe({
      next: (history) => {
        // Aktif zimmet en üstte, ardından en yeniden eskiye.
        const sorted = (history ?? [])
          .filter(h => !h.isDeleted)
          .sort((a, b) => {
            if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
            return new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime();
          });
        this.zimmetHistory.set(sorted);
        this.zimmetHistoryLoading.set(false);
      },
      error: (err) => {
        console.error('Zimmet geçmişi alınamadı:', err);
        this.zimmetHistoryLoading.set(false);
        this.#toast.showToast('Hata', 'Zimmet geçmişi alınamadı', 'error');
      }
    });
  }

  closeZimmetHistory(): void {
    this.zimmetHistoryVisible.set(false);
  }

  toggleZimmetHistoryExpanded(): void {
    this.zimmetHistoryExpanded.update(v => !v);
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

  goToCreate(): void {
    this.router.navigate(['/gidenevrak/outgoing/create']);
  }

  goToEdit(item: OutgoingDocumentModel): void {
    this.router.navigate(['/gidenevrak/outgoing/create', item.id]);
  }

  private loadDepartments(): void {
    this.departmentService.getDepartments().subscribe({
      next: (res) => this.departments.set(res),
      error: (err) => {
        console.error(err);
        this.#toast.showToast('Hata', 'Birimler yüklenemedi', 'error');
      }
    });
  }

  private loadExternalInstitutions(): void {
    this.externalInstitutionService.getExternalInstitutions().subscribe({
      next: (res) => this.externalInstitutions.set(res),
      error: (err) => {
        console.error(err);
        this.#toast.showToast('Hata', 'Dış kurumlar yüklenemedi', 'error');
      }
    });
  }
}
