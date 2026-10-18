import { idKey } from '../../models/ids';
import { IncomingAttachmentsView } from '../../../components/incoming-attachments-view/incoming-attachments-view';
import {
  ChangeDetectionStrategy,
  Component,
  signal,
  ViewEncapsulation,
  computed,
  inject,
  HostListener
} from '@angular/core';
import { Router } from '@angular/router';
import GenericModel from '../../../components/generic-model/generic-model';
import { CommonModule } from '@angular/common';
import { FlexiToastService } from 'flexi-toast';
import { FormsModule } from '@angular/forms';
import { httpResource } from '@angular/common/http';
import { IncomingDocumentService } from '../../services/incomingdocument';
import { IncomingDocumentModel, incomingRecipientNames, incomingRecipientsOf, summarizeRecipientNames } from '../../models/incoming-document/incoming-document.model';
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
  buildProcessSteps, processMilestoneKind, ProcessStep, processTypeIcon, processTypeTone,
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

// Yönetici listesi yalnızca yayına gönderilmiş evrakları gösterir (Yayınlandı / Aktarımda /
// Aktarım Hatalı); ön kayıttaki ve kaydı tamamlanıp yayına gönderilmemiş evraklar listelenmez.
type PublishView = 'all' | 'done' | 'progress' | 'failed';
type DeliveryView = 'all' | 'delivered' | 'undelivered';
type SortKey = 'created' | 'no' | 'from' | 'to' | 'documentDate' | 'urgency' | 'security' | 'status' | 'delivery';
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

// Kriterler panelindeki hazır belge tarihi aralıkları (bugün dahil)
type DatePresetKey = 'today' | 'week' | 'month' | 'year';
const DATE_PRESETS: readonly { key: DatePresetKey; label: string }[] = [
  { key: 'today', label: 'Bugün' },
  { key: 'week', label: 'Son 7 gün' },
  { key: 'month', label: 'Son 30 gün' },
  { key: 'year', label: 'Bu yıl' }
];

// <input type="date"> değeri: yerel saatle yyyy-MM-dd
function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const PAGE_SIZE = 10;
// Sayfalamada aynı anda gösterilen sayfa numarası düğmesi
const PAGE_WINDOW = 5;
const SUBJECT_WORD_LIMIT = 12;

type DocumentRow = IncomingDocumentModel & { currentAssignmentUser?: string | null };

/** Gelen Evraklar (yönetici): tüm gelen evrakların salt izleme listesi. İşleme Al / kilit yok;
 *  Detay evrakı her durumda Evrak Kayıt ekranında açar. Görünüm Gelen Evraklar kuyruk
 *  ekranıyla (scanlist) ortak sq- stillerini kullanır. */
