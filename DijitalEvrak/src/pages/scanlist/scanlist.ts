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
import { IncomingDocumentService } from '../../services/incomingdocument';
import { IncomingDocumentModel } from '../../models/incoming-document/incoming-document.model';
import { DocumentAssignmentService } from '../../services/documentassignment';
import { Common } from '../../services/common';
import { RoleService } from '../../services/role-service';
import { DocumentAllocation } from '../../services/documentallocation';
import { DocumentAllocationModel } from '../../models/documentallocation.model';
import { AllocationStatusEnum, AllocationStatusLabels } from '../../models/allocationstatus.model';
import { SecurityDegreeLabels, SecurityDegreeIcons, SecurityDegreeBadgeClass } from '../../models/securitydegree.model';
import { UrgencyDegreeLabels, UrgencyDegreeInitials, UrgencyDegreeBadgeClass } from '../../models/urgencydegree.model';
import { HttpService } from '../../services/http';
import { UserRoleService } from '../../services/user-role';
import { normalizeRoleName } from '../../services/role-service';
import { UserModel } from '../users/users';
import { forkJoin, map, of, catchError, switchMap } from 'rxjs';
import { httpResource } from '@angular/common/http';
import { UPLOAD_DOCUMENT_ROLES, UploadDocumentModal } from '../../../components/upload-document-modal/upload-document-modal';
import { DocumentNumberUploadError, DocumentUploadFlow } from '../../services/document-upload-flow';
import { isPublished, isPublishFailed, isPublishing, isSentToPublish, publishStatusLabel } from '../../models/publishstatus.model';
import { DocumentTypeLabels } from '../../models/documenttype.model';
import { actionRequiredBadgeClass, actionRequiredIcon, actionRequiredLabel } from '../../models/actionrequired.model';
import { Department } from '../../services/department';
import { ExternalInstitution } from '../../services/external-institution';

// İşleme Al yalnızca dosyası olan ve Ön Kayıt / Kayıt Tamamlandı / Eşleştirme durumundaki evrakta yapılır
const PROCESSABLE_STATUSES: ReadonlySet<number> = new Set([1, 2, 4]);

// Evrak Bilgileri popup'ında gösterilen akış durumu (status) metinleri
const DOCUMENT_STATUS_LABELS: Record<number, string> = {
  1: 'Ön Kayıt',
  2: 'Kayıt Tamamlandı',
  3: 'Teslim Edildi',
  4: 'Eşleştirme',
  5: 'OCR',
  6: 'Kayıt Tamamlandı',
  10: 'Kayıt Tamamlandı'
};

const OCR_STATUS_LABELS: Record<number, string> = {
  0: 'Bekliyor',
  1: 'Tamamlandı',
  2: 'Hatalı'
};

// Atama popup'ında yalnızca evrak kaydı yapabilen (Gelen Evrak rolündeki) personel listelenir.
const ASSIGNABLE_ROLE = 'Gelen Evrak';

// Grid satırları backend'den gelen evrak alanlarına ek olarak atanan personelin
// adını (currentAssignmentUser) taşır; atama popup'ının başlığında gösterilir.
type ScanListRow = IncomingDocumentModel & { currentAssignmentUser?: string | null };

