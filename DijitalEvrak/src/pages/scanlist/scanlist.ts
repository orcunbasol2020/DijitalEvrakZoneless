import {
  ChangeDetectionStrategy,
  Component,
  signal,
  ViewEncapsulation,
  computed,
  inject,
  effect,
  untracked
} from '@angular/core';
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
import { UrgencyDegreeEnum, UrgencyDegreeLabels, UrgencyDegreeInitials, UrgencyDegreeBadgeClass } from '../../models/urgencydegree.model';
import { HttpService } from '../../services/http';
import { UserRoleService } from '../../services/user-role';
import { normalizeRoleName } from '../../services/role-service';
import { UserModel } from '../users/users';
import { forkJoin, map, of, catchError, switchMap } from 'rxjs';
import { httpResource } from '@angular/common/http';
import { UPLOAD_DOCUMENT_ROLES, UploadDocumentModal } from '../../../components/upload-document-modal/upload-document-modal';
import { DocumentNumberUploadError, DocumentUploadFlow } from '../../services/document-upload-flow';
import { isPublished, isPublishFailed, isPublishing, isSentToPublish, publishStatusLabel } from '../../models/publishstatus.model';
import { FormsModule } from '@angular/forms';
import { DocumentTypeLabels } from '../../models/documenttype.model';
import { actionRequiredBadgeClass, actionRequiredIcon, actionRequiredLabel } from '../../models/actionrequired.model';
import { Department } from '../../services/department';
import { DocumentTransaction } from '../../services/documenttransaction';
import {
  buildProcessSteps, processMilestoneKind, processPersonLabel, ProcessStep, processTypeIcon, processTypeTone,
  sortProcessTransactions
} from '../../models/process-step';
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

// Liste satırları backend'den gelen evrak alanlarına ek olarak atanan personelin
// adını (currentAssignmentUser) taşır; atama popup'ının başlığında gösterilir.
type ScanListRow = IncomingDocumentModel & { currentAssignmentUser?: string | null };

// Sayfa evrakları iş kuyruklarına ayırır. Bir evrak yalnızca bir kuyruktadır:
//  - waiting   Kayıt Bekleyen: kimse işleme almamış, yayına gönderilmemiş
//  - mine      Üzerimdekiler: bende (İşleme Al ile benim üzerimde), yayına gönderilmemiş
//  - others    Başka Personelde: başka bir personelde, yayına gönderilmemiş
//  - published Yayınlanan: yayına gönderilmiş (Yayınlandı / Aktarımda / Aktarım Hatalı)
// "all" kuyruk değil, hepsini birlikte gösteren görünümdür.
type QueueKey = 'waiting' | 'mine' | 'others' | 'published';
type QueueView = QueueKey | 'all';

interface QueueDef {
  key: QueueView;
  label: string;
  hint?: string;
  icon: string;
}

const QUEUES: readonly QueueDef[] = [
  { key: 'waiting', label: 'Kayıt Bekleyen', icon: 'inbox' },
  { key: 'mine', label: 'Üzerimdekiler', icon: 'pending_actions' },
  { key: 'others', label: 'Başka Personelde', icon: 'group' },
  { key: 'published', label: 'Yayınlanan', hint: 'Atlas\'a yayına gönderildi', icon: 'task_alt' },
  { key: 'all', label: 'Tümü', icon: 'select_all' }
];

// Yayınlanan kuyruğundaki yayın durumu süzgeci
type PublishView = 'all' | 'done' | 'progress' | 'failed';
type FileView = 'all' | 'with' | 'without';
type SortView = 'priority' | 'newest' | 'oldest' | 'number';

