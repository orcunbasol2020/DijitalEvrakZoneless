import { ChangeDetectionStrategy, Component, LOCALE_ID, ViewEncapsulation, computed, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe, formatDate } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { httpResource } from '@angular/common/http';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { FlexiToastService } from 'flexi-toast';
import GenericModel from '../../../components/generic-model/generic-model';
import { AtlasTransferDetail } from '../../../components/atlas-transfer-detail/atlas-transfer-detail';
import { PagedResultDto } from '../users/login-logs/login-logs';
import { AtlasTransferService } from '../../services/atlas-transfer';
import { IncomingDocumentService, incomingErrorMessage } from '../../services/incomingdocument';
import { Common } from '../../services/common';
import { RoleService } from '../../services/role-service';
import {
  DigitizationGroup,
  DigitizationSortField,
  DigitizationSource,
  DigitizationStageKey,
  DigitizationStep,
  DigitizationStepStatus,
  DigitizationTrackingItem,
  DigitizationTrackingStats
} from '../../models/digitization-tracking.model';

interface GroupDef {
  key: DigitizationGroup;
  /** Kart ve filtre başlığı (çoğul) */
  label: string;
  /** Tablodaki Durum rozeti (tekil) */
  badge: string;
  icon: string;
}

/** Özet kartları, Durum filtresi ve rozetler aynı gruplarla çalışır; her tarama tam bir gruba düşer. */
const GROUPS: readonly GroupDef[] = [
  { key: 'pending', label: 'Bekleyenler', badge: 'Bekliyor', icon: 'hourglass_empty' },
  { key: 'saved', label: 'Kaydedilenler', badge: 'Kaydedildi', icon: 'save' },
  { key: 'publishing', label: 'Yayın sırasında', badge: 'Yayın sırasında', icon: 'schedule_send' },
  { key: 'published', label: 'Yayınlananlar', badge: 'Yayınlandı', icon: 'cloud_done' },
  { key: 'error', label: 'Hatalı', badge: 'Hatalı', icon: 'error' },
];

/** Ekran açılışında seçili grup: iş bekleyen taramalar */
const DEFAULT_GROUP: DigitizationGroup = 'pending';

interface StageDef {
  key: DigitizationStageKey;
  label: string;
  icon: string;
}

const STAGES: readonly StageDef[] = [
  { key: 'scanned', label: 'Belge tarandı', icon: 'scanner' },
  { key: 'qrRead', label: 'QR kod okundu', icon: 'qr_code_scanner' },
  { key: 'transferred', label: 'Evrak takibe aktarıldı', icon: 'move_to_inbox' },
  { key: 'saved', label: 'Kaydedildi', icon: 'save' },
  { key: 'publishing', label: 'Yayınlandı – aktarımda', icon: 'publish' },
  { key: 'atlasDone', label: "Atlas'a aktarıldı", icon: 'cloud_done' },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

/** Bugünün yerel tarihi, date input biçiminde (yyyy-MM-dd). */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** yyyy-MM-dd günün yerel gece yarısını (gün kaydırılarak) UTC ISO metnine çevirir. */
function localDayStartIso(iso: string, addDays = 0): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d + addDays).toISOString();
}

@Component({
  imports: [GenericModel, FormsModule, DatePipe, AtlasTransferDetail],
  templateUrl: './dijitallestirme-takip.html',
  styleUrls: [
    '../home/dashboard.css',
    '../../../components/atlas-transfer-detail/atlas-transfer-detail.css',
    './dijitallestirme-takip.css'
  ],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closeAtlasDetail()' }
})
export default class DijitallestirmeTakip {
  readonly #atlasService = inject(AtlasTransferService);
  readonly #toast = inject(FlexiToastService);
  readonly #common = inject(Common);
  readonly #locale = inject(LOCALE_ID);
  readonly #router = inject(Router);
  readonly #route = inject(ActivatedRoute);
  readonly #roleService = inject(RoleService);
  readonly #incomingDocumentService = inject(IncomingDocumentService);

  /** Taranan Belgeler (scanneddocument) sayfasının rolü; route tanımıyla aynı. Roller oturumdan okunur, sayfa açıkken değişmez. */
  readonly canOpenPool = this.#roleService.has('Gelen Evrak');

  readonly stages = STAGES;
  readonly groups = GROUPS;
  readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  readonly today = todayIso();

