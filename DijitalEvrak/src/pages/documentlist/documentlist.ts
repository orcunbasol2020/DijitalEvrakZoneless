import {
  ChangeDetectionStrategy,
  Component,
  signal,
  ViewEncapsulation,
  computed,
  inject,
  effect,
  untracked,
  HostListener
} from '@angular/core';
import { Router } from '@angular/router';
import GenericModel from '../../../components/generic-model/generic-model';
import { CommonModule } from '@angular/common';
import { FlexiToastService } from 'flexi-toast';
import { FormsModule } from '@angular/forms';
import { httpResource } from '@angular/common/http';
import { IncomingDocumentService } from '../../services/incomingdocument';
import { IncomingDocumentModel } from '../../models/incoming-document/incoming-document.model';
import { Common } from '../../services/common';
import { SecurityDegreeLabels, SecurityDegreeIcons, SecurityDegreeBadgeClass } from '../../models/securitydegree.model';
import { UrgencyDegreeEnum, UrgencyDegreeLabels, UrgencyDegreeInitials, UrgencyDegreeBadgeClass } from '../../models/urgencydegree.model';
import { DocumentTypeLabels } from '../../models/documenttype.model';
import { actionRequiredBadgeClass, actionRequiredIcon, actionRequiredLabel } from '../../models/actionrequired.model';
import { Department } from '../../services/department';
import { ExternalInstitution } from '../../services/external-institution';
import { UserModel } from '../users/users';
import { DocumentAllocation } from '../../services/documentallocation';
import { DocumentAllocationModel } from '../../models/documentallocation.model';
import { AllocationStatusEnum, AllocationStatusLabels } from '../../models/allocationstatus.model';
import { UploadDocumentModal } from '../../../components/upload-document-modal/upload-document-modal';
import { isPublished, isPublishFailed, isPublishing, isSentToPublish, publishStatusLabel } from '../../models/publishstatus.model';
import { DocumentNumberUploadError, DocumentUploadFlow } from '../../services/document-upload-flow';
import { DocumentTransaction } from '../../services/documenttransaction';
import {
  buildProcessSteps, processMilestoneKind, processPersonLabel, ProcessStep, processTypeIcon, processTypeTone,
  sortProcessTransactions
} from '../../models/process-step';

// Evrakın akış durumu (status) metinleri; 6 ve 10 eski kayıtlarda yayın için kullanılmıştı
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

const STATUS_DELIVERED = 3;
const STATUS_PRE_REGISTER = 1;

// Yönetici listesi evrakları aşamalara ayırır; bir evrak yalnızca bir aşamadadır:
//  - preRegister Ön Kayıt: ön kaydı yapılmış, kaydı tamamlanmamış
//  - registered  Kayıt Tamamlandı: kaydı tamamlanmış, henüz yayına gönderilmemiş
//  - published   Yayınlanan: yayına gönderilmiş (Yayınlandı / Aktarımda / Aktarım Hatalı)
// "all" aşama değil, hepsini birlikte gösteren görünümdür.
type StageKey = 'preRegister' | 'registered' | 'published';
type StageView = StageKey | 'all';

interface StageDef {
  key: StageView;
  label: string;
  hint: string;
  icon: string;
}

const STAGES: readonly StageDef[] = [
  { key: 'preRegister', label: 'Ön Kayıt', hint: 'Kaydı tamamlanmamış', icon: 'app_registration' },
  { key: 'registered', label: 'Kayıt Tamamlandı', hint: 'Yayına gönderilmemiş', icon: 'pending_actions' },
  { key: 'published', label: 'Yayınlanan', hint: 'Atlas\'a yayına gönderildi', icon: 'task_alt' },
  { key: 'all', label: 'Tümü', hint: 'Bütün gelen evraklar', icon: 'select_all' }
];

type PublishView = 'all' | 'done' | 'progress' | 'failed';
type DeliveryView = 'all' | 'delivered' | 'undelivered';
type SortKey = 'created' | 'no' | 'from' | 'to' | 'documentDate' | 'urgency' | 'security' | 'status' | 'delivery' | 'person';
type SortDir = 'asc' | 'desc';

// "Sırala" seçimindeki hazır sıralamalar (değer: "anahtar:yön")
const SORT_PRESETS: readonly { value: string; label: string }[] = [
  { value: 'created:desc', label: 'En yeni kayıt' },
  { value: 'created:asc', label: 'En eski kayıt' },
  { value: 'documentDate:desc', label: 'Belge tarihi' },
  { value: 'urgency:asc', label: 'Önceliğe göre' },
  { value: 'no:asc', label: 'Evrak numarası' }
];