// İvedilik önceliği: dikkat sırası Yıldırım, Günlüdür, Çok Acele, Acele; ardından
// İvedi Süreli ve Normal. Aynı ivedilikte gizlilik derecesi yüksek olan öne geçer.
const URGENCY_RANK: Record<number, number> = {
  [UrgencyDegreeEnum.Lightning]: 0,
  [UrgencyDegreeEnum.Dated]: 1,
  [UrgencyDegreeEnum.VeryUrgent]: 2,
  [UrgencyDegreeEnum.Urgent]: 3,
  [UrgencyDegreeEnum.UrgentTimeLimited]: 4,
  [UrgencyDegreeEnum.Normal]: 5
};
// Satırın sol şeridi ve vurgusu yalnızca dikkat gerektiren dört ivedilikte renklenir
const ATTENTION_URGENCIES: ReadonlySet<number> = new Set([
  UrgencyDegreeEnum.Lightning, UrgencyDegreeEnum.Dated, UrgencyDegreeEnum.VeryUrgent, UrgencyDegreeEnum.Urgent
]);

const PAGE_SIZE = 20;
// Seçili kuyruk sekme oturumu boyunca hatırlanır (Evrak Kayıt'tan dönüşte aynı sekme açılır)
const QUEUE_STORAGE_KEY = 'scanlist.queue';