  readonly stepStatusLabel: Record<DigitizationStepStatus, string> = {
    completed: 'Tamamlandı',
    processing: 'Sürüyor',
    error: 'Hata',
    pending: 'Bekliyor',
    skipped: 'Uygulanmaz',
    warning: 'Barkod okunamadı'
  };

  readonly stepStatusIcon: Record<DigitizationStepStatus, string> = {
    completed: 'check',
    processing: 'sync',
    error: 'close',
    pending: '',
    skipped: 'remove',
    warning: 'priority_high'
  };

  readonly sourceLabel: Record<DigitizationSource, string> = {
    evrak: 'Evrak',
    nota: 'Nota'
  };

  // ---- Filtreler (sunucu tarafında uygulanır) ----
  readonly searchInput = signal('');
  readonly search = signal('');
  /** '' = tümü ("Tümü" kartı). Ekran Bekleyenler ile açılır; Filtreleri temizle de buna döner. */
  readonly groupFilter = signal<DigitizationGroup | ''>(DEFAULT_GROUP);
  readonly sourceFilter = signal<DigitizationSource | ''>('');
  readonly startDate = signal('');
  readonly endDate = signal('');

  readonly sortBy = signal<DigitizationSortField>('scannedAt');
  readonly sortDir = signal<'asc' | 'desc'>('desc');

  readonly pageSize = signal<number>(10);
  readonly currentPage = signal(1);

  #searchTimer: ReturnType<typeof setTimeout> | undefined;

  readonly isFiltering = computed(() =>
    !!this.search().trim() || this.groupFilter() !== DEFAULT_GROUP || !!this.sourceFilter() || !!this.startDate() || !!this.endDate());

  // ---- Filtre paneli: kapalı açılır; durum grubu kartlarla seçildiği için sayılmaz ----
  readonly filtersOpen = signal(false);

  readonly activeFilterCount = computed(() =>
    (this.search().trim() ? 1 : 0) + (this.sourceFilter() ? 1 : 0) + (this.startDate() || this.endDate() ? 1 : 0));

  toggleFilters(): void {
    this.filtersOpen.update(open => !open);
  }