@Component({
  imports: [
    FlexiGridModule,
    GenericModel,
    CommonModule,
    UploadDocumentModal
  ],
  templateUrl: './scanlist.html',
  styleUrls: ['./scanlist.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Scanlist {
  selectedOcrFilter = 'completed';
  private assignmentService = inject(DocumentAssignmentService);
  readonly #common = inject(Common);
  readonly #roleService = inject(RoleService);
  readonly user = computed(() => this.#common.user());
  readonly scanListData = signal<IncomingDocumentModel[]>([]);

  // Gizlilik ve İvedilik sütunları Giden Evraklar listesiyle aynı: ikonlu / baş harfli
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
  // "Dosya" sütunu dosya adı yerine yalnızca dosyanın olup olmadığını gösterir;
  // filtre ve Excel çıktısı hasFileLabel metniyle çalışır.
  readonly hasFileFilterData: FlexiGridFilterDataModel[] = [
    { name: 'Var', value: 'Var' },
    { name: 'Yok', value: 'Yok' }
  ];
  readonly gridRows = computed(() =>
    this.scanListData().map(doc => ({
      ...doc,
      securityDegreeLabel: (doc.securityDegree != null && this.securityDegreeMap[doc.securityDegree]) || '-',
      urgencyDegreeLabel: (doc.urgencyDegree != null && this.urgencyDegreeMap[doc.urgencyDegree]) || '-',
      hasFileLabel: doc.documentName ? 'Var' : 'Yok'
    }))
  );
  readonly documentsResourceSig = signal<any>(null);
  readonly #toast = inject(FlexiToastService);
  private readonly router = inject(Router);
  private readonly incomingDocumentService = inject(IncomingDocumentService);
  private readonly allocationService = inject(DocumentAllocation);
  private readonly httpService = inject(HttpService);
  private readonly userRoleService = inject(UserRoleService);
  readonly loading = computed(() => this.documentsResourceSig()?.isLoading?.() ?? false);

  showFilters = false;

  private emptyToastShown = false;

  setOcrFilter(value: string) {
    this.selectedOcrFilter = value;
    this.showPublished = false;
    this.showPending = false;
    this.onOcrFilterChange();
  }

  readonly personFilter = signal<FlexiGridFilterDataModel[]>([
    { name: 'Bahadır Tunçay', value: 'Bahadır Tunçay' },
    { name: 'Bülent Arslan', value: 'Bülent Arslan' },
    { name: 'Oral Akçakoyun', value: 'Oral Akçakoyun' },
    { name: 'Ömer Ersoy', value: 'Ömer Ersoy' },
    { name: 'Yener Şahin', value: 'Yener Şahin' },
    { name: 'Murat Kale', value: 'Murat Kale' }
  ]);

  readonly ocrFilter = signal<FlexiGridFilterDataModel[]>([
    { name: 'Tamamlanmış', value: '1' },
    { name: 'Beklemede', value: '0' },
    { name: 'Beklemede', value: '2' }
  ]);

  // ---- Personel atama popup ----
  // Başka bir personele atanmış evrakı yeni bir personele aktarır. Personel listesi
  // popup ilk açıldığında bir kez çekilir ve yalnızca Gelen Evrak rolündeki aktif
  // kullanıcıları içerir (users sinyaline süzülmüş hali yazılır); mevcut atanan kişi
  // aday listesine girmez.
  readonly assignModalVisible = signal(false);
  readonly assignDoc = signal<ScanListRow | null>(null);
  readonly assignSelectedId = signal<string | null>(null);
  readonly assignSaving = signal(false);
  readonly usersLoading = signal(false);
  readonly users = signal<UserModel[]>([]);
  private usersLoaded = false;

  readonly assignCandidates = computed(() => {
    // Users/GetAll id'leri büyük harfli GUID, evraktaki currentAssignmentUserId küçük harfli
    // gelebildiğinden karşılaştırma küçük harfe indirgenerek yapılır.
    const currentAssignee = (this.assignDoc()?.currentAssignmentUserId ?? '').toLowerCase();
    return this.users()
      .filter((u): u is UserModel & { id: string } => !!u.id && u.isActive && !u.isDeleted)
      .filter(u => u.id.toLowerCase() !== currentAssignee)
      .sort((a, b) => this.userFullName(a).localeCompare(this.userFullName(b), 'tr'));
  });

  readonly assignSelected = computed(() =>
    this.users().find(u => u.id === this.assignSelectedId()) ?? null
  );

  userFullName(u: UserModel): string {
    return `${u.name ?? ''} ${u.surname ?? ''}`.trim();
  }

  constructor() {
    this.setupDocumentsEffect();
    this.loadDocuments();

    effect(() => {
      const type = this.incomingDocumentService.currentIncomingDocumentSearchType;

      if (type === 'pending') {
        this.showPending = false;
        this.togglePending();
      }
    });
  }

  get currentUserId(): string | undefined {
    return this.user()?.id;
  }

  // Yönetici ve Gelen Evrak rolleri hiçbir filtre göndermez (tüm gelen evrakları
  // görür); diğer kullanıcılar (ör. Birim Evrak Sorumlusu) kendi departmentId'siyle
  // sınırlanır, böylece sadece kendi birimlerine ait evrakları görür.
  private get departmentFilterId(): string | undefined {
    return this.#roleService.hasAny(['Yönetici', 'Gelen Evrak']) ? undefined : this.user()?.departmentId;
  }

  private setupDocumentsEffect(): void {
    effect(() => {
      const res = this.documentsResourceSig();
      if (!res || res.isLoading?.()) return;

      const docs = res.value?.() ?? [];

      if (!docs || docs.length === 0) {
        if (!this.emptyToastShown) {
          this.#toast.showToast('Uyarı', 'Herhangi bir belge bulunamadı');
          this.emptyToastShown = true;
        }
        this.scanListData.set([]);
        return;
      }

      this.emptyToastShown = false;

      let mapped = docs.map((item: IncomingDocumentModel) => ({
        ...item,
        assignmentStatus: item.currentAssignmentUserId
          ? (item.currentAssignmentUserId === this.currentUserId ? 'assignedToMe' : 'assignedToOther')
          : 'unassigned',
        ocrStr: (item.status ?? 0).toString()
      }));

      // yayınlanan filtre: yayına gönderilmiş evraklar (submissionStatus >= 2)
      if (this.showPublished) {
        mapped = mapped.filter((x: IncomingDocumentModel) => isSentToPublish(x));
      }

      this.scanListData.set(mapped);

    });
  }
  private loadDocuments(): void {
    this.documentsResourceSig.set(
      this.incomingDocumentService.getIncomingDocumentsByStatus(this.selectedOcrFilter, this.departmentFilterId)
    );
  }

  // OCR filtre değiştiğinde yeni resource set et (kritik fix)
  onOcrFilterChange() {
    //console.log('change başladı ... ' + this.selectedOcrFilter);

    this.emptyToastShown = false;

    this.documentsResourceSig.set(
      this.incomingDocumentService.getIncomingDocumentsByStatus(this.selectedOcrFilter, this.departmentFilterId)
    );
  }

  openPersonModal(item: ScanListRow) {
    if (!item.id) return;
    this.assignDoc.set(item);
    this.assignSelectedId.set(null);
    this.assignSaving.set(false);
    this.assignModalVisible.set(true);
    this.loadUsersOnce();
  }

  closePersonModal() {
    if (this.assignSaving()) return;
    this.assignModalVisible.set(false);
  }

  selectAssignee(user: UserModel) {
    if (!user.id) return;
    // Seçili kişiye tekrar tıklanınca seçim kaldırılır.
    this.assignSelectedId.update(current => current === user.id ? null : user.id!);
  }

  // Backend'de kullanıcıları role göre getiren bir uç olmadığından önce tüm aktif
  // kullanıcılar çekilir, ardından her biri için UserRole/GetRolesByUserId sorgulanıp
  // Gelen Evrak rolü olanlar tutulur. Rolü alınamayan kullanıcı listeye girmez.
  private loadUsersOnce() {
    if (this.usersLoaded) return;
    this.usersLoading.set(true);
    this.httpService.get<UserModel[]>('api/Users/GetAll').pipe(
      switchMap(res => {
        const active = (res ?? []).filter((u): u is UserModel & { id: string } => !!u.id && u.isActive && !u.isDeleted);
        if (!active.length) return of([] as UserModel[]);
        return forkJoin(
          active.map(u =>
            this.userRoleService.getRolesByUserId(u.id).pipe(
              map(roles => (roles ?? []).map(normalizeRoleName).includes(ASSIGNABLE_ROLE) ? u : null),
              catchError(() => of(null))
            )
          )
        ).pipe(map(list => list.filter((u): u is UserModel & { id: string } => !!u)));
      })
    ).subscribe({
      next: (assignable) => {
        this.users.set(assignable);
        this.usersLoaded = true;
        this.usersLoading.set(false);
      },
      error: (err) => {
        console.error('Personel listesi alınamadı:', err);
        this.usersLoading.set(false);
        this.#toast.showToast('Hata', 'Personel listesi alınamadı', 'error');
      }
    });
  }

  savePerson() {
    const docId = this.assignDoc()?.id;
    const person = this.assignSelected();

    if (!docId) {
      this.#toast.showToast('Bilgi', 'Evrak bulunamadı.', 'info');
      return;
    }
    if (!person?.id) {
      this.#toast.showToast('Bilgi', 'Atama yapmak istediğiniz personeli seçiniz.', 'info');
      return;
    }

    this.assignSaving.set(true);
    this.assignmentService.createAssignment({
      documentId: docId,
      userId: person.id
    }).subscribe({
      next: () => {
        this.assignSaving.set(false);
        this.assignModalVisible.set(false);
        this.#toast.showToast('Başarılı', `Evrak ${this.userFullName(person)} personeline atandı`, 'success');
        this.loadDocuments();
      },
      error: () => {
        this.assignSaving.set(false);
        this.#toast.showToast('Hata', 'Atama oluşturulamadı', 'error');
      }
    });
  }

  toggleFilter() {
    this.showFilters = !this.showFilters;
  }



  goToDetail(id: string) {

    const currentUserId = this.user()?.id;

    if (!currentUserId) {
      this.#toast.showToast('Hata', 'Kullanıcı bulunamadı', 'error');
      return;
    }
    //console.log(id + " user id : "+ currentUserId);

    this.assignmentService.createAssignment({
      documentId: id,
      userId: currentUserId
    }).subscribe({
      next: () => {
        this.incomingDocumentService.setSelectedIncomingDocument(id);
        this.incomingDocumentService.setIncomingDocumentUpdateType('1');
        this.router.navigate(['/evrakkayit']);
      },
      error: () => {
        this.#toast.showToast('Hata', 'Atama oluşturulamadı', 'error');
      }
    });

  }

  goToProcess(id: string) {
    this.incomingDocumentService.setSelectedIncomingDocument(id);
    this.router.navigate(['/surecler']);
  }


  goToZimmet(id: string) {
    this.incomingDocumentService.setZimmetIncomingDocument(id);
    this.router.navigate(['/zimmet']);
  }

  // ---- Zimmet Geçmişi popup (tüm roller) ----
  // Giden Evraklar listesindeki popup'ın gelen evrak karşılığı: evrakın mevcut ve
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

  // Zaman çizelgesindeki nokta ikonu ve renk sınıfı zimmet durumuna göre değişir.
  readonly allocationStatusIcons: Record<number, string> = {
    [AllocationStatusEnum.IlkKayit]: 'post_add',
    [AllocationStatusEnum.Devir]: 'swap_horiz',
    [AllocationStatusEnum.Teslim]: 'handshake',
    [AllocationStatusEnum.Arsiv]: 'inventory_2',
    [AllocationStatusEnum.TeslimAlindi]: 'move_to_inbox',
    [AllocationStatusEnum.KargoyaVerildi]: 'local_shipping',
    [AllocationStatusEnum.DevirAlindi]: 'how_to_reg'
  };

  readonly allocationStatusClass: Record<number, string> = {
    [AllocationStatusEnum.IlkKayit]: 'is-ilkkayit',
    [AllocationStatusEnum.Devir]: 'is-devir',
    [AllocationStatusEnum.Teslim]: 'is-teslim',
    [AllocationStatusEnum.Arsiv]: 'is-arsiv',
    [AllocationStatusEnum.TeslimAlindi]: 'is-teslimalindi',
    [AllocationStatusEnum.KargoyaVerildi]: 'is-kargo',
    [AllocationStatusEnum.DevirAlindi]: 'is-devir'
  };

  initials(fullName?: string | null): string {
    const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    const first = parts[0].charAt(0);
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return `${first}${last}`.toLocaleUpperCase('tr');
  }

  // Popup'ta kişi adının yanında çalıştığı birimin kısa adı parantez içinde gösterilir.
  // Zimmet kaydı birim taşımadığı için kullanıcı listesinden userId ile eşlenir. Atama
  // popup'ının listesi yalnızca Gelen Evrak rolünü tuttuğundan tüm kullanıcılar ayrıca,
  // sayfa açılışını yavaşlatmasın diye popup ilk açıldığında bir kez yüklenir.
  private readonly allUsersRequested = signal(false);
  readonly allUsersResult = httpResource<UserModel[]>(() => this.allUsersRequested() ? 'api/Users/GetAll' : undefined);
  readonly userDepartmentShortMap = computed(() => {
    const map: Record<string, string> = {};
    for (const u of this.allUsersResult.value() ?? []) {
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

  // Hareket kartının altında, Ön Kayıt dışındaki durumlarda işlemi yapan kişi küçük
  // gösterilir ("Devreden: …", "Teslim eden: …"). Gelen evrak zimmet kaydı işlemi yapanı
  // taşımadığından kişi zincirden bulunur: kayıttan hemen önceki (tarihe göre) zimmetin
  // sahibi evrakı devreden / teslim eden kişidir.
  readonly allocationActorLabels: Partial<Record<AllocationStatusEnum, string>> = {
    [AllocationStatusEnum.Devir]: 'Devreden',
    [AllocationStatusEnum.Teslim]: 'Teslim eden',
    [AllocationStatusEnum.TeslimAlindi]: 'Teslim eden',
    [AllocationStatusEnum.Arsiv]: 'Arşive kaldıran',
    [AllocationStatusEnum.KargoyaVerildi]: 'Kargoya veren',
    [AllocationStatusEnum.DevirAlindi]: 'Devreden'
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

  // Yayınlanma sütunu: Atlas'a yayın durumu (submissionStatus; bkz. publishstatus.model)
  readonly isPublished = isPublished;
  readonly isPublishing = isPublishing;
  readonly isPublishFailed = isPublishFailed;
  readonly publishStatusLabel = publishStatusLabel;

  // ---- Evrak Yükle penceresi ----
  // Yönetici listesindeki (documentlist) Evrak Yükle ile aynı: evrak numarası ve PDF ile
  // gelen evrak yüklenir (DocumentUploadFlow.runWithDocumentNumber), ardından kaydı
  // tamamlamak için evrak İşleme Al akışıyla Evrak Kayıt'ta açılır. Buton yalnızca
  // belge yükleme yetkisi olan rollere görünür (UPLOAD_DOCUMENT_ROLES).
  private readonly uploadFlow = inject(DocumentUploadFlow);
  readonly canUploadDocument = computed(() => this.#roleService.hasAny(UPLOAD_DOCUMENT_ROLES));
  readonly newUploadOpen = signal(false);
  readonly newUploadLoading = signal(false);

  openNewUpload(): void {
    if (!this.canUploadDocument()) return;
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

  openZimmetHistory(item: IncomingDocumentModel): void {
    if (!item.id) return;
    this.allUsersRequested.set(true);
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

  // ---- Evrak Bilgileri popup ----
  // İşleme alınamayan evrakta (dosyası yok ya da akış durumu uygun değil) İşleme Al
  // alanında bir bağlantı çıkar; evrakın tüm bilgileri salt okunur popup'ta gösterilir.
  // Ek bilgisi gibi alanlar liste yanıtında eksik olabileceğinden evrak GetById ile tazelenir.
  private readonly departmentService = inject(Department);
  private readonly externalInstitutionService = inject(ExternalInstitution);
  private readonly departmentNames = signal<Record<string, string>>({});
  private readonly institutionNames = signal<Record<string, string>>({});
  private lookupsRequested = false;

  readonly infoVisible = signal(false);
  readonly infoLoading = signal(false);
  readonly infoDoc = signal<ScanListRow | null>(null);

  isProcessable(item: IncomingDocumentModel): boolean {
    return !!item.documentName && PROCESSABLE_STATUSES.has(item.status);
  }

  // Bağlantının üzerinde neden işleme alınamadığı yazar
  notProcessableReason(item: IncomingDocumentModel): string {
    if (!item.documentName) return 'Belge dosyası yüklenmemiş';
    return `Evrak ${DOCUMENT_STATUS_LABELS[item.status] ?? 'bu'} durumunda`;
  }

  // Popup içeriği: başlıkta evrak no + konu ve durum çipleri, altında sınıflandırma
  // şeridi (tür, gizlilik, ivedilik, Gereği/Bilgi), gövdede solda Nereden -> Nereye ve
  // künye bilgileri, sağda Belge Özellikleri paneli, en altta atanan personel ve tarihler.
  readonly infoView = computed(() => {
    const d = this.infoDoc();
    if (!d) return null;
    const text = (v: unknown) => (v === null || v === undefined || v === '' ? '-' : String(v));
    const date = (v?: string | Date | null) => v ? new Date(v).toLocaleDateString('tr-TR') : '-';
    const dateTime = (v?: string | Date | null) => v
      ? new Date(v).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '-';
    const languages: Record<number, string> = { 1: 'Türkçe', 2: 'İngilizce' };
    const ocr = d.ocrStatus ?? 0;

    return {
      qrCode: text(d.qrCode),
      subject: d.subject?.trim() || '',
      documentType: text(DocumentTypeLabels[d.documentTypeId as keyof typeof DocumentTypeLabels]),
      documentDate: date(d.documentDate),
      orginalNo: text(d.orginalNo),
      notes: d.notes?.trim() || '',

      security: {
        label: text(this.securityDegreeMap[d.securityDegree]),
        icon: this.securityDegreeIconMap[d.securityDegree] || 'help',
        tier: this.securityDegreeBadgeClassMap[d.securityDegree] || 'degree-tier-1'
      },
      urgency: {
        label: text(d.urgencyDegree != null ? this.urgencyDegreeMap[d.urgencyDegree] : null),
        initial: (d.urgencyDegree != null && this.urgencyDegreeInitialMap[d.urgencyDegree]) || '-',
        tier: (d.urgencyDegree != null && this.urgencyDegreeBadgeClassMap[d.urgencyDegree]) || 'degree-tier-1'
      },
      action: {
        label: actionRequiredLabel(d.actionRequired),
        icon: actionRequiredIcon(d.actionRequired),
        cls: actionRequiredBadgeClass(d.actionRequired)
      },

      from: text(d.externalInstitutionId ? this.institutionNames()[d.externalInstitutionId.toLowerCase()] : null),
      to: text(d.departmentId ? this.departmentNames()[d.departmentId.toLowerCase()] : null),

      pageCount: d.pageCount != null && String(d.pageCount) !== '' ? String(d.pageCount) : '-',
      hasAttachment: d.hasAttachment ?? null,
      attachmentDescription: d.attachmentDescription?.trim() || '',
      electronicCopy: d.electronicCopy === true ? 'Var' : d.electronicCopy === false ? 'Yok' : '-',
      language: text(languages[d.languageId]),
      hasFile: !!d.documentName,

      // Başlıktaki durum çipleri; tone renk tonunu belirler
      status: [
        { label: 'Durum', value: text(DOCUMENT_STATUS_LABELS[d.status]), tone: d.status === 3 ? 'success' : d.status === 1 ? 'info' : 'neutral' },
        {
          label: 'Yayın', value: publishStatusLabel(d),
          tone: isPublished(d) ? 'success' : isPublishFailed(d) ? 'danger' : isPublishing(d) ? 'warning' : 'neutral'
        },
        { label: 'OCR', value: OCR_STATUS_LABELS[ocr] ?? '-', tone: ocr === 1 ? 'success' : ocr === 2 ? 'danger' : 'warning' }
      ],

      // En altta küçük bilgi satırı
      meta: [
        { icon: 'person', label: 'Atanan Personel', value: text(d.currentAssignmentUser) },
        { icon: 'calendar_add_on', label: 'Oluşturulma', value: dateTime(d.createdDate) },
        { icon: 'update', label: 'Son Güncelleme', value: dateTime(d.updateDate) }
      ]
    };
  });

  openInfo(item: ScanListRow): void {
    if (!item.id) return;
    this.infoDoc.set(item);
    this.infoVisible.set(true);
    this.infoLoading.set(true);
    this.loadLookupsOnce();

    this.incomingDocumentService.getIncomingDocumentByDocumentId(item.id).subscribe({
      next: (fresh) => {
        // Atanan personelin adı yalnızca liste satırında gelir; tazelenen kayda taşınır
        if (fresh) this.infoDoc.set({ ...fresh, currentAssignmentUser: fresh.currentAssignmentUser ?? item.currentAssignmentUser });
        this.infoLoading.set(false);
      },
      error: (err) => {
        // Tazelenemezse liste satırındaki bilgilerle gösterilir
        console.error('Evrak bilgileri alınamadı:', err);
        this.infoLoading.set(false);
      }
    });
  }

  closeInfo(): void {
    this.infoVisible.set(false);
  }

  // Nereden / Nereye adları için birim ve dış kurum listeleri popup ilk açıldığında bir kez çekilir
  private loadLookupsOnce(): void {
    if (this.lookupsRequested) return;
    this.lookupsRequested = true;
    this.departmentService.getDepartments().subscribe({
      next: (list) => this.departmentNames.set(
        Object.fromEntries((list ?? []).filter(x => x.id).map(x => [x.id!.toLowerCase(), x.name]))),
      error: (err) => console.error('Birimler alınamadı:', err)
    });
    this.externalInstitutionService.getExternalInstitutions().subscribe({
      next: (list) => this.institutionNames.set(
        Object.fromEntries((list ?? []).filter(x => x.id).map(x => [x.id!.toLowerCase(), x.name]))),
      error: (err) => console.error('Dış kurumlar alınamadı:', err)
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
      'Taranmış Evrakı Sil?',
      'Taranmış evrakı silmek istiyor musunuz?',
      'Sil',
      () => {
        this.incomingDocumentService.deleteIncomingDocument(id).subscribe(() => {
          // ✅ silme sonrası da resource yenile
          this.documentsResourceSig.set(
            this.incomingDocumentService.getIncomingDocumentsByStatus(this.selectedOcrFilter, this.departmentFilterId)
          );
        });
      }
    );
  }

  showPublished = false;
  showPending = false;

  togglePublished() {
    this.showPublished = !this.showPublished;
    if (this.showPublished) this.showPending = false; // Pending devre dışı
    if (this.showPublished)
      this.selectedOcrFilter = "all";
    else {
      this.selectedOcrFilter = "completed";
      this.onOcrFilterChange();
    }

    this.incomingDocumentService.getAllIncomingDocuments(this.departmentFilterId).subscribe({
      next: (docs) => {
        if (!docs || !docs.length) {
          this.scanListData.set([]);
          return;
        }

        let mapped = docs;

        if (this.showPublished) {
          mapped = docs.filter(x => isSentToPublish(x));
        }

        this.scanListData.set(mapped);
      },
      error: () => {
        this.scanListData.set([]);
      }
    });
  }

  togglePending() {
    this.showPending = !this.showPending;
    if (this.showPending) this.showPublished = false; // Yayınlanan devre dışı
    if (this.showPending)
      this.selectedOcrFilter = "all";
    else {
      this.selectedOcrFilter = "completed";
      this.onOcrFilterChange();
    }

    this.incomingDocumentService.getAllIncomingDocuments(this.departmentFilterId).subscribe({
      next: (docs) => {
        if (!docs || !docs.length) {
          this.scanListData.set([]);
          return;
        }

        let mapped = docs;

        if (this.showPending) {
          const currentUserId = this.user()?.id;
          mapped = docs.filter(
            x => x.currentAssignmentUserId === currentUserId && !isSentToPublish(x)
          );
        }

        this.scanListData.set(mapped);
      },
      error: () => {
        this.scanListData.set([]);
      }
    });
  }
}