// İvedilik önceliği: dikkat sırası Yıldırım, Günlüdür, Çok Acele, Acele; ardından
// İvedi Süreli ve Normal (Gelen Evraklar kuyruk görünümüyle aynı).
const URGENCY_RANK: Record<number, number> = {
  [UrgencyDegreeEnum.Lightning]: 0,
  [UrgencyDegreeEnum.Dated]: 1,
  [UrgencyDegreeEnum.VeryUrgent]: 2,
  [UrgencyDegreeEnum.Urgent]: 3,
  [UrgencyDegreeEnum.UrgentTimeLimited]: 4,
  [UrgencyDegreeEnum.Normal]: 5
};
const ATTENTION_URGENCIES: ReadonlySet<number> = new Set([
  UrgencyDegreeEnum.Lightning, UrgencyDegreeEnum.Dated, UrgencyDegreeEnum.VeryUrgent, UrgencyDegreeEnum.Urgent
]);

const PAGE_SIZE = 10;
// Sayfalamada aynı anda gösterilen sayfa numarası düğmesi
const PAGE_WINDOW = 5;
const SUBJECT_WORD_LIMIT = 12;
// Seçili aşama sekme oturumu boyunca hatırlanır (Evrak Kayıt'tan dönüşte aynı sekme açılır)
const STAGE_STORAGE_KEY = 'documentlist.stage';

type DocumentRow = IncomingDocumentModel & { currentAssignmentUser?: string | null };

/** Gelen Evraklar (yönetici): tüm gelen evrakların salt izleme listesi. İşleme Al / kilit yok;
 *  Detay evrakı her durumda Evrak Kayıt ekranında açar. Görünüm Gelen Evraklar kuyruk
 *  ekranıyla (scanlist) ortak sq- stillerini kullanır. */
