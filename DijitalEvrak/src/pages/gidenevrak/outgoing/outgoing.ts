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
import { IncomingDocumentService } from '../../../services/incomingdocument';
import { OutgoingDocumentService } from '../../../services/outgoingdocument';
import { OutgoingDocumentModel } from '../../../models/outgoingdocument.model';
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
  // NOT: "Süreçler" satır aksiyonu hâlâ IncomingDocumentService üzerinden
  // çalışıyor; OutgoingDocuments artık ayrı bir tablo/servis olduğu için bu
  // id'lerle doğru şekilde eşleşmeyebilir. Giden evrağa özel bir süreç ekranı
  // netleşene kadar davranışı değiştirilmedi. "Zimmet" aksiyonu ise artık
  // /gidenevrak/outgoingzimmet üzerinden OutgoingDocumentAllocations'a gidiyor.
  private readonly incomingDocumentService = inject(IncomingDocumentService);
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
  readonly departmentNameMap = computed(() => {
    const map: Record<string, string> = {};
    for (const d of this.departments()) map[d.id] = d.name;
    return map;
  });

  readonly externalInstitutionNameMap = computed(() => {
    const map: Record<string, string> = {};
    for (const i of this.externalInstitutions()) map[i.id] = i.name;
    return map;
  });

  // Grid sütun filtreleri "Nereden"/"Nereye"/"Türü"/"Giz. Der."/"İvedilik" için
  // ham (id/enum) değer yerine ekranda gösterilen metin üzerinden filtrelenebilsin
  // diye satırlara bu türetilmiş alanlar ekleniyor; görünüm (ikon/rozet) hâlâ
  // hücre şablonlarındaki ham alanlardan (type, securityDegree, ...) hesaplanıyor.
  readonly gridData = computed(() => {
    const deptMap = this.departmentNameMap();
    const instMap = this.externalInstitutionNameMap();
    return this.scanListData().map(doc => ({
      ...doc,
      documentTypeLabel: (doc.type != null && this.documentTypeLabelMap[doc.type]) || '-',
      securityDegreeLabel: (doc.securityDegree != null && this.securityDegreeMap[doc.securityDegree]) || '-',
      urgencyDegreeLabel: (doc.urgencyDegree != null && this.urgencyDegreeMap[doc.urgencyDegree]) || '-',
      departmentName: (doc.departmentId && deptMap[doc.departmentId]) || '-',
      externalInstitutionName: (doc.externalInstitutonId && instMap[doc.externalInstitutonId]) || '-'
    }));
  });

  readonly documentTypeFilterData = computed((): FlexiGridFilterDataModel[] =>
    Object.values(this.documentTypeLabelMap).map(label => ({ name: label, value: label }))
  );

  readonly securityDegreeFilterData = computed((): FlexiGridFilterDataModel[] =>
    Object.values(this.securityDegreeMap).map(label => ({ name: label, value: label }))
  );

  readonly urgencyDegreeFilterData = computed((): FlexiGridFilterDataModel[] =>
    Object.values(this.urgencyDegreeMap).map(label => ({ name: label, value: label }))
  );

  readonly departmentFilterData = computed((): FlexiGridFilterDataModel[] =>
    this.departments().map(d => ({ name: d.name, value: d.name }))
  );

  readonly externalInstitutionFilterData = computed((): FlexiGridFilterDataModel[] =>
    this.externalInstitutions().map(i => ({ name: i.name, value: i.name }))
  );

  readonly documentTypeLabelMap: Record<number, string> = DocumentTypeLabels;

  readonly securityDegreeMap: Record<number, string> = SecurityDegreeLabels;
  readonly securityDegreeIconMap: Record<number, string> = SecurityDegreeIcons;
  readonly securityDegreeBadgeClassMap: Record<number, string> = SecurityDegreeBadgeClass;

  readonly urgencyDegreeMap: Record<number, string> = UrgencyDegreeLabels;
  readonly urgencyDegreeInitialMap: Record<number, string> = UrgencyDegreeInitials;
  readonly urgencyDegreeBadgeClassMap: Record<number, string> = UrgencyDegreeBadgeClass;

  showFilters = false;

  readonly isBirimEvrakSorumlusu = computed(() => this.roleService.has('Birim Evrak Sorumlusu'));

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

  goToProcess(id: string) {
    this.incomingDocumentService.setSelectedIncomingDocument(id);
    this.router.navigate(['/surecler']);
  }

  goToZimmet(id: string) {
    this.zimmetState.setOutgoingDocumentId(id);
    this.router.navigate(['/gidenevrak/outgoingzimmet']);
  }

  // ---- Zimmet Geçmişi popup (Birim Evrak Sorumlusu) ----
  // Birim Evrak Sorumlusu zimmetleme ekranına gidemediği için evrakın mevcut ve
  // geçmiş zimmetlerini salt okunur bir popup'ta görür.

  readonly zimmetHistoryVisible = signal(false);
  readonly zimmetHistoryLoading = signal(false);
  readonly zimmetHistoryDoc = signal<OutgoingDocumentModel | null>(null);
  readonly zimmetHistory = signal<OutgoingDocumentAllocationModel[]>([]);
  readonly activeZimmet = computed(() => this.zimmetHistory().find(h => h.isActive) ?? null);
  readonly allocationStatusLabels: Record<number, string> = AllocationStatusLabels;
  readonly AllocationStatus = AllocationStatusEnum;

  // Zaman çizelgesindeki nokta ikonu ve renk sınıfı zimmet durumuna göre değişir.
  readonly allocationStatusIcons: Record<number, string> = {
    [AllocationStatusEnum.IlkKayit]: 'post_add',
    [AllocationStatusEnum.Devir]: 'swap_horiz',
    [AllocationStatusEnum.Teslim]: 'handshake',
    [AllocationStatusEnum.Arsiv]: 'inventory_2'
  };

  readonly allocationStatusClass: Record<number, string> = {
    [AllocationStatusEnum.IlkKayit]: 'is-ilkkayit',
    [AllocationStatusEnum.Devir]: 'is-devir',
    [AllocationStatusEnum.Teslim]: 'is-teslim',
    [AllocationStatusEnum.Arsiv]: 'is-arsiv'
  };

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