@Component({
  imports: [
    IncomingAttachmentsView,
    GenericModel,
    FormsModule,
    CommonModule,
    UploadDocumentModal
  ],
  templateUrl: './documentlist.html',
  // scanlist.css: Süreç ve Zimmet Geçmişi popup'ları (zh-, sp-); incoming-info-modal.css: Evrak Bilgileri (ei-);
  // scanlist-queue.css: kuyruk kartları, araç çubuğu, satır ve sayfalama (sq-).
  // settings/support/zimmetlerim.css: üst kart (sp-hero, zl-hero, st-chip), Birim Gelen Evrakları ile ortak.
  styleUrls: [
    '../settings/settings.css',
    '../support/support.css',
    '../zimmetlerim/zimmetlerim.css',
    '../scanlist/scanlist.css',
    '../../../components/incoming-info-modal/incoming-info-modal.css',
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
  // Üst birim -> doğrudan alt birimler (Birimim süzgecinde alt birimleri de kapsamak için)
  private readonly departmentChildren = signal<Record<string, string[]>>({});

  readonly departmentOptions = computed(() =>
    Object.entries(this.departmentNames())
      .map(([id, d]) => ({ id, label: d.short && d.short !== d.name ? `${d.short} · ${d.name}` : d.name }))
      .sort((a, b) => a.label.localeCompare(b.label, 'tr')));

  // Kurum adı cevapta gelir (externalInstitutionName); ~160.000 kurumluk liste ad için çekilmez
  fromName(d: IncomingDocumentModel): string {
    return d.externalInstitutionName || '';
  }

  // Nereye: evrak birden fazla birime gidebilir (distributions); adlar birim listesinden çözülür.
  // Kısa biçimde kısa ad + "(B)", tam biçimde (tooltip, CSV, arama) tam ad + "(Bilgi)"
  private toNames(d: IncomingDocumentModel, compact: boolean): string[] {
    const names = this.departmentNames();
    return incomingRecipientNames(d, id => {
      const dept = names[idKey(id)!];
      return dept && (compact ? (dept.short || dept.name) : dept.name);
    }, compact ? 'B' : 'Bilgi');
  }

  // Tüm alıcılar virgülle (sıralama, arama, CSV ve önizleme için)
  toName(d: IncomingDocumentModel, compact = true): string {
    return this.toNames(d, compact).join(', ');
  }

  // Satır hücresi tam adlarla: çok alıcıda "X ve N birim daha"; tam liste title'da alt alta
  toCell(d: IncomingDocumentModel): string {
    return summarizeRecipientNames(this.toNames(d, false));
  }

  toTitle(d: IncomingDocumentModel): string {
    return this.toNames(d, false).join('\n');
  }

  // ---- Süzgeçler ----
  readonly search = signal('');
  readonly urgencyFilter = signal<number | null>(null);
  readonly securityFilter = signal<number | null>(null);
  readonly typeFilter = signal<number | null>(null);
  readonly departmentFilter = signal<string | null>(null);
  // Nereden: kurum adında geçen metin (büyük/küçük harf duyarsız)
  readonly fromFilter = signal('');
  // Nereden önerileri: listedeki evrakların kurumları (kurum listesi ~160.000 kayıt, ayrıca çekilmez)
  readonly fromOptions = computed(() => {
    const names = new Set<string>();
    for (const d of this.documents()) {
      const n = this.fromName(d).trim();
      if (n) names.add(n);
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'tr'));
  });
  // "Birimim": yalnızca kullanıcının birimine ya da ona bağlı alt birimlere (alıcılarından
  // biri olarak) gelen evraklar
  readonly ownDepartmentOnly = signal(false);
  readonly ownDepartmentId = computed(() => idKey(this.user()?.departmentId) ?? null);
  // Kullanıcının birimi ve tüm alt birimleri (her derinlikte); döngüye karşı ziyaret edilenler atlanır
  readonly ownDepartmentScope = computed(() => {
    const scope = new Set<string>();
    const root = this.ownDepartmentId();
    if (!root) return scope;
    const children = this.departmentChildren();
    const queue = [root];
    while (queue.length) {
      const id = queue.pop()!;
      if (scope.has(id)) continue;
      scope.add(id);
      queue.push(...(children[id] ?? []));
    }
    return scope;
  });
  readonly subDepartmentCount = computed(() => Math.max(0, this.ownDepartmentScope().size - 1));
  readonly ownDepartmentName = computed(() => {
    const id = this.ownDepartmentId();
    const d = id ? this.departmentNames()[id] : undefined;
    return d ? (d.short || d.name) : '';
  });
  readonly deliveryFilter = signal<DeliveryView>('all');
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  readonly publishFilter = signal<PublishView>('all');
  readonly page = signal(1);
  readonly filtersOpen = signal(false);

  // Aktarımı hatalı evrak sayısı: üst kartta uyarı çipi olarak gösterilir
  readonly failedCount = computed(() => this.documents().filter(d => isPublishFailed(d)).length);

  readonly filteredRows = computed(() => {
    const terms = this.search().trim().toLocaleLowerCase('tr').split(/\s+/).filter(Boolean);
    const urgency = this.urgencyFilter();
    const security = this.securityFilter();
    const type = this.typeFilter();
    const department = this.departmentFilter();
    const fromTerm = this.fromFilter().trim().toLocaleLowerCase('tr');
    const ownScope = this.ownDepartmentOnly() && this.ownDepartmentId() ? this.ownDepartmentScope() : null;
    const delivery = this.deliveryFilter();
    const from = this.dateFrom() ? new Date(this.dateFrom() + 'T00:00:00').getTime() : null;
    const to = this.dateTo() ? new Date(this.dateTo() + 'T23:59:59').getTime() : null;
    const publish = this.publishFilter();

    const rows = this.documents().filter(d => {
      if (urgency != null && d.urgencyDegree !== urgency) return false;
      if (security != null && d.securityDegree !== security) return false;
      if (type != null && d.documentTypeId !== type) return false;
      // Birim süzgeci backend'deki gibi: birim evrakın alıcılarından biri mi
      if (department && !incomingRecipientsOf(d).some(r => idKey(r.departmentId) === department)) return false;
      if (fromTerm && !this.fromName(d).toLocaleLowerCase('tr').includes(fromTerm)) return false;
      if (ownScope &&!incomingRecipientsOf(d).some(r => ownScope.has(idKey(r.departmentId)!))) return false;
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
    + (this.fromFilter().trim() ? 1 : 0)
    + (this.dateFrom() || this.dateTo() ? 1 : 0));

  // Kriterler panelinde grup başlıklarındaki seçim sayıları
  readonly groupCounts = computed(() => ({
    document: (this.typeFilter() != null ? 1 : 0) + (this.urgencyFilter() != null ? 1 : 0)
      + (this.securityFilter() != null ? 1 : 0),
    routing: (this.fromFilter().trim() ? 1 : 0) + (this.departmentFilter() ? 1 : 0),
    date: this.dateFrom() || this.dateTo() ? 1 : 0
  }));

  readonly deliveryOptions: readonly { value: DeliveryView; label: string; tone?: 'ok' | 'wait' }[] = [
    { value: 'all', label: 'Tümü' },
    { value: 'delivered', label: 'Teslim edildi', tone: 'ok' },
    { value: 'undelivered', label: 'Teslim bekliyor', tone: 'wait' }
  ];

  // ---- Hazır belge tarihi aralıkları ----
  readonly datePresets = DATE_PRESETS;

  private presetRange(key: DatePresetKey): { from: string; to: string } {
    const today = new Date();
    const start = new Date(today);
    switch (key) {
      case 'today': break;
      case 'week': start.setDate(today.getDate() - 6); break;
      case 'month': start.setDate(today.getDate() - 29); break;
      case 'year': start.setMonth(0, 1); break;
    }
    return { from: toDateInput(start), to: toDateInput(today) };
  }

  // Seçili tarih aralığı hazır aralıklardan biriyle birebir aynıysa o düğme seçili görünür
  readonly activeDatePreset = computed<DatePresetKey | null>(() => {
    const from = this.dateFrom(), to = this.dateTo();
    if (!from || !to) return null;
    return DATE_PRESETS.find(p => {
      const r = this.presetRange(p.key);
      return r.from === from && r.to === to;
    })?.key ?? null;
  });

  // Seçili hazır aralığa tekrar tıklanınca tarih süzgeci kaldırılır
  setDatePreset(key: DatePresetKey): void {
    if (this.activeDatePreset() === key) {
      this.dateFrom.set('');
      this.dateTo.set('');
    } else {
      const r = this.presetRange(key);
      this.dateFrom.set(r.from);
      this.dateTo.set(r.to);
    }
    this.page.set(1);
  }

  // Paneldeki "Kriterleri temizle": yalnızca paneldeki alanlar; arama, yayın durumu, teslim
  // durumu ve Birimim (araç çubuğundakiler) korunur
  clearCriteria(): void {
    this.urgencyFilter.set(null);
    this.securityFilter.set(null);
    this.typeFilter.set(null);
    this.departmentFilter.set(null);
    this.fromFilter.set('');
    this.dateFrom.set('');
    this.dateTo.set('');
    this.page.set(1);
  }

  readonly hasActiveFilters = computed(() =>
    !!this.search().trim() || this.selectFilterCount() > 0 || this.publishFilter() !== 'all'
    || this.deliveryFilter() !== 'all' || this.ownDepartmentOnly());

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
    return { title: 'Yayınlanan evrak yok', desc: 'Yayına gönderilen evraklar burada görünür.' };
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
      to: { empty: d => !this.toName(d, false), cmp: (a, b) => text(this.toName(a, false), this.toName(b, false)) },
      documentDate: {
        empty: d => !d.documentDate,
        cmp: (a, b) => new Date(a.documentDate).getTime() - new Date(b.documentDate).getTime()
      },
      urgency: { empty: d => d.urgencyDegree == null, cmp: (a, b) => this.urgencyRank(a) - this.urgencyRank(b) },
      security: { empty: d => d.securityDegree == null, cmp: (a, b) => (b.securityDegree ?? 0) - (a.securityDegree ?? 0) },
      status: { empty: () => false, cmp: (a, b) => this.statusRank(a) - this.statusRank(b) },
      delivery: { empty: () => false, cmp: (a, b) => this.deliveryRank(a) - this.deliveryRank(b) }
    };
    const { empty, cmp } = spec[key];

    return [...rows].sort((a, b) => {
      const ea = empty(a), eb = empty(b);
      if (ea !== eb) return ea ? 1 : -1;
      // Eşitlikte en yeni kayıt üstte
      return (ea ? 0 : sign * cmp(a, b)) || created(b) - created(a);
    });
  }

  // Durum sütununun sırası: Aktarımda, Aktarım Hatalı, Yayınlandı
  private statusRank(d: IncomingDocumentModel): number {
    if (isPublished(d)) return 2;
    return isPublishFailed(d) ? 1 : 0;
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

  // Durum sütunu yayın durumunu gösterir. Rozet Zarflar sayfasındaki durum rozetiyle aynıdır
  // (envelope-status-pill, styles.css); cls rengini, icon ikon çipini belirler.
  statusView(d: IncomingDocumentModel): { label: string; cls: string; icon: string } {
    if (isPublished(d)) return { label: 'Yayınlandı', cls: 'envelope-status-teslim', icon: 'cloud_done' };
    if (isPublishFailed(d)) return { label: 'Aktarım Hatalı', cls: 'envelope-status-iade', icon: 'cloud_off' };
    return { label: 'Aktarımda', cls: 'envelope-status-birimde', icon: 'cloud_sync' };
  }

  // Teslim sütunu: evrak birime teslim edildi mi (akış durumu 3); edilmediyse "Teslim bekliyor"
  deliveryView(d: IncomingDocumentModel): { label: string; tone: 'ok' | 'wait' } {
    return this.isDelivered(d) ? { label: 'Teslim edildi', tone: 'ok' } : { label: 'Teslim bekliyor', tone: 'wait' };
  }

  // Teslim sütununun sırası: teslim edildi, teslim bekliyor
  private deliveryRank(d: IncomingDocumentModel): number {
    return this.isDelivered(d) ? 0 : 1;
  }

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

  runMenu(action: 'process' | 'history' | 'zimmet'): void {
    const item = this.menu()?.item;
    this.menu.set(null);
    if (!item?.id) return;
    switch (action) {
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
    this.fromFilter.set('');
    this.ownDepartmentOnly.set(false);
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
  }

  get currentUserId(): string | undefined {
    return this.user()?.id;
  }

  // Tüm gelen evraklar tek istekte çekilir; yayına gönderilmemişler ayıklanır, süzme istemcide yapılır
  loadDocuments(): void {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.incomingDocumentService.getAllIncomingDocuments().subscribe({
      next: (docs) => {
        this.documents.set((docs ?? []).filter(d => !d.isDeleted && isSentToPublish(d)));
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
      next: (list) => {
        const depts = (list ?? []).filter(x => x.id);
        this.departmentNames.set(Object.fromEntries(depts
          .map(x => [idKey(x.id)!, { name: x.name, short: x.shortName?.trim() || '' }])));
        const children: Record<string, string[]> = {};
        for (const x of depts) {
          const parent = idKey(x.parentId);
          const id = idKey(x.id)!;
          if (parent && parent !== id) (children[parent] ??= []).push(id);
        }
        this.departmentChildren.set(children);
      },
      error: (err) => console.error('Birimler alınamadı:', err)
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
    a.href = url;
    a.download = 'Gelen Evraklar - Yayınlanan.csv';
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
      // Nereye: tam adlar; üzerine gelince alt alta
      to: text(this.toName(d, false)),
      toTitle: this.toTitle(d),

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

    // GetById alıcıları döndürmez; "Nereye" listesi GetDistributions'tan eklenir
    this.incomingDocumentService.getIncomingDocumentWithDistributions(item.id).subscribe({
      next: (fresh) => {
        // Atanan personelin adı yalnızca liste satırında gelir; tazelenen kayda taşınır.
        // Alıcılar okunamadıysa liste satırındaki distributions kullanılır.
        if (fresh) this.infoDoc.set({
          ...fresh,
          distributions: fresh.distributions ?? item.distributions,
          currentAssignmentUser: fresh.currentAssignmentUser ?? item.currentAssignmentUser
        });
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

  openProcess(item: IncomingDocumentModel): void {
    if (!item.id) return;
    this.usersRequested.set(true);
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

  // Kişi adının yanında "(Birim kısa adı / Unvan)"; boş olan parça yazılmaz. Kullanıcı listesi popup ilk açıldığında yüklenir
  private readonly usersRequested = signal(false);
  readonly usersResult = httpResource<UserModel[]>(() => this.usersRequested() ? 'api/Users/GetAll?onlyWithRoles=true' : undefined);
  readonly userMetaMap = computed(() => {
    const map: Record<string, string> = {};
    for (const u of this.usersResult.value() ?? []) {
      const short = u.departmentShortName?.trim() || u.departmentName?.trim();
      const meta = [short, u.titleName?.trim()].filter(Boolean).join(' / ');
      if (u.id && meta) map[u.id.toLowerCase()] = meta;
    }
    return map;
  });

  /** "Birim / Unvan"; kartlarda ve "Devreden / Teslim eden" satırında ad soyadın altında küçük gösterilir */
  personMeta(a: { userId?: string | null }): string | null {
    return a.userId ? this.userMetaMap()[a.userId.toLowerCase()] ?? null : null;
  }

  // Süreç kayıtları (DocumentTransactionDto) kişi Id'si taşımıyor, yalnızca ad soyad; bu yüzden ad soyaddan eşlenir.
  // Aynı ada sahip birden fazla kullanıcı varsa belirsiz olduğundan bilgi gösterilmez.
  private readonly userMetaByName = computed(() => {
    const map: Record<string, string | null> = {};
    for (const u of this.usersResult.value() ?? []) {
      const key = this.nameKey(`${u.name ?? ''} ${u.surname ?? ''}`);
      if (!key) continue;
      const meta = u.id ? this.userMetaMap()[u.id.toLowerCase()] ?? null : null;
      map[key] = key in map ? null : meta;
    }
    return map;
  });

  private nameKey(name?: string | null): string {
    return (name ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr');
  }

  personMetaByName(name?: string | null): string | null {
    const key = this.nameKey(name);
    return key ? this.userMetaByName()[key] ?? null : null;
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
    const actors: Record<string, DocumentAllocationModel> = {};
    chronological.forEach((h, i) => {
      if (h.status === AllocationStatusEnum.IlkKayit || !this.allocationActorLabels[h.status]) return;
      const previous = chronological[i - 1];
      if (previous) actors[h.id] = previous;
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
