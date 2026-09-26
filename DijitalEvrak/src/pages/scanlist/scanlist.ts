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
import { Router, RouterLink } from '@angular/router';
import GenericModel from '../../../components/generic-model/generic-model';
import { CommonModule, NgStyle } from '@angular/common';
import { FlexiToastService } from 'flexi-toast';
import { IncomingDocumentService } from '../../services/incomingdocument';
import { IncomingDocumentModel } from '../../models/incoming-document/incoming-document.model';
import { DocumentAssignmentService } from '../../services/documentassignment';
import { Common } from '../../services/common';
import { RoleService } from '../../services/role-service';
import { DocumentAllocation } from '../../services/documentallocation';
import { DocumentAllocationModel } from '../../models/documentallocation.model';
import { AllocationStatusEnum, AllocationStatusLabels } from '../../models/allocationstatus.model';
import { HttpService } from '../../services/http';
import { UserRoleService } from '../../services/user-role';
import { normalizeRoleName } from '../../services/role-service';
import { UserModel } from '../users/users';
import { forkJoin, map, of, catchError, switchMap } from 'rxjs';

// Atama popup'ında yalnızca evrak kaydı yapabilen (Gelen Evrak rolündeki) personel listelenir.
const ASSIGNABLE_ROLE = 'Gelen Evrak';

// Grid satırları backend'den gelen evrak alanlarına ek olarak atanan personelin
// adını (currentAssignmentUser) taşır; atama popup'ının başlığında gösterilir.
type ScanListRow = IncomingDocumentModel & { currentAssignmentUser?: string | null };

@Component({
  imports: [
    FlexiGridModule,
    GenericModel,
    RouterLink,
    NgStyle,
    CommonModule
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

      // yayınlanan filtre
      if (this.showPublished) {
        mapped = mapped.filter((x: IncomingDocumentModel) => x.status === 10);
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
    [AllocationStatusEnum.TeslimAlindi]: 'move_to_inbox'
  };

  readonly allocationStatusClass: Record<number, string> = {
    [AllocationStatusEnum.IlkKayit]: 'is-ilkkayit',
    [AllocationStatusEnum.Devir]: 'is-devir',
    [AllocationStatusEnum.Teslim]: 'is-teslim',
    [AllocationStatusEnum.Arsiv]: 'is-arsiv',
    [AllocationStatusEnum.TeslimAlindi]: 'is-teslimalindi'
  };

  initials(fullName?: string | null): string {
    const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    const first = parts[0].charAt(0);
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return `${first}${last}`.toLocaleUpperCase('tr');
  }

  openZimmetHistory(item: IncomingDocumentModel): void {
    if (!item.id) return;
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
          mapped = docs.filter(x => x.status === 10 || x.status === 6); // 10 = yayınlandı
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
            x => x.currentAssignmentUserId === currentUserId && (x.status != 6 && x.status != 10)
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