@Component({
  imports: [
    GenericModel,
    FormsModule,
    CommonModule,
    UploadDocumentModal
  ],
  templateUrl: './documentlist.html',
  // scanlist.css: Evrak Bilgileri, Süreç ve Zimmet Geçmişi popup'ları (ei-, zh-, sp-);
  // scanlist-queue.css: kuyruk kartları, araç çubuğu, satır ve sayfalama (sq-).
  styleUrls: [
    '../scanlist/scanlist.css',
    '../scanlist/scanlist-queue.css',
    './documentlist.css'
  ],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Documentlist {
  readonly #common = inject(Common);
  readonly #toast = inject(FlexiToastService);
  private readonly router = inject(Router);
  private readonly incomingDocumentService = inject(IncomingDocumentService);
  private readonly allocationService = inject(DocumentAllocation);
  private readonly transactionService = inject(DocumentTransaction);
  private readonly departmentService = inject(Department);
  private readonly externalInstitutionService = inject(ExternalInstitution);

  readonly user = computed(() => this.#common.user());
  readonly documents = signal<DocumentRow[]>([]);
  readonly loading = signal(false);
  readonly loadFailed = signal(false);

  readonly securityDegreeMap: Record<number, string> = SecurityDegreeLabels;
  readonly securityDegreeIconMap: Record<number, string> = SecurityDegreeIcons;
  readonly securityDegreeBadgeClassMap: Record<number, string> = SecurityDegreeBadgeClass;
  readonly urgencyDegreeMap: Record<number, string> = UrgencyDegreeLabels;
  readonly urgencyDegreeInitialMap: Record<number, string> = UrgencyDegreeInitials;
  readonly urgencyDegreeBadgeClassMap: Record<number, string> = UrgencyDegreeBadgeClass;
  readonly documentTypeLabels: Record<number, string> = DocumentTypeLabels;
  readonly statusLabels = DOCUMENT_STATUS_LABELS;

  // Süzgeç seçenekleri: ivedilik dikkat sırasıyla, gizlilik yüksekten düşüğe
  readonly urgencyOptions = Object.entries(UrgencyDegreeLabels)
    .map(([value, label]) => ({ value: Number(value), label }))
    .sort((a, b) => (URGENCY_RANK[a.value] ?? 9) - (URGENCY_RANK[b.value] ?? 9));
  readonly securityOptions = Object.entries(SecurityDegreeLabels)
    .map(([value, label]) => ({ value: Number(value), label }))
    .sort((a, b) => b.value - a.value);
  readonly typeOptions = Object.entries(DocumentTypeLabels)
    .map(([value, label]) => ({ value: Number(value), label }));

  // ---- Nereden / Nereye adları ----
  // Bakanlık birimi satırda kısa adıyla (yoksa tam adıyla), dış kurum tam adıyla yazılır
  private readonly departmentNames = signal<Record<string, { name: string; short: string }>>({});
  private readonly institutionNames = signal<Record<string, string>>({});

  readonly departmentOptions = computed(() =>
    Object.entries(this.departmentNames())
      .map(([id, d]) => ({ id, label: d.short && d.short !== d.name ? `${d.short} · ${d.name}` : d.name }))
      .sort((a, b) => a.label.localeCompare(b.label, 'tr')));

  fromName(d: IncomingDocumentModel): string {
    return (d.externalInstitutionId && this.institutionNames()[d.externalInstitutionId.toLowerCase()]) || '';
  }

  toName(d: IncomingDocumentModel, compact = true): string {
    const dept = d.departmentId ? this.departmentNames()[d.departmentId.toLowerCase()] : undefined;
    if (!dept) return '';
    return compact ? (dept.short || dept.name) : dept.name;
  }

  // ---- Aşamalar ve süzgeçler ----
  readonly stages = STAGES;
  readonly activeStage = signal<StageView>(this.readStoredStage());
  readonly search = signal('');
  readonly urgencyFilter = signal<number | null>(null);
  readonly securityFilter = signal<number | null>(null);
  readonly typeFilter = signal<number | null>(null);
  readonly departmentFilter = signal<string | null>(null);
  readonly personFilter = signal<string | null>(null);
  readonly deliveryFilter = signal<DeliveryView>('all');
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  readonly publishFilter = signal<PublishView>('all');
  readonly page = signal(1);
  readonly filtersOpen = signal(false);

  stageOf(d: IncomingDocumentModel): StageKey {
    if (isSentToPublish(d)) return 'published';
    return d.status === STATUS_PRE_REGISTER ? 'preRegister' : 'registered';
  }

  readonly stageCounts = computed(() => {
    const counts: Record<StageView, number> = { preRegister: 0, registered: 0, published: 0, all: 0 };
    for (const d of this.documents()) {
      counts[this.stageOf(d)]++;
      counts.all++;
    }
    return counts;
  });

  // Yayınlanan aşamasında aktarımı hatalı evrak sayısı: kartta uyarı sinyali olarak gösterilir
  readonly failedCount = computed(() => this.documents().filter(d => isPublishFailed(d)).length);

  private readonly stageRows = computed(() => {
    const s = this.activeStage();
    const rows = this.documents();
    return s === 'all' ? rows : rows.filter(d => this.stageOf(d) === s);
  });

  readonly personOptions = computed(() => {
    const names = new Set<string>();
    for (const d of this.stageRows()) {
      const n = d.currentAssignmentUser?.trim();
      if (n) names.add(n);
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'tr'));
  });

  readonly filteredRows = computed(() => {
    const terms = this.search().trim().toLocaleLowerCase('tr').split(/\s+/).filter(Boolean);
    const urgency = this.urgencyFilter();
    const security = this.securityFilter();
    const type = this.typeFilter();
    const department = this.departmentFilter();
    const person = this.personFilter();
    const delivery = this.deliveryFilter();
    const from = this.dateFrom() ? new Date(this.dateFrom() + 'T00:00:00').getTime() : null;
    const to = this.dateTo() ? new Date(this.dateTo() + 'T23:59:59').getTime() : null;
    const publish = this.activeStage() === 'published' ? this.publishFilter() : 'all';

    const rows = this.stageRows().filter(d => {
      if (urgency != null && d.urgencyDegree !== urgency) return false;
      if (security != null && d.securityDegree !== security) return false;
      if (type != null && d.documentTypeId !== type) return false;
      if (department && (d.departmentId ?? '').toLowerCase() !== department) return false;
      if (person && (d.currentAssignmentUser?.trim() ?? '') !== person) return false;
      if (delivery === 'delivered' && d.status !== STATUS_DELIVERED) return false;
      if (delivery === 'undelivered' && d.status === STATUS_DELIVERED) return false;
      if (from != null || to != null) {
        const t = d.documentDate ? new Date(d.documentDate).getTime() : NaN;
        if (isNaN(t)) return false;
        if (from != null && t < from) return false;
        if (to != null && t > to) return false;
      }
      if (publish === 'done' && !isPublished(d)) return false;
      if (publish === 'progress' && !isPublishing(d)) return false;
      if (publish === 'failed' && !isPublishFailed(d)) return false;
      if (terms.length) {
        // Her kelime evrakın herhangi bir alanında geçmeli (ör. "ankara 2026")
        const haystack = [
          d.qrCode, d.orginalNo, d.subject, d.currentAssignmentUser,
          this.fromName(d), this.toName(d, false), this.toName(d)
        ].filter(Boolean).join(' ').toLocaleLowerCase('tr');
        if (!terms.every(t => haystack.includes(t))) return false;
      }
      return true;
    });

    return this.sortRows(rows, this.sortKey(), this.sortDir());
  });

  readonly selectFilterCount = computed(() =>
    (this.urgencyFilter() != null ? 1 : 0) + (this.securityFilter() != null ? 1 : 0)
    + (this.typeFilter() != null ? 1 : 0) + (this.departmentFilter() ? 1 : 0)
    + (this.personFilter() ? 1 : 0) + (this.deliveryFilter() !== 'all' ? 1 : 0)
    + (this.dateFrom() || this.dateTo() ? 1 : 0));

  readonly hasActiveFilters = computed(() =>
    !!this.search().trim() || this.selectFilterCount() > 0
    || (this.activeStage() === 'published' && this.publishFilter() !== 'all'));

  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filteredRows().length / PAGE_SIZE)));
  readonly currentPage = computed(() => Math.min(this.page(), this.pageCount()));
  readonly pagedRows = computed(() => {
    const start = (this.currentPage() - 1) * PAGE_SIZE;
    return this.filteredRows().slice(start, start + PAGE_SIZE);
  });
  readonly rangeStart = computed(() => this.filteredRows().length ? (this.currentPage() - 1) * PAGE_SIZE + 1 : 0);
  readonly rangeEnd = computed(() => Math.min(this.currentPage() * PAGE_SIZE, this.filteredRows().length));

  // Geçerli sayfa ortada olacak şekilde en fazla PAGE_WINDOW sayfa numarası
  readonly pageNumbers = computed(() => {
    const total = this.pageCount();
    const current = this.currentPage();
    const start = Math.max(1, Math.min(current - Math.floor(PAGE_WINDOW / 2), total - PAGE_WINDOW + 1));
    const end = Math.min(total, start + PAGE_WINDOW - 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  });

  readonly emptyText = computed(() => {
    if (this.hasActiveFilters()) return { title: 'Kriterlere uyan evrak yok', desc: 'Arama metnini ya da kriterleri değiştirip yeniden deneyin.' };
    switch (this.activeStage()) {
      case 'preRegister': return { title: 'Ön kayıtta evrak yok', desc: 'Ön kaydı yapılıp kaydı tamamlanmayan evraklar burada görünür.' };
      case 'registered': return { title: 'Yayın bekleyen evrak yok', desc: 'Kaydı tamamlanıp henüz yayına gönderilmeyen evraklar burada görünür.' };
      case 'published': return { title: 'Yayınlanan evrak yok', desc: 'Yayına gönderilen evraklar burada görünür.' };
      default: return { title: 'Gelen evrak bulunamadı', desc: 'Listelenecek gelen evrak yok.' };
    }
  });

  // Sıralama: sütun başlığına tıklanınca o sütuna göre, aynı başlığa tekrar tıklanınca ters
  // yönde sıralanır. "asc" her sütunun doğal sırasıdır: metinde A→Z, tarihte eskiden yeniye,
  // ivedilik ve gizlilikte en yüksekten başlayarak, durumda iş akışı sırasıyla.
  // Boş değerli evraklar yön ne olursa olsun en sona kalır.
  private sortRows(rows: DocumentRow[], key: SortKey, dir: SortDir): DocumentRow[] {
    const created = (d: DocumentRow) => new Date(d.createdDate ?? d.documentDate ?? 0).getTime() || 0;
    const text = (a: string, b: string) => a.localeCompare(b, 'tr', { numeric: true, sensitivity: 'base' });
    const sign = dir === 'asc' ? 1 : -1;

    // Her anahtar için: değer boş mu ve iki evrakın doğal karşılaştırması
    const spec: Record<SortKey, { empty: (d: DocumentRow) => boolean; cmp: (a: DocumentRow, b: DocumentRow) => number }> = {
      created: { empty: d => !d.createdDate, cmp: (a, b) => created(a) - created(b) },
      no: { empty: d => !d.qrCode, cmp: (a, b) => text(a.qrCode ?? '', b.qrCode ?? '') },
      from: { empty: d => !this.fromName(d), cmp: (a, b) => text(this.fromName(a), this.fromName(b)) },
      to: { empty: d => !this.toName(d), cmp: (a, b) => text(this.toName(a), this.toName(b)) },
      documentDate: {
        empty: d => !d.documentDate,
        cmp: (a, b) => new Date(a.documentDate).getTime() - new Date(b.documentDate).getTime()
      },
      urgency: { empty: d => d.urgencyDegree == null, cmp: (a, b) => this.urgencyRank(a) - this.urgencyRank(b) },
      security: { empty: d => d.securityDegree == null, cmp: (a, b) => (b.securityDegree ?? 0) - (a.securityDegree ?? 0) },
      status: { empty: () => false, cmp: (a, b) => this.statusRank(a) - this.statusRank(b) },
      delivery: { empty: () => false, cmp: (a, b) => this.deliveryRank(a) - this.deliveryRank(b) },
      person: {
        empty: d => !d.currentAssignmentUser?.trim() || this.stageOf(d) === 'published',
        cmp: (a, b) => text(a.currentAssignmentUser ?? '', b.currentAssignmentUser ?? '')
      }
    };
    const { empty, cmp } = spec[key];

    return [...rows].sort((a, b) => {
      const ea = empty(a), eb = empty(b);
      if (ea !== eb) return ea ? 1 : -1;
      // Eşitlikte en yeni kayıt üstte
      return (ea ? 0 : sign * cmp(a, b)) || created(b) - created(a);
    });
  }

  // Durum sütununun iş akışı sırası: Ön Kayıt, Kayıt Tamamlandı, Aktarımda, Aktarım Hatalı, Yayınlandı
  private statusRank(d: IncomingDocumentModel): number {
    if (isSentToPublish(d)) {
      if (isPublished(d)) return 4;
      return isPublishFailed(d) ? 3 : 2;
    }
    return d.status === STATUS_PRE_REGISTER ? 0 : 1;
  }

  readonly sortKey = signal<SortKey>('created');
  readonly sortDir = signal<SortDir>('desc');

  // Tarihler ilk tıklamada en yeniden, diğer sütunlar doğal sırada (asc) başlar
  sortByColumn(key: SortKey): void {
    if (this.sortKey() === key) {
      this.sortDir.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortKey.set(key);
      this.sortDir.set(key === 'created' || key === 'documentDate' ? 'desc' : 'asc');
    }
    this.page.set(1);
  }

  sortIcon(key: SortKey): string {
    if (this.sortKey() !== key) return 'unfold_more';
    return this.sortDir() === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  sortAria(key: SortKey): 'ascending' | 'descending' | 'none' {
    if (this.sortKey() !== key) return 'none';
    return this.sortDir() === 'asc' ? 'ascending' : 'descending';
  }

  // Araç çubuğundaki "Sırala" seçimi aynı sıralama durumunu gösterir ve değiştirir;
  // sütun başlığıyla seçilen bir sıralama hazır seçeneklerde yoksa "Sütuna göre" görünür.
  readonly sortPreset = computed(() => {
    const value = `${this.sortKey()}:${this.sortDir()}`;
    return SORT_PRESETS.some(p => p.value === value) ? value : 'custom';
  });

  setSortPreset(value: string): void {
    const [key, dir] = value.split(':') as [SortKey, SortDir];
    if (!key || !dir) return;
    this.sortKey.set(key);
    this.sortDir.set(dir);
    this.page.set(1);
  }

  readonly sortPresets = SORT_PRESETS;

  private urgencyRank(d: IncomingDocumentModel): number {
    return d.urgencyDegree != null ? (URGENCY_RANK[d.urgencyDegree] ?? 6) : 6;
  }

  isAttention(d: IncomingDocumentModel): boolean {
    return d.urgencyDegree != null && ATTENTION_URGENCIES.has(d.urgencyDegree);
  }

  // Satırdaki konu ilk SUBJECT_WORD_LIMIT kelimeyle sınırlanır; konu yoksa boş döner (gösterilmez)
  subjectPreview(subject?: string | null): string {
    const words = (subject ?? '').trim().split(/\s+/).filter(Boolean);
    if (words.length <= SUBJECT_WORD_LIMIT) return words.join(' ');
    return words.slice(0, SUBJECT_WORD_LIMIT).join(' ') + '…';
  }

  isDelivered(d: IncomingDocumentModel): boolean {
    return d.status === STATUS_DELIVERED;
  }

  // Durum sütunu tek etiket gösterir: yayına gönderilmiş evrakta yayın durumu (altında teslim
  // bilgisi), diğerlerinde akış durumu. Rozet Zarflar sayfasındaki durum rozetiyle aynıdır
  // (envelope-status-pill, styles.css); cls rengini, icon ikon çipini belirler.
  statusView(d: IncomingDocumentModel): { label: string; cls: string; icon: string } {
    if (isSentToPublish(d)) {
      if (isPublished(d)) return { label: 'Yayınlandı', cls: 'envelope-status-teslim', icon: 'cloud_done' };
      if (isPublishFailed(d)) return { label: 'Aktarım Hatalı', cls: 'envelope-status-iade', icon: 'cloud_off' };
      return { label: 'Aktarımda', cls: 'envelope-status-birimde', icon: 'cloud_sync' };
    }
    if (d.status === STATUS_PRE_REGISTER) return { label: 'Ön Kayıt', cls: 'dl-status-onkayit', icon: 'app_registration' };
    return { label: 'Kayıt Tamamlandı', cls: 'dl-status-kayit', icon: 'fact_check' };
  }

  // Teslim sütunu: evrak birime teslim edildi mi (akış durumu 3). Yayına gönderilmiş ama
  // teslim edilmemiş evrak "Teslim bekliyor"dur; kaydı süren evrak henüz teslim aşamasında değildir.
  deliveryView(d: IncomingDocumentModel): { label: string; tone: 'ok' | 'wait' | 'none' } {
    if (this.isDelivered(d)) return { label: 'Teslim edildi', tone: 'ok' };
    if (isSentToPublish(d)) return { label: 'Teslim bekliyor', tone: 'wait' };
    return { label: 'Teslim edilmedi', tone: 'none' };
  }

  // Teslim sütununun sırası: teslim edildi, teslim bekliyor, teslim edilmedi
  private deliveryRank(d: IncomingDocumentModel): number {
    const tone = this.deliveryView(d).tone;
    return tone === 'ok' ? 0 : tone === 'wait' ? 1 : 2;
  }

  // Atanan personel yayına gönderilmiş evrakta anlamsız: Yayınlanan aşamasında sütun yok
  readonly showPersonColumn = computed(() => this.activeStage() !== 'published');

  // ---- Satır menüsü (Süreç, Zimmet Geçmişi, Zimmetleme) ----
  readonly menu = signal<{ id: string; item: DocumentRow; top: number; left: number } | null>(null);

  toggleMenu(item: DocumentRow, event: MouseEvent): void {
    event.stopPropagation();
    if (!item.id || this.menu()?.id === item.id) {
      this.menu.set(null);
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const width = 200;
    const height = 176;
    const top = rect.bottom + 4 + height > window.innerHeight ? rect.top - height - 4 : rect.bottom + 4;
    this.menu.set({ id: item.id, item, top, left: Math.max(8, rect.right - width) });
  }

  runMenu(action: 'info' | 'process' | 'history' | 'zimmet'): void {
    const item = this.menu()?.item;
    this.menu.set(null);
    if (!item?.id) return;
    switch (action) {
      case 'info': this.openInfo(item); break;
      case 'process': this.openProcess(item); break;
      case 'history': this.openZimmetHistory(item); break;
      case 'zimmet': this.goToZimmet(item.id); break;
    }
  }

  // Menü dışına tıklanınca, kaydırınca ya da Esc ile kapanır
  @HostListener('document:click')
  @HostListener('window:scroll')
  @HostListener('window:resize')
  @HostListener('document:keydown.escape')
  closeMenu(): void {
    if (this.menu()) this.menu.set(null);
  }

  setStage(s: StageView): void {
    this.activeStage.set(s);
    this.personFilter.set(null);
    // Yayınlanan aşamasında Personel sütunu yok; o sütuna göre sıralıysa varsayılana dönülür
    if (s === 'published' && this.sortKey() === 'person') {
      this.sortKey.set('created');
      this.sortDir.set('desc');
    }
    this.publishFilter.set('all');
    this.page.set(1);
    try { sessionStorage.setItem(STAGE_STORAGE_KEY, s); } catch { /* depolama kapalı olabilir */ }
  }

  // Yöneticiler sayfayı ilk açtığında yayınlanan evrakları görür
  private readStoredStage(): StageView {
    try {
      const v = sessionStorage.getItem(STAGE_STORAGE_KEY);
      if (v && STAGES.some(s => s.key === v)) return v as StageView;
    } catch { /* depolama kapalı olabilir */ }
    return 'published';
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
    this.typeFilter.set(null);
    this.departmentFilter.set(null);
    this.personFilter.set(null);
    this.deliveryFilter.set('all');
    this.dateFrom.set('');
    this.dateTo.set('');
    this.publishFilter.set('all');
    this.page.set(1);
  }

  goToPage(p: number): void {
    this.page.set(Math.min(Math.max(1, p), this.pageCount()));
  }

  constructor() {
    this.loadDocuments();
    this.loadLookups();

    // Üst menüdeki "işlem bekleyenler" yönlendirmesi Kayıt Tamamlandı aşamasını açar;
    // istek bir kez tüketilir ki sonraki ziyaretler seçilen sekmede açılsın.
    effect(() => {
      const type = this.incomingDocumentService.currentIncomingDocumentSearchType;
      if (type !== 'pending') return;
      untracked(() => {
        this.clearFilters();
        this.setStage('registered');
        this.incomingDocumentService.setIncomingDocumentSearchType(null);
      });
    });
  }

  get currentUserId(): string | undefined {
    return this.user()?.id;
  }

  // Tüm gelen evraklar tek istekte çekilir; aşamalara ayırma ve süzme istemcide yapılır
  loadDocuments(): void {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.incomingDocumentService.getAllIncomingDocuments().subscribe({
      next: (docs) => {
        this.documents.set((docs ?? []).filter(d => !d.isDeleted));
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Gelen evraklar alınamadı:', err);
        this.loading.set(false);
        this.loadFailed.set(true);
      }
    });
  }

  private loadLookups(): void {
    this.departmentService.getDepartments().subscribe({
      next: (list) => this.departmentNames.set(Object.fromEntries((list ?? []).filter(x => x.id)
        .map(x => [x.id!.toLowerCase(), { name: x.name, short: x.shortName?.trim() || '' }]))),
      error: (err) => console.error('Birimler alınamadı:', err)
    });
    this.externalInstitutionService.getExternalInstitutions().subscribe({
      next: (list) => this.institutionNames.set(
        Object.fromEntries((list ?? []).filter(x => x.id).map(x => [x.id!.toLowerCase(), x.name]))),
      error: (err) => console.error('Dış kurumlar alınamadı:', err)
    });
  }

  // Excel'de Türkçe karakterlerin doğru açılması için BOM'lu, noktalı virgül ayraçlı CSV
  exportCsv(): void {
    const rows = this.filteredRows();
    if (!rows.length) return;
    const header = ['Evrak No', 'Türü', 'Konu', 'Nereden', 'Nereye', 'Belge Tarihi', 'Orijinal No',
      'İvedilik', 'Gizlilik', 'Durum', 'Yayın Durumu', 'Teslim', 'Atanan Personel', 'Kayıt Tarihi'];
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = rows.map(d => [
      d.qrCode,
      this.documentTypeLabels[d.documentTypeId] ?? '',
      d.subject,
      this.fromName(d),
      this.toName(d, false),
      d.documentDate ? new Date(d.documentDate).toLocaleDateString('tr-TR') : '',
      d.orginalNo,
      d.urgencyDegree != null ? this.urgencyDegreeMap[d.urgencyDegree] : '',
      this.securityDegreeMap[d.securityDegree] ?? '',
      DOCUMENT_STATUS_LABELS[d.status] ?? '',
      publishStatusLabel(d),
      this.deliveryView(d).label,
      d.currentAssignmentUser ?? '',
      d.createdDate ? new Date(d.createdDate).toLocaleDateString('tr-TR') : ''
    ].map(cell).join(';'));
    const blob = new Blob(['﻿' + [header.map(cell).join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stage = STAGES.find(s => s.key === this.activeStage())?.label ?? 'Tümü';
    a.href = url;
    a.download = `Gelen Evraklar - ${stage}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

  // Yayın durumu (submissionStatus; bkz. publishstatus.model)
  readonly isPublished = isPublished;
  readonly isPublishing = isPublishing;
  readonly isPublishFailed = isPublishFailed;
  readonly publishStatusLabel = publishStatusLabel;

  initials(fullName?: string | null): string {
    const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    const first = parts[0].charAt(0);
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return `${first}${last}`.toLocaleUpperCase('tr');
  }

  // ---- Evrak Bilgileri popup ----
  // Gelen Evraklar (scanlist) listesindeki popup'ın aynısı. Ek bilgisi gibi alanlar liste
  // yanıtında eksik olabileceğinden evrak GetById ile tazelenir.
  readonly infoVisible = signal(false);
  readonly infoLoading = signal(false);
  readonly infoDoc = signal<DocumentRow | null>(null);

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

      from: text(this.fromName(d)),
      to: text(this.toName(d, false)),

      pageCount: d.pageCount != null && String(d.pageCount) !== '' ? String(d.pageCount) : '-',
      hasAttachment: d.hasAttachment ?? null,
      attachmentDescription: d.attachmentDescription?.trim() || '',
      electronicCopy: d.electronicCopy === true ? 'Var' : d.electronicCopy === false ? 'Yok' : '-',
      language: text(languages[d.languageId]),
      hasFile: !!d.documentName,

      status: [
        { label: 'Durum', value: text(DOCUMENT_STATUS_LABELS[d.status]), tone: d.status === 3 ? 'success' : d.status === 1 ? 'info' : 'neutral' },
        {
          label: 'Yayın', value: publishStatusLabel(d),
          tone: isPublished(d) ? 'success' : isPublishFailed(d) ? 'danger' : isPublishing(d) ? 'warning' : 'neutral'
        },
        { label: 'OCR', value: OCR_STATUS_LABELS[ocr] ?? '-', tone: ocr === 1 ? 'success' : ocr === 2 ? 'danger' : 'warning' }
      ],

      meta: [
        { icon: 'person', label: 'Atanan Personel', value: text(d.currentAssignmentUser) },
        { icon: 'calendar_add_on', label: 'Oluşturulma', value: dateTime(d.createdDate) },
        { icon: 'update', label: 'Son Güncelleme', value: dateTime(d.updateDate) }
      ]
    };
  });

  openInfo(item: DocumentRow): void {
    if (!item.id) return;
    this.infoDoc.set(item);
    this.infoVisible.set(true);
    this.infoLoading.set(true);

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

  // Popup'tan Evrak Kayıt ekranına geçiş
  openInfoDetail(): void {
    const id = this.infoDoc()?.id;
    this.closeInfo();
    if (id) this.goToDetail(id);
  }

  // ---- Süreç popup'ı ----
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

  openProcessPage(): void {
    const id = this.processDoc()?.id;
    this.closeProcess();
    if (id) this.goToProcess(id);
  }

  // ---- Zimmet Geçmişi popup ----
  // Gelen Evraklar (scanlist) listesindeki popup'ın aynısı: evrakın mevcut ve geçmiş
  // zimmetleri salt okunur gösterilir.
  readonly zimmetHistoryVisible = signal(false);
  readonly zimmetHistoryLoading = signal(false);
  readonly zimmetHistoryDoc = signal<IncomingDocumentModel | null>(null);
  readonly zimmetHistory = signal<DocumentAllocationModel[]>([]);
  readonly activeZimmet = computed(() => this.zimmetHistory().find(h => h.isActive) ?? null);
  readonly zimmetHistoryExpanded = signal(true);
  readonly allocationStatusLabels: Record<number, string> = AllocationStatusLabels;

  // Kişi adının yanında çalıştığı birimin kısa adı; kullanıcı listesi popup ilk açıldığında yüklenir
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

  // Gelen evrak zimmet kaydı işlemi yapanı taşımadığından kişi zincirden bulunur:
  // kayıttan hemen önceki zimmetin sahibi evrakı devreden / teslim eden kişidir.
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
  // numaraya ait evrak varsa dosya ona bağlanır, yoksa yeni evrak oluşturulur. Ardından
  // kaydı tamamlamak üzere Evrak Kayıt ekranı açılır. (Akış DocumentUploadFlow'da, scanlist ile ortak.)
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
          this.loadDocuments();
        }
      },
      error: (err: DocumentNumberUploadError) => {
        this.newUploadLoading.set(false);
        if (err?.userMessage) this.#toast.showToast('Uyarı', err.userMessage, 'warning');
      }
    });
  }
}
