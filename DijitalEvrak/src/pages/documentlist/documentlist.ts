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
import GenericModel from '../../../components/generic-model/generic-model';
import { CommonModule } from '@angular/common';
import { FlexiToastService } from 'flexi-toast';
import { FormsModule } from '@angular/forms';
import { IncomingDocumentService } from '../../services/incomingdocument';
import { IncomingDocumentModel } from '../../models/incoming-document/incoming-document.model';
import { Common } from '../../services/common';
import { SecurityDegreeLabels, SecurityDegreeIcons, SecurityDegreeBadgeClass } from '../../models/securitydegree.model';
import { UrgencyDegreeLabels, UrgencyDegreeInitials, UrgencyDegreeBadgeClass } from '../../models/urgencydegree.model';
import { DocumentTypeLabels } from '../../models/documenttype.model';
import { Department, DepartmentModel } from '../../services/department';
import { ExternalInstitution, ExternalInstitutionModel } from '../../services/external-institution';
import { httpResource } from '@angular/common/http';
import { UserModel } from '../users/users';
import { DocumentAllocation } from '../../services/documentallocation';
import { DocumentAllocationModel } from '../../models/documentallocation.model';
import { AllocationStatusEnum, AllocationStatusLabels } from '../../models/allocationstatus.model';
import { UploadDocumentModal } from '../../../components/upload-document-modal/upload-document-modal';
import { isSentToPublish } from '../../models/publishstatus.model';
import { DocumentNumberUploadError, DocumentUploadFlow } from '../../services/document-upload-flow';

type ListScope = 'all' | 'pending' | 'published';

// Yayın durumu akış durumundan ayrı (submissionStatus): yayına gönderilen evrak Kayıt
// Tamamlandı (2) olarak kalır, bu yüzden İşlem Bekleyenler yayına gönderilmemiş olanlardır.
function matchesScope(doc: IncomingDocumentModel, scope: ListScope): boolean {
  switch (scope) {
    case 'pending': return doc.status === 2 && !isSentToPublish(doc);
    case 'published': return isSentToPublish(doc);
    default: return true;
  }
}