  // ---- Seçim adres çubuğunda: Taranan Belgeler'e ya da Evrak Kayıt'a gidip geri dönünce aynı kart,
  // sayfa, sıralama ve filtrelerle açılır. Varsayılan değerler adrese yazılmaz. ----
  readonly #urlState = computed<Record<string, string | null>>(() => {
    const group = this.groupFilter();
    return {
      group: group === DEFAULT_GROUP ? null : (group || 'all'),
      q: this.search().trim() || null,
      source: this.sourceFilter() || null,
      from: this.startDate() || null,
      to: this.endDate() || null,
      sort: this.sortBy() === 'scannedAt' ? null : this.sortBy(),
      dir: this.sortDir() === 'desc' ? null : this.sortDir(),
      page: this.currentPage() > 1 ? String(this.currentPage()) : null,
      size: this.pageSize() === 10 ? null : String(this.pageSize())
    };
  });

  constructor() {
    this.#restoreFromUrl(this.#route.snapshot.queryParamMap);

    effect(() => {
      const queryParams = this.#urlState();
      untracked(() => this.#router.navigate([], { relativeTo: this.#route, queryParams, replaceUrl: true }));
    });

    // Adresten gelen sayfa, kayıtlar azaldığı için artık yoksa son sayfaya geçilir
    effect(() => {
      if (!this.result.hasValue()) return;
      const { items, totalCount } = this.result.value();
      if (!items?.length && totalCount > 0 && untracked(this.currentPage) > 1) {
        this.currentPage.set(Math.max(1, Math.ceil(totalCount / untracked(this.pageSize))));
      }
    });
  }

  #restoreFromUrl(params: ParamMap): void {
    const group = params.get('group');
    if (group === 'all') this.groupFilter.set('');
    else if (GROUPS.some(g => g.key === group)) this.groupFilter.set(group as DigitizationGroup);

    const q = params.get('q')?.trim();
    if (q) {
      this.searchInput.set(q);
      this.search.set(q);
    }

    const source = params.get('source');
    if (source === 'evrak' || source === 'nota') this.sourceFilter.set(source);

    const isDay = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
    const from = params.get('from');
    const to = params.get('to');
    if (isDay(from)) this.startDate.set(from);
    if (isDay(to)) this.endDate.set(to);

    const sort = params.get('sort');
    if (sort === 'documentNumber' || sort === 'documentName' || sort === 'source' || sort === 'status') this.sortBy.set(sort);
    if (params.get('dir') === 'asc') this.sortDir.set('asc');

    const size = Number(params.get('size'));
    if ((PAGE_SIZE_OPTIONS as readonly number[]).includes(size)) this.pageSize.set(size);

    const page = Number(params.get('page'));
    if (Number.isInteger(page) && page > 1) this.currentPage.set(page);

    // Panel filtresi varsa panel açık gelir
    if (this.activeFilterCount() > 0) this.filtersOpen.set(true);
  }

  readonly rangeError = computed(() => {
    const start = this.startDate();
    const end = this.endDate();
    return start && end && end < start ? 'Bitiş tarihi başlangıç tarihinden önce olamaz.' : null;
  });

  // ---- Liste ----
  readonly result = httpResource<PagedResultDto<DigitizationTrackingItem>>(() => {
    if (this.rangeError()) return undefined;
    const p = new URLSearchParams();
    const search = this.search().trim();
    if (search) p.set('search', search);
    if (this.groupFilter()) p.set('group', this.groupFilter());
    if (this.sourceFilter()) p.set('source', this.sourceFilter());
    // Tarama tarihleri UTC'dir: seçilen günler yerel gece yarısına göre gönderilir; bitiş günü
    // dahil olsun diye bir sonraki günün başlangıcı verilir.
    if (this.startDate()) p.set('dateFrom', localDayStartIso(this.startDate()));
    if (this.endDate()) p.set('dateTo', localDayStartIso(this.endDate(), 1));
    p.set('sortBy', this.sortBy());
    p.set('sortDir', this.sortDir());
    p.set('page', String(this.currentPage()));
    p.set('pageSize', String(this.pageSize()));
    return `api/ScannedDocuments/GetDigitizationTracking?${p.toString()}`;
  });

  // Not: hata durumundaki bir resource'ta value() istisna fırlatır; önce hasValue() ile bakılır.
  readonly rows = computed(() => this.result.hasValue() ? (this.result.value().items ?? []) : []);
  readonly totalCount = computed(() => this.result.hasValue() ? (this.result.value().totalCount ?? 0) : 0);
  readonly loading = computed(() => this.result.isLoading());
  readonly error = computed(() => this.result.error());

  // ---- Özet kartları: yalnızca açılışta, Yenile'de ve Yeniden Dene sonrası yüklenir ----
  readonly statsResource = httpResource<DigitizationTrackingStats>(() => 'api/ScannedDocuments/GetDigitizationTrackingStats');

  readonly stats = computed<DigitizationTrackingStats>(() =>
    this.statsResource.hasValue()
      ? this.statsResource.value()
      : { total: 0, pending: 0, saved: 0, publishing: 0, published: 0, error: 0 });
  readonly statsLoaded = computed(() => this.statsResource.hasValue());

  // ---- Sayfalama (sunucu) ----
  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalCount() / this.pageSize())));

  readonly pageNumbers = computed(() => {
    const total = this.totalPages();
    const current = Math.min(this.currentPage(), total);
    const delta = 2;
    const from = Math.max(1, current - delta);
    const to = Math.min(total, current + delta);
    const range: number[] = [];
    for (let i = from; i <= to; i++) range.push(i);
    return range;
  });

  readonly pageRangeStart = computed(() =>
    this.totalCount() === 0 ? 0 : (this.currentPage() - 1) * this.pageSize() + 1);

  readonly pageRangeEnd = computed(() =>
    Math.min(this.currentPage() * this.pageSize(), this.totalCount()));

  goToPage(page: number): void {
    const clamped = Math.min(Math.max(page, 1), this.totalPages());
    if (clamped === this.currentPage()) return;
    this.currentPage.set(clamped);
    this.expandedId.set(null);
  }

  setPageSize(value: number | string): void {
    this.pageSize.set(Number(value));
    this.#resetPage();
  }

  // ---- Filtre değişimleri ----
  /** Yazarken her tuşta istek atmamak için 400 ms beklenir. */
  setSearch(value: string): void {
    this.searchInput.set(value);
    clearTimeout(this.#searchTimer);
    this.#searchTimer = setTimeout(() => {
      this.search.set(value);
      this.#resetPage();
    }, 400);
  }

  clearSearch(): void {
    clearTimeout(this.#searchTimer);
    this.searchInput.set('');
    this.search.set('');
    this.#resetPage();
  }

  setGroup(value: DigitizationGroup | ''): void {
    this.groupFilter.set(value);
    this.#resetPage();
  }

  setSource(value: DigitizationSource | ''): void {
    this.sourceFilter.set(value);
    this.#resetPage();
  }

  setStartDate(value: string): void {
    this.startDate.set(value ?? '');
    this.#resetPage();
  }

  setEndDate(value: string): void {
    this.endDate.set(value ?? '');
    this.#resetPage();
  }

  clearFilters(): void {
    clearTimeout(this.#searchTimer);
    this.searchInput.set('');
    this.search.set('');
    this.groupFilter.set(DEFAULT_GROUP);
    this.sourceFilter.set('');
    this.startDate.set('');
    this.endDate.set('');
    this.#resetPage();
  }

  toggleSort(field: DigitizationSortField): void {
    if (this.sortBy() === field) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortBy.set(field);
      // Tarih ilk tıklamada en yeniden, metin alanları A'dan Z'ye
      this.sortDir.set(field === 'scannedAt' ? 'desc' : 'asc');
    }
    this.#resetPage();
  }

  sortIcon(field: DigitizationSortField): string {
    if (this.sortBy() !== field) return 'unfold_more';
    return this.sortDir() === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  ariaSort(field: DigitizationSortField): 'ascending' | 'descending' | 'none' {
    if (this.sortBy() !== field) return 'none';
    return this.sortDir() === 'asc' ? 'ascending' : 'descending';
  }

  refresh(): void {
    this.result.reload();
    this.statsResource.reload();
  }

  #resetPage(): void {
    this.currentPage.set(1);
    this.expandedId.set(null);
  }

  // ---- Detay satırı ----
  readonly expandedId = signal<string | null>(null);

  toggleDetail(id: string): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  // ---- Atlas aktarım detayı (mevcut bileşen) ----
  readonly atlasDetailId = signal<string | null>(null);

  openAtlasDetail(row: DigitizationTrackingItem, event?: Event): void {
    event?.stopPropagation();
    if (row.incomingDocumentId) this.atlasDetailId.set(row.incomingDocumentId);
  }

  closeAtlasDetail(): void {
    this.atlasDetailId.set(null);
  }

  /** Detay penceresinden Yeniden Dene yapıldı. */
  afterAtlasChanged(): void {
    this.refresh();
  }

  // ---- Yeniden dene (yalnızca hatalı Atlas aktarımı) ----
  readonly retrying = signal<ReadonlySet<string>>(new Set());

  isRetrying(row: DigitizationTrackingItem): boolean {
    return this.retrying().has(row.scannedDocumentId);
  }

  retry(row: DigitizationTrackingItem, event?: Event): void {
    event?.stopPropagation();
    const userId = this.#common.user()?.id;
    if (!row.canRetryAtlasTransfer || !row.incomingDocumentId || !userId || this.isRetrying(row)) return;

    this.#setRetrying(row.scannedDocumentId, true);
    this.#atlasService.retry(row.incomingDocumentId, userId).subscribe({
      next: res => {
        this.#setRetrying(row.scannedDocumentId, false);
        this.#toast.showToast('Yeniden sıraya alındı', res?.message || 'Evrak yeniden Atlas aktarım sırasına alındı.', 'success');
        this.refresh();
      },
      error: err => {
        this.#setRetrying(row.scannedDocumentId, false);
        this.#toast.showToast('Yeniden sıraya alınamadı',
          incomingErrorMessage(err, 'Evrak yeniden Atlas aktarım sırasına alınamadı.'), 'error');
      }
    });
  }

  #setRetrying(id: string, on: boolean): void {
    this.retrying.update(set => {
      const next = new Set(set);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }

  // ---- Görüntüleme yardımcıları ----
  step(row: DigitizationTrackingItem, key: DigitizationStageKey): DigitizationStep {
    return row.steps[key];
  }

  /** QR aşaması barkod okunmadan (elle eşleştirmeyle) tamamlandıysa uyarı olarak gösterilir. */
  stepView(row: DigitizationTrackingItem, key: DigitizationStageKey): DigitizationStepStatus {
    return row.steps[key].status;
  }

  /** Barkod okunamadıysa (uyarı, hata değil) QR aşamasının başlığı buna göre değişir. */
  stageLabel(row: DigitizationTrackingItem, stage: StageDef): string {
    if (stage.key === 'qrRead' && row.steps.qrRead.status === 'warning') return 'QR kod okunamadı';
    if (stage.key === 'atlasDone' && row.steps.atlasDone.status === 'error') return 'Atlas aktarımı hatalı';
    return stage.label;
  }

  /** Satırın grubu; group alanını henüz dönmeyen backend için aşamalardan çıkarılır (kural backend'le aynı). */
  groupOf(row: DigitizationTrackingItem): DigitizationGroup {
    if (row.group) return row.group;
    if (!row.incomingDocumentId) return 'pending';
    if (row.steps.atlasDone.status === 'error') return 'error';
    if (row.steps.atlasDone.status === 'completed') return 'published';
    if (row.steps.publishing.status === 'processing') return 'publishing';
    return 'saved';
  }

  /**
   * Durum sütunu: satırın grubu. Bekleyende QR bilgisi ("QR kod okundu / okunamadı"; okunamadıysa uyarı, hata
   * değil), Kaydedilende evrak takibe aktarıldı mı kaydedildi mi yazar.
   */
  statusBadge(row: DigitizationTrackingItem): { label: string; icon: string; tone: string; spin: boolean; sub: string | null } {
    const group = this.groupOf(row);
    const def = GROUPS.find(g => g.key === group)!;
    const qr = STAGES[1];

    switch (group) {
      case 'pending': {
        const qrStatus = row.steps.qrRead.status;
        if (qrStatus === 'warning') return { label: this.stageLabel(row, qr), icon: 'warning', tone: 'warning', spin: false, sub: null };
        if (qrStatus === 'completed') return { label: qr.label, icon: qr.icon, tone: 'pending', spin: false, sub: null };
        return { label: def.badge, icon: def.icon, tone: 'pending', spin: false, sub: null };
      }
      case 'saved': {
        const stage = row.steps.saved.status === 'completed' ? STAGES[3] : STAGES[2];
        return { label: stage.label, icon: stage.icon, tone: 'saved', spin: false, sub: null };
      }
      case 'publishing': {
        const transferring = row.steps.publishing.note === 'Aktarılıyor';
        // Alt satır yok; aktarım sürüyorsa simge döner
        return { label: def.badge, icon: transferring ? 'sync' : def.icon, tone: 'publishing', spin: transferring, sub: null };
      }
      case 'published':
        return { label: def.badge, icon: def.icon, tone: 'completed', spin: false, sub: null };
      case 'error':
        return { label: def.badge, icon: def.icon, tone: 'error', spin: false, sub: 'Atlas aktarımı hatalı' };
    }
  }

  statCount(group: DigitizationGroup | ''): number {
    const stats = this.stats();
    return group ? stats[group] ?? 0 : stats.total;
  }

  /**
   * Aşama durum metni. Barkodu okunamayan taramada başlık ("QR kod okunamadı") yeterli; yalnızca sonradan
   * elle eşleştirildiyse bu yazılır, aksi halde boş döner.
   */
  stepStatusText(row: DigitizationTrackingItem, key: DigitizationStageKey): string {
    const status = row.steps[key].status;
    if (key === 'qrRead' && status === 'warning') {
      return row.documentNumber ? 'Elle eşleştirildi' : '';
    }
    return this.stepStatusLabel[status];
  }

  /** Satırın bulunduğu aşama: tabloda genel durumun altında gösterilir. */
  currentStageLabel(row: DigitizationTrackingItem): string {
    const stage = STAGES.find(s => s.key === row.currentStage);
    return stage ? this.stageLabel(row, stage) : '';
  }

  /**
   * Aşama notu. Barkod okunamadığında backend notu ("Barkod okunamadı, elle eşleştirme gerekli") başlık ve
   * durum metniyle aynı şeyi söyler; tekrar olmasın diye gösterilmez.
   */
  stepNote(row: DigitizationTrackingItem, key: DigitizationStageKey): string | null {
    const step = row.steps[key];
    if (key === 'qrRead' && step.status === 'warning') return null;
    return step.note;
  }

  /**
   * Ayrıntıdaki aşama notu: QR okundu ve Evrak takibe aktarıldı aşamalarının notu evrak numarasıdır; numara
   * ayrıntının alt şeridinde (Evrak no) zaten yazdığı için tekrarlanmaz. Yayın aşamasının notu
   * ("Aktarım sırasında" / "Aktarılıyor") durum metniyle aynı şeyi söylediği için gösterilmez.
   */
  detailNote(row: DigitizationTrackingItem, key: DigitizationStageKey): string | null {
    if (key === 'qrRead' || key === 'transferred' || key === 'publishing') return null;
    return this.stepNote(row, key);
  }

  stepTooltip(row: DigitizationTrackingItem, stage: StageDef): string {
    const step = row.steps[stage.key];
    const statusText = this.stepStatusText(row, stage.key);
    const parts = [statusText ? `${this.stageLabel(row, stage)}: ${statusText}` : this.stageLabel(row, stage)];
    if (step.date) parts.push(formatDate(step.date, 'dd.MM.yyyy HH:mm', this.#locale));
    const note = this.stepNote(row, stage.key);
    if (note) parts.push(note);
    return parts.join(' · ');
  }

  /** Ayrıntıdaki ilerleme: tamamlanan aşama sayısı (barkod uyarısı ve uygulanmayan aşama da geçilmiş sayılır). */
  progress(row: DigitizationTrackingItem): { done: number; total: number } {
    const done = STAGES.filter(s => ['completed', 'warning', 'skipped'].includes(row.steps[s.key].status)).length;
    return { done, total: STAGES.length };
  }

  /** Aşamanın, tarihi olan bir önceki aşamadan sonra ne kadar sürede gerçekleştiği ("+3 sa 5 dk"); 1 dk altı gösterilmez. */
  elapsedText(row: DigitizationTrackingItem, index: number): string | null {
    const current = row.steps[STAGES[index].key].date;
    if (!current) return null;
    let previous: string | null = null;
    for (let i = index - 1; i >= 0 && !previous; i--) previous = row.steps[STAGES[i].key].date;
    if (!previous) return null;

    const minutes = Math.floor((new Date(current).getTime() - new Date(previous).getTime()) / 60000);
    if (minutes < 1) return null;
    if (minutes < 60) return `+${minutes} dk`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return minutes % 60 ? `+${hours} sa ${minutes % 60} dk` : `+${hours} sa`;
    const days = Math.floor(hours / 24);
    return hours % 24 ? `+${days} gün ${hours % 24} sa` : `+${days} gün`;
  }

  /** Belge sütunundaki ad: uzantısız, en fazla 20 karakter ("…" ile); tam ad ipucunda kalır. */
  displayName(row: DigitizationTrackingItem): string {
    const name = row.documentName?.trim();
    if (!name) return '—';
    const base = name.replace(/\.[a-z0-9]{1,5}$/i, '') || name;
    return base.length > 20 ? `${base.slice(0, 20)}…` : base;
  }

  /**
   * Tarama hâlâ havuzdaysa (evraka bağlanmamış) Taranan Belgeler'de açılabilir. Sayfa yalnızca
   * "Gelen Evrak" rolüne açık; diğer kullanıcılarda numara düz metin kalır.
   */
  canOpenInPool(row: DigitizationTrackingItem): boolean {
    return !row.incomingDocumentId && this.canOpenPool;
  }

  /**
   * Barkod okunmuş olsun olmasın havuzdaki tarama Taranan Belgeler'de açılır. Anahtar depodaki dosya adıdır
   * (documentName özgün addır, havuzdaki adla aynı değildir). Okunan numara da gönderilir; dosya adı
   * eşleşmezse (ya da fileName dönmeyen eski backend'de) tarama numarasıyla bulunur.
   */
  openInPool(row: DigitizationTrackingItem, event?: Event): void {
    event?.stopPropagation();
    if (!this.canOpenInPool(row)) return;
    this.#router.navigate(['/scanneddocument'], {
      queryParams: {
        source: row.source,
        fileName: row.fileName || null,
        qrCode: row.qrCodes[0] || null
      }
    });
  }

  /** Evraka bağlanmış tarama: Evrak Kayıt evrak numarasıyla açılır (Taranan Belgeler'deki "Kaydet ve aç" ile aynı). */
  openRegistration(row: DigitizationTrackingItem, event?: Event): void {
    event?.stopPropagation();
    if (!row.documentNumber) return;
    this.#incomingDocumentService.setSelectedIncomingDocument(row.documentNumber);
    this.#incomingDocumentService.setIncomingDocumentUpdateType('2');
    this.#router.navigate(['/evrakkayit']);
  }

  /** Bağlanmış evrak no; havuzda bekleyen taramada okunan numaralar gösterilir. */
  numberText(row: DigitizationTrackingItem): string | null {
    return row.documentNumber || (row.qrCodes.length ? row.qrCodes.join(', ') : null);
  }
}