@Component({
  imports: [
    GenericModel,
    CommonModule,
    FormsModule,
    UploadDocumentModal
  ],
  templateUrl: './scanlist.html',
  // scanlist.css popup stilleri (pa-, zh-, ei-) Yönetici ve Birim listeleriyle ortaktır;
  // kuyruk görünümünün stilleri (sq-) yalnızca bu sayfaya aittir.
  styleUrls: ['./scanlist.css', './scanlist-queue.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Scanlist {
  private assignmentService = inject(DocumentAssignmentService);
  readonly #common = inject(Common);
  readonly #roleService = inject(RoleService);
  readonly user = computed(() => this.#common.user());
  readonly scanListData = signal<ScanListRow[]>([]);

  // Gizlilik ve İvedilik rozetleri Giden Evraklar listesiyle aynı: ikonlu / baş harfli renkli rozet
  readonly securityDegreeMap: Record<number, string> = SecurityDegreeLabels;
  readonly securityDegreeIconMap: Record<number, string> = SecurityDegreeIcons;
  readonly securityDegreeBadgeClassMap: Record<number, string> = SecurityDegreeBadgeClass;
  readonly urgencyDegreeMap: Record<number, string> = UrgencyDegreeLabels;
  readonly urgencyDegreeInitialMap: Record<number, string> = UrgencyDegreeInitials;
  readonly urgencyDegreeBadgeClassMap: Record<number, string> = UrgencyDegreeBadgeClass;
  readonly documentTypeLabels: Record<number, string> = DocumentTypeLabels;

  // Süzgeç seçenekleri: ivedilik dikkat sırasıyla, gizlilik yüksekten düşüğe
  readonly urgencyOptions = Object.entries(UrgencyDegreeLabels)
    .map(([value, label]) => ({ value: Number(value), label }))
    .sort((a, b) => (URGENCY_RANK[a.value] ?? 9) - (URGENCY_RANK[b.value] ?? 9));
  readonly securityOptions = Object.entries(SecurityDegreeLabels)
    .map(([value, label]) => ({ value: Number(value), label }))
    .sort((a, b) => b.value - a.value);

  readonly #toast = inject(FlexiToastService);
  private readonly router = inject(Router);
  private readonly incomingDocumentService = inject(IncomingDocumentService);
  private readonly allocationService = inject(DocumentAllocation);
  private readonly transactionService = inject(DocumentTransaction);
  private readonly httpService = inject(HttpService);
  private readonly userRoleService = inject(UserRoleService);
  readonly loading = signal(false);
  readonly loadFailed = signal(false);

  // ---- Kuyruklar ve süzgeçler ----
  readonly queues = QUEUES;
  readonly activeQueue = signal<QueueView>(this.readStoredQueue());
  readonly search = signal('');
  readonly urgencyFilter = signal<number | null>(null);
  readonly securityFilter = signal<number | null>(null);
  readonly personFilter = signal<string | null>(null);
  readonly fileFilter = signal<FileView>('all');
  readonly ocrReadyOnly = signal(false);
  readonly publishFilter = signal<PublishView>('all');
  readonly sortBy = signal<SortView>('priority');
  readonly page = signal(1);

  // Personel adıyla eşleşme GUID büyük/küçük harf farkından etkilenmesin
  private readonly myId = computed(() => (this.user()?.id ?? '').toLowerCase());

  isMine(item: IncomingDocumentModel): boolean {
    const me = this.myId();
    return !!me && (item.currentAssignmentUserId ?? '').toLowerCase() === me;
  }

  queueOf(item: IncomingDocumentModel): QueueKey {
    if (isSentToPublish(item)) return 'published';
    if (!item.currentAssignmentUserId) return 'waiting';
    return this.isMine(item) ? 'mine' : 'others';
  }

  readonly queueCounts = computed(() => {
    const counts: Record<QueueView, number> = { waiting: 0, mine: 0, others: 0, published: 0, all: 0 };
    for (const d of this.scanListData()) {
      counts[this.queueOf(d)]++;
      counts.all++;
    }
    return counts;
  });

  // Kuyruktaki dikkat gerektiren (Yıldırım, Günlüdür, Çok Acele, Acele) evrak sayısı;
  // kuyruk kartında küçük bir sinyal olarak gösterilir.
  readonly queueUrgentCounts = computed(() => {
    const counts: Record<QueueView, number> = { waiting: 0, mine: 0, others: 0, published: 0, all: 0 };
    for (const d of this.scanListData()) {
      if (d.urgencyDegree == null || !ATTENTION_URGENCIES.has(d.urgencyDegree)) continue;
      const q = this.queueOf(d);
      // Yayına gönderilmiş evrak artık kayıt işi beklemez; sinyal yalnızca açık kuyruklarda
      if (q === 'published') continue;
      counts[q]++;
      counts.all++;
    }
    return counts;
  });

  // Seçili kuyruktaki evraklar (süzgeçlerden önce): Personel listesi bundan çıkarılır
  private readonly queueRows = computed(() => {
    const q = this.activeQueue();
    const rows = this.scanListData();
    return q === 'all' ? rows : rows.filter(d => this.queueOf(d) === q);
  });

  readonly personOptions = computed(() => {
    const names = new Set<string>();
    for (const d of this.queueRows()) {
      const n = d.currentAssignmentUser?.trim();
      if (n) names.add(n);
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'tr'));
  });

  readonly showPersonFilter = computed(() => this.activeQueue() !== 'waiting' && this.activeQueue() !== 'mine');

  readonly filteredRows = computed(() => {
    const term = this.search().trim().toLocaleLowerCase('tr');
    const urgency = this.urgencyFilter();
    const security = this.securityFilter();
    const person = this.showPersonFilter() ? this.personFilter() : null;
    const file = this.fileFilter();
    const ocrReady = this.ocrReadyOnly();
    const publish = this.activeQueue() === 'published' ? this.publishFilter() : 'all';
    const institutions = this.institutionNames();

    const rows = this.queueRows().filter(d => {
      if (urgency != null && d.urgencyDegree !== urgency) return false;
      if (security != null && d.securityDegree !== security) return false;
      if (person && (d.currentAssignmentUser?.trim() ?? '') !== person) return false;
      if (file === 'with' && !d.documentName) return false;
      if (file === 'without' && d.documentName) return false;
      if (ocrReady && d.ocrStatus !== 1) return false;
      if (publish === 'done' && !isPublished(d)) return false;
      if (publish === 'progress' && !isPublishing(d)) return false;
      if (publish === 'failed' && !isPublishFailed(d)) return false;
      if (term) {
        const from = d.externalInstitutionId ? institutions[d.externalInstitutionId.toLowerCase()] : '';
        const haystack = [d.qrCode, d.orginalNo, d.currentAssignmentUser, from]
          .filter(Boolean).join(' ').toLocaleLowerCase('tr');
        if (!haystack.includes(term)) return false;
      }
      return true;
    });

    return this.sortRows(rows, this.sortBy());
  });

  // Filtre düğmesiyle açılan kriter paneli (İvedilik, Gizlilik, Personel, Dosya)
  readonly filtersOpen = signal(false);
  readonly selectFilterCount = computed(() =>
    (this.urgencyFilter() != null ? 1 : 0) + (this.securityFilter() != null ? 1 : 0)
    + (this.showPersonFilter() && this.personFilter() ? 1 : 0) + (this.fileFilter() !== 'all' ? 1 : 0));

  readonly hasActiveFilters = computed(() =>
    !!this.search().trim() || this.urgencyFilter() != null || this.securityFilter() != null
    || (this.showPersonFilter() && !!this.personFilter()) || this.fileFilter() !== 'all'
    || this.ocrReadyOnly() || (this.activeQueue() === 'published' && this.publishFilter() !== 'all'));

  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filteredRows().length / PAGE_SIZE)));
  readonly currentPage = computed(() => Math.min(this.page(), this.pageCount()));
  readonly pagedRows = computed(() => {
    const start = (this.currentPage() - 1) * PAGE_SIZE;
    return this.filteredRows().slice(start, start + PAGE_SIZE);
  });
  readonly rangeLabel = computed(() => {
    const total = this.filteredRows().length;
    if (!total) return '0';
    const start = (this.currentPage() - 1) * PAGE_SIZE + 1;
    return `${start}–${Math.min(start + PAGE_SIZE - 1, total)} / ${total}`;
  });

  // OCR zorunlu değildir; OCR hataları listeyi kalabalıklaştırmaz, ayrı bir pencerede
  // izlenir. Yayına gönderilmiş evrakın OCR hatası artık kaydı etkilemediğinden sayılmaz.
  readonly ocrErrorRows = computed(() =>
    this.sortRows(this.scanListData().filter(d => d.ocrStatus === 2 && !isSentToPublish(d)), 'priority'));
  readonly ocrErrorsVisible = signal(false);

  private sortRows(rows: ScanListRow[], sort: SortView): ScanListRow[] {
    const time = (d: ScanListRow) => new Date(d.createdDate ?? d.documentDate ?? 0).getTime() || 0;
    const sorted = [...rows];
    switch (sort) {
      case 'newest': return sorted.sort((a, b) => time(b) - time(a));
      case 'oldest': return sorted.sort((a, b) => time(a) - time(b));
      case 'number': return sorted.sort((a, b) => (a.qrCode ?? '').localeCompare(b.qrCode ?? '', 'tr', { numeric: true }));
      default:
        return sorted.sort((a, b) =>
          this.urgencyRank(a) - this.urgencyRank(b)
          || (b.securityDegree ?? 0) - (a.securityDegree ?? 0)
          || time(b) - time(a));
    }
  }

  private urgencyRank(d: IncomingDocumentModel): number {
    return d.urgencyDegree != null ? (URGENCY_RANK[d.urgencyDegree] ?? 6) : 6;
  }

  isAttention(d: IncomingDocumentModel): boolean {
    return d.urgencyDegree != null && ATTENTION_URGENCIES.has(d.urgencyDegree);
  }

  institutionName(d: IncomingDocumentModel): string {
    return (d.externalInstitutionId && this.institutionNames()[d.externalInstitutionId.toLowerCase()]) || '';
  }

  setQueue(q: QueueView): void {
    this.activeQueue.set(q);
    this.personFilter.set(null);
    this.publishFilter.set('all');
    this.page.set(1);
    try { sessionStorage.setItem(QUEUE_STORAGE_KEY, q); } catch { /* depolama kapalı olabilir */ }
  }

  private readStoredQueue(): QueueView {
    try {
      const v = sessionStorage.getItem(QUEUE_STORAGE_KEY);
      if (v && QUEUES.some(q => q.key === v)) return v as QueueView;
    } catch { /* depolama kapalı olabilir */ }
    return 'waiting';
  }

  // Süzgeç değişince ilk sayfaya dönülür
  setFilter<T>(target: { set(v: T): void }, value: T): void {
    target.set(value);
    this.page.set(1);
  }

  clearFilters(): void {
    this.search.set('');
    this.urgencyFilter.set(null);
    this.securityFilter.set(null);
    this.personFilter.set(null);
    this.fileFilter.set('all');
    this.ocrReadyOnly.set(false);
    this.publishFilter.set('all');
    this.page.set(1);
  }

  goToPage(p: number): void {
    this.page.set(Math.min(Math.max(1, p), this.pageCount()));
  }

  readonly emptyText = computed(() => {
    if (this.hasActiveFilters()) return { title: 'Kriterlere uyan evrak yok', desc: 'Arama metnini ya da kriterleri değiştirip yeniden deneyin.' };
    switch (this.activeQueue()) {
      case 'waiting': return { title: 'Kayıt bekleyen evrak yok', desc: 'Yeni taranan ya da ön kaydı yapılan evraklar burada görünür.' };
      case 'mine': return { title: 'Üzerinizde bekleyen evrak yok', desc: 'İşleme aldığınız ve henüz yayınlanmamış evraklar burada görünür.' };
      case 'others': return { title: 'Başka personelde evrak yok', desc: 'Diğer personelin işleme aldığı evraklar burada görünür.' };
      case 'published': return { title: 'Yayınlanan evrak yok', desc: 'Yayına gönderilen evraklar burada görünür.' };
      default: return { title: 'Gelen evrak bulunamadı', desc: 'Listelenecek gelen evrak yok.' };
    }
  });

  // Excel'de Türkçe karakterlerin doğru açılması için BOM'lu, noktalı virgül ayraçlı CSV
  exportCsv(): void {
    const rows = this.filteredRows();
    if (!rows.length) return;
    const header = ['Evrak No', 'Konu', 'Nereden', 'Belge Tarihi', 'İvedilik', 'Gizlilik', 'Atanan Personel', 'Dosya', 'Yayın Durumu'];
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = rows.map(d => [
      d.qrCode,
      d.subject,
      this.institutionName(d),
      d.documentDate ? new Date(d.documentDate).toLocaleDateString('tr-TR') : '',
      d.urgencyDegree != null ? this.urgencyDegreeMap[d.urgencyDegree] : '',
      this.securityDegreeMap[d.securityDegree] ?? '',
      d.currentAssignmentUser ?? '',
      d.documentName ? 'Var' : 'Yok',
      publishStatusLabel(d)
    ].map(cell).join(';'));
    const blob = new Blob(['﻿' + [header.map(cell).join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const queue = QUEUES.find(q => q.key === this.activeQueue())?.label ?? 'Gelen Evraklar';
    a.href = url;
    a.download = `Gelen Evraklar - ${queue}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

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
    this.loadDocuments();
    // Nereden (dış kurum) adı satırda ve aramada kullanıldığından listeler baştan çekilir
    this.loadLookupsOnce();

    // Üst menüdeki "işlem bekleyenlerim" yönlendirmesi Üzerimdekiler kuyruğunu açar;
    // istek bir kez tüketilir ki sonraki ziyaretler kullanıcının seçtiği sekmede açılsın.
    effect(() => {
      const type = this.incomingDocumentService.currentIncomingDocumentSearchType;
      if (type !== 'pending') return;
      untracked(() => {
        this.clearFilters();
        this.setQueue('mine');
        this.incomingDocumentService.setIncomingDocumentSearchType(null);
      });
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

  // Tüm gelen evraklar tek istekte çekilir; kuyruklara ayırma ve süzme istemcide yapılır.
  // Boş liste toast yerine listenin boş durum alanında anlatılır.
  loadDocuments(): void {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.incomingDocumentService.getAllIncomingDocuments(this.departmentFilterId).subscribe({
      next: (docs) => {
        this.scanListData.set((docs ?? []).filter(d => !d.isDeleted));
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Gelen evraklar alınamadı:', err);
        this.loading.set(false);
        this.loadFailed.set(true);
      }
    });
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
        // Sonuç listede görünür (satır yeni personelin adıyla yenilenir); ayrıca toast gösterilmez
        this.loadDocuments();
      },
      error: () => {
        this.assignSaving.set(false);
        this.#toast.showToast('Hata', 'Atama oluşturulamadı', 'error');
      }
    });
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

  /** Atama (işleme alma) oluşturmadan belge detayına gider; yayınlanan evraklar için. */
  private openDetailWithoutAssignment(id: string) {
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

  // ---- Süreç popup'ı ----
  // Süreçler sayfasındaki işlem geçmişinin popup karşılığı: yalnızca süreç adımları gösterilir.
  // Adım gruplama, ikon ve renk kuralları Süreçler sayfasıyla ortaktır (models/process-step.ts).

  readonly processVisible = signal(false);
  readonly processLoading = signal(false);
  readonly processFailed = signal(false);
  readonly processDoc = signal<IncomingDocumentModel | null>(null);
  readonly processSteps = signal<ProcessStep[]>([]);
  readonly processTypeIcon = processTypeIcon;
  readonly processTypeTone = processTypeTone;
  readonly processMilestoneKind = processMilestoneKind;
  readonly processPersonLabel = processPersonLabel;

  openProcess(item: IncomingDocumentModel): void {
    if (!item.id) return;
    this.processDoc.set(item);
    this.processSteps.set([]);
    this.processFailed.set(false);
    this.processVisible.set(true);
    this.processLoading.set(true);

    this.transactionService.getTransactionsByDocumentId(item.id).subscribe({
      next: (res) => {
        this.processSteps.set(buildProcessSteps(sortProcessTransactions(res)));
        this.processLoading.set(false);
      },
      error: (err) => {
        console.error('Süreç bilgileri alınamadı:', err);
        this.processFailed.set(true);
        this.processLoading.set(false);
      }
    });
  }

  closeProcess(): void {
    this.processVisible.set(false);
  }

  // Popup'tan Süreçler sayfasına geçiş (evrak bilgileriyle birlikte tam görünüm)
  openProcessPage(): void {
    const id = this.processDoc()?.id;
    this.closeProcess();
    if (id) this.goToProcess(id);
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
          this.loadDocuments();
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

  // Satırın ana eylemi:
  //  - akış durumu uygun (Ön Kayıt / Kayıt Tamamlandı / Eşleştirme) ise dosya olsun olmasın:
  //      bende -> Devam Et, başkasında -> Personel Ata (atama popup'ı), kimsede değil -> İşleme Al
  //    Belge yüklemek zorunlu değildir; dosyasız evrak Evrak Kayıt'ta "Belge henüz yüklenmedi"
  //    durumuyla açılır ve dosya orada sonradan yüklenebilir.
  //  - durum uygun değilse ya da evrak yayına gönderildiyse (Yayınlanan kuyruğu):
  //      dosyası varsa Belge Detayı, yoksa evrak bilgileri
  primaryAction(item: ScanListRow): { kind: 'take' | 'continue' | 'reassign' | 'detail' | 'info'; label: string; icon: string; title: string } {
    const fileNote = item.documentName ? '' : ' · Belge dosyası henüz yüklenmedi';
    if (!PROCESSABLE_STATUSES.has(item.status) || isSentToPublish(item)) {
      if (!item.documentName) {
        return { kind: 'info', label: 'Bilgiler', icon: 'info', title: `Evrak ${DOCUMENT_STATUS_LABELS[item.status] ?? 'bu'} durumunda · Evrak bilgilerini göster` };
      }
      return { kind: 'detail', label: 'Detay', icon: 'open_in_new', title: 'Belge Detayına Git' };
    }
    if (this.isMine(item)) return { kind: 'continue', label: 'Devam Et', icon: 'motion_play', title: 'İşleme Devam Et' + fileNote };
    if (item.currentAssignmentUserId) {
      return { kind: 'reassign', label: 'Personel Ata', icon: 'key', title: 'Evrak başka personele atanmış · Atamayı değiştir' };
    }
    return { kind: 'take', label: 'İşleme Al', icon: 'expand_circle_right', title: 'İşleme Al · Evrak Kayıt ekranında aç' + fileNote };
  }

  runPrimary(item: ScanListRow): void {
    if (!item.id) return;
    switch (this.primaryAction(item).kind) {
      case 'info': this.openInfo(item); break;
      case 'reassign': this.openPersonModal(item); break;
      // Yayına gönderilmiş evrak işleme alınmaz: atama oluşturmadan detaya gidilir
      case 'detail':
        if (isSentToPublish(item)) { this.openDetailWithoutAssignment(item.id); break; }
        this.goToDetail(item.id);
        break;
      default: this.goToDetail(item.id);
    }
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
          this.loadDocuments();
        });
      }
    );
  }
}