@Component({
  imports: [
    FlexiGridModule,
    GenericModel,
    FormsModule,
    CommonModule,
    UploadDocumentModal
  ],
  templateUrl: './documentlist.html',
  // Kullanıcılar sayfasıyla aynı kart başlığı: st-* / zl-* setleri ve ızgarayı karta oturtan us-* kuralları.
  styleUrls: [
    '../settings/settings.css',
    '../zimmetlerim/zimmetlerim.css',
    '../users/users.css',
    // Zimmet Geçmişi popup'ı (zh-*): Gelen Evraklar (scanlist) sayfasıyla ortak
    '../scanlist/scanlist.css',
    './documentlist.css'
  ],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Documentlist {
  // Sayfa yöneticiler için: OCR durumuna göre süzme yok, tüm evraklar listelenir.
  selectedOcrFilter = 'all';
  readonly #common = inject(Common);
  readonly user = computed(() => this.#common.user());
  readonly scanListData = signal<IncomingDocumentModel[]>([]);

  // Gizlilik ve İvedilik sütunları Gelen Evraklar (scanlist) listesiyle aynı: ikonlu / baş harfli
  // renkli rozet; filtre ve Excel çıktısı için metin etiketleri satıra eklenir.
  readonly securityDegreeMap: Record<number, string> = SecurityDegreeLabels;
  readonly securityDegreeIconMap: Record<number, string> = SecurityDegreeIcons;
  readonly securityDegreeBadgeClassMap: Record<number, string> = SecurityDegreeBadgeClass;
  readonly securityDegreeFilterData: FlexiGridFilterDataModel[] =
    Object.values(SecurityDegreeLabels).map(label => ({ name: label, value: label }));
  readonly urgencyDegreeMap: Record<number, string> = UrgencyDegreeLabels;
  readonly urgencyDegreeInitialMap: Record<number, string> = UrgencyDegreeInitials;
  readonly urgencyDegreeBadgeClassMap: Record<number, string> = UrgencyDegreeBadgeClass;
  readonly urgencyDegreeFilterData: FlexiGridFilterDataModel[] =
    Object.values(UrgencyDegreeLabels).map(label => ({ name: label, value: label }));
  // Nereden (dış kurum / misyon) ve Nereye (evrakın birimi) adları kimliklerden çözülür
  private readonly departmentService = inject(Department);
  private readonly externalInstitutionService = inject(ExternalInstitution);
  readonly departments = signal<DepartmentModel[]>([]);
  readonly externalInstitutions = signal<ExternalInstitutionModel[]>([]);

  readonly documentTypeLabelMap: Record<number, string> = DocumentTypeLabels;
  readonly documentTypeFilterData: FlexiGridFilterDataModel[] =
    Object.values(DocumentTypeLabels).map(label => ({ name: label, value: label }));
  readonly gridRows = computed(() =>
    this.scanListData()
      .filter(doc => matchesScope(doc, this.listScope()))
      .map(doc => ({
      ...doc,
      documentTypeLabel: (doc.documentTypeId != null && this.documentTypeLabelMap[doc.documentTypeId]) || '-',
      fromLabel: this.placeLabel(doc.externalInstitutionId, true),
      fromTitle: this.placeLabel(doc.externalInstitutionId, false),
      toLabel: this.placeLabel(doc.departmentId, true),
      toTitle: this.placeLabel(doc.departmentId, false),
      securityDegreeLabel: (doc.securityDegree != null && this.securityDegreeMap[doc.securityDegree]) || '-',
      urgencyDegreeLabel: (doc.urgencyDegree != null && this.urgencyDegreeMap[doc.urgencyDegree]) || '-'
    }))
  );
  readonly documentsResourceSig = signal<any>(null);
  readonly #toast = inject(FlexiToastService);
  private readonly router = inject(Router);
  private readonly incomingDocumentService = inject(IncomingDocumentService);
  private readonly allocationService = inject(DocumentAllocation);
  readonly loading = computed(() => this.documentsResourceSig()?.isLoading?.() ?? false);

  showFilters = false;

  private emptyToastShown = false;

  readonly personFilter = signal<FlexiGridFilterDataModel[]>([
    { name: 'Bahadır Tunçay', value: 'Bahadır Tunçay' },
    { name: 'Bülent Arslan', value: 'Bülent Arslan' },
    { name: 'Oral Akçakoyun', value: 'Oral Akçakoyun' },
    { name: 'Ömer Ersoy', value: 'Ömer Ersoy' },
    { name: 'Yener Şahin', value: 'Yener Şahin' },
    { name: 'Murat Kale', value: 'Murat Kale' }
  ]);

  constructor() {
    this.setupDocumentsEffect();
    this.loadDocuments();

    this.departmentService.getDepartments().subscribe({
      next: (res) => this.departments.set(res ?? []),
      error: () => this.departments.set([])
    });
    this.externalInstitutionService.getExternalInstitutions().subscribe({
      next: (res) => this.externalInstitutions.set(res ?? []),
      error: () => this.externalInstitutions.set([])
    });

    effect(() => {
      const type = this.incomingDocumentService.currentIncomingDocumentSearchType;

      if (type === 'pending') {
        this.listScope.set('pending');
      }
    });
  }

  /** Nereden / Nereye: bakanlık birimi kısa adıyla (kısa adı yoksa tam adıyla),
   *  dış kurum / misyon tam adıyla yazılır. compact=false tam adı verir (hücre title'ı için). */
  private placeLabel(id: string | null | undefined, compact: boolean): string {
    if (!id) return '-';
    const key = id.toLowerCase();
    const dept = this.departments().find(d => d.id?.toLowerCase() === key);
    if (dept) return compact ? (dept.shortName?.trim() || dept.name) : dept.name;
    return this.externalInstitutions().find(i => i.id?.toLowerCase() === key)?.name || '-';
  }

  get currentUserId(): string | undefined {
    return this.user()?.id;
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

      const mapped = docs.map((item: IncomingDocumentModel) => ({
        ...item,
        assignmentStatus: item.currentAssignmentUserId
          ? (item.currentAssignmentUserId === this.currentUserId ? 'assignedToMe' : 'assignedToOther')
          : 'unassigned'
      }));

      this.scanListData.set(mapped);

    });
  }
  private loadDocuments(): void {
    this.documentsResourceSig.set(
      this.incomingDocumentService.getIncomingDocumentsByStatus(this.selectedOcrFilter)
    );
  }

  // OCR filtre değiştiğinde yeni resource set et (kritik fix)
  onOcrFilterChange() {
    //console.log('change başladı ... ' + this.selectedOcrFilter);

    this.emptyToastShown = false;

    this.documentsResourceSig.set(
      this.incomingDocumentService.getIncomingDocumentsByStatus(this.selectedOcrFilter)
    );
  }

  toggleFilter() {
    this.showFilters = !this.showFilters;
  }



  /** Yönetici: atama (işleme alma) ya da kilit kontrolü yapmadan belge detayına gider. */
  goToDetail(id: string) {
    this.incomingDocumentService.setSelectedIncomingDocument(id);
    this.incomingDocumentService.setIncomingDocumentUpdateType('1');
    this.router.navigate(['/evrakkayit']);
  }

  goToProcess(id: string) {
    this.incomingDocumentService.setSelectedIncomingDocument(id);
    this.router.navigate(['/surecler']);
  }


  goToZimmet(id: string) {
    this.incomingDocumentService.setZimmetIncomingDocument(id);
    this.router.navigate(['/zimmet']);
  }

  /** Üstteki sekmeler. Liste bir kez yüklenir, seçili sekmeye göre ekranda süzülür:
   *  Tümü, İşlem Bekleyenler (Kayıt Tamamlandı ve yayına gönderilmemiş),
   *  Yayınlananlar (yayına gönderilmiş: aktarımda, yayınlandı ya da hatalı; submissionStatus >= 2).
   *  Yöneticiler sayfayı ilk açtığında yayınlanan evrakları görür. */
  readonly listScope = signal<ListScope>('published');

  setListScope(scope: ListScope) {
    this.listScope.set(scope);
  }

  // ---- Zimmet Geçmişi popup (tüm roller) ----
  // Gelen Evraklar (scanlist) listesindeki popup'ın aynısı: evrakın mevcut ve
  // geçmiş zimmetleri salt okunur bir popup'ta gösterilir. Gelen evrak zimmet kaydında
  // "teslim eden" (createdFullName) alanı bulunmadığından o satır burada yoktur.

  readonly zimmetHistoryVisible = signal(false);
  readonly zimmetHistoryLoading = signal(false);
  readonly zimmetHistoryDoc = signal<IncomingDocumentModel | null>(null);
  readonly zimmetHistory = signal<DocumentAllocationModel[]>([]);
  readonly activeZimmet = computed(() => this.zimmetHistory().find(h => h.isActive) ?? null);
  // Hareketler bölümü açılır/kapanır; popup her açılışta açık başlar.
  readonly zimmetHistoryExpanded = signal(true);
  readonly allocationStatusLabels: Record<number, string> = AllocationStatusLabels;

  // Popup'ta kişi adının yanında çalıştığı birimin kısa adı parantez içinde gösterilir.
  // Zimmet kaydı birim taşımadığı için kullanıcı listesinden userId ile eşlenir. Liste,
  // sayfa açılışını yavaşlatmasın diye popup ilk açıldığında bir kez yüklenir.
  private readonly usersRequested = signal(false);
  readonly usersResult = httpResource<UserModel[]>(() => this.usersRequested() ? 'api/Users/GetAll' : undefined);
  readonly userDepartmentShortMap = computed(() => {
    const map: Record<string, string> = {};
    for (const u of this.usersResult.value() ?? []) {
      const short = u.departmentShortName?.trim() || u.departmentName?.trim();
      if (u.id && short) map[u.id.toLowerCase()] = short;
    }
    return map;
  });

  personLabel(a: DocumentAllocationModel): string {
    const name = a.fullName || '-';
    const short = a.userId ? this.userDepartmentShortMap()[a.userId.toLowerCase()] : undefined;
    return short ? `${name} (${short})` : name;
  }

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

  initials(fullName?: string | null): string {
    const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    const first = parts[0].charAt(0);
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return `${first}${last}`.toLocaleUpperCase('tr');
  }

  // Hareket kartının altında, Ön Kayıt dışındaki durumlarda işlemi yapan kişi küçük
  // gösterilir ("Devreden: …", "Teslim eden: …"). Gelen evrak zimmet kaydı işlemi yapanı
  // taşımadığından kişi zincirden bulunur: kayıttan hemen önceki (tarihe göre) zimmetin
  // sahibi evrakı devreden / teslim eden kişidir. (Gelen Evraklar/scanlist ile aynı.)
  readonly allocationActorLabels: Partial<Record<AllocationStatusEnum, string>> = {
    [AllocationStatusEnum.Devir]: 'Devreden',
    [AllocationStatusEnum.Teslim]: 'Teslim eden',
    [AllocationStatusEnum.TeslimAlindi]: 'Teslim eden',
    [AllocationStatusEnum.Arsiv]: 'Arşive kaldıran',
    [AllocationStatusEnum.KargoyaVerildi]: 'Kargoya veren'
  };

  readonly zimmetActors = computed(() => {
    const chronological = [...this.zimmetHistory()]
      .sort((a, b) => new Date(a.createdDate).getTime() - new Date(b.createdDate).getTime());
    const actors: Record<string, string> = {};
    chronological.forEach((h, i) => {
      if (h.status === AllocationStatusEnum.IlkKayit || !this.allocationActorLabels[h.status]) return;
      const previous = chronological[i - 1];
      if (previous) actors[h.id] = this.personLabel(previous);
    });
    return actors;
  });

  openZimmetHistory(item: IncomingDocumentModel): void {
    if (!item.id) return;
    this.usersRequested.set(true);
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

  // ---- Evrak Yükle penceresi ----
  // Yönetici evrak numarası ve PDF ile gelen evrak yükler (UploadWithDocumentNumber):
  // numaraya ait evrak varsa dosya ona bağlanır, yoksa yeni evrak oluşturulur; zimmeti
  // backend verir. Yanıtta Id dönmediği için evrak numarayla çekilip kaydı tamamlamak
  // üzere Evrak Kayıt ekranı açılır. (Akış DocumentUploadFlow'da, scanlist ile ortak.)
  private readonly uploadFlow = inject(DocumentUploadFlow);
  readonly newUploadOpen = signal(false);
  readonly newUploadLoading = signal(false);

  openNewUpload(): void {
    this.newUploadOpen.set(true);
  }

  closeNewUpload(): void {
    if (this.newUploadLoading()) return;
    this.newUploadOpen.set(false);
  }

  confirmNewUpload({ qrCode, file }: { qrCode: string; file: File }): void {
    const userId = this.currentUserId;
    if (!userId) {
      this.#toast.showToast('Hata', 'Kullanıcı bulunamadı', 'error');
      return;
    }
    if (this.newUploadLoading()) return;

    this.newUploadLoading.set(true);
    this.uploadFlow.runWithDocumentNumber(qrCode, file, userId).subscribe({
      next: (doc) => {
        this.newUploadLoading.set(false);
        this.newUploadOpen.set(false);
        if (doc?.id) {
          this.goToDetail(doc.id);
        } else {
          // Yükleme tamam ama evrak çekilemedi; listede görünsün
          this.onOcrFilterChange();
        }
      },
      error: (err: DocumentNumberUploadError) => {
        this.newUploadLoading.set(false);
        if (err?.userMessage) this.#toast.showToast('Uyarı', err.userMessage, 'warning');
      }
    });
  }

}
