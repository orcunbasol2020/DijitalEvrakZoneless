import { ChangeDetectionStrategy, Component, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { httpResource, HttpErrorResponse } from '@angular/common/http';
import { Clipboard } from '@angular/cdk/clipboard';
import { FlexiToastService } from 'flexi-toast';
import GenericModel from '../../../components/generic-model/generic-model';
import { PagedResultDto } from '../users/login-logs/login-logs';

/**
 * GET api/ErrorLogs/GetAll satırı. Aynı hata tekrarladığında yeni satır açılmaz; sayaç artar,
 * son oluşma zamanı ve son karşılaşan kullanıcı güncellenir.
 */
export interface ErrorLog {
  id: string;
  /** İlk oluşma, UTC, ISO */
  timeStamp: string;
  /** Son oluşma, UTC, ISO; liste buna göre yeniden eskiye sıralı gelir */
  lastOccurredAt: string;
  occurrenceCount: number;
  requestMethod: string | null;
  requestPath: string | null;
  isBackground: boolean;
  /** Son karşılaşan: kullanıcı Id'si, Windows hesap adı, 'system' ya da null */
  userId: string | null;
  userFullName: string | null;
  summary: string | null;
}

/** GET api/ErrorLogs/GetById */
export interface ErrorLogDetail extends ErrorLog {
  errorMessage: string | null;
  stackTrace: string | null;
}

type TypeFilter = 'all' | 'request' | 'background';

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

/** Arka plan servislerinin kayıt kaynakları; Kaynak / Yol süzgecinde öneri olarak listelenir. */
const BACKGROUND_SOURCES = ['AtlasTransfer', 'AtlasDocumentNumberPool', 'ScannedDocumentImport', 'ZimmetApprovalReminder'];

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
  imports: [GenericModel, FormsModule, DatePipe],
  templateUrl: './error-logs.html',
  // Giriş Kayıtları ile aynı görsel dil: kart (st-*), boş durum (sp-*), tablo / sayfalama (zl-*)
  // ve filtre şeridi (ll-*) setleri paylaşılır; burada yalnızca "el-" sınıfları var.
  styleUrls: [
    '../settings/settings.css',
    '../support/support.css',
    '../zimmetlerim/zimmetlerim.css',
    '../users/login-logs/login-logs.css',
    './error-logs.css'
  ],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closeDetail()' }
})
export default class ErrorLogs {
  readonly #clipboard = inject(Clipboard);
  readonly #toast = inject(FlexiToastService);

  readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  readonly backgroundSources = BACKGROUND_SOURCES;
  readonly today = todayIso();

  // ---- Filtreler (sunucu tarafında uygulanır) ----
  readonly typeFilter = signal<TypeFilter>('all');
  readonly sourceInput = signal('');
  readonly source = signal('');
  readonly searchInput = signal('');
  readonly search = signal('');
  /** Tablodaki kullanıcıya tıklanınca dolar; birebir eşleşir. */
  readonly userFilter = signal<{ id: string; label: string } | null>(null);
  readonly startDate = signal('');
  readonly endDate = signal('');
  readonly pageSize = signal<number>(50);
  readonly currentPage = signal(1);

  #sourceTimer: ReturnType<typeof setTimeout> | undefined;
  #searchTimer: ReturnType<typeof setTimeout> | undefined;

  readonly isFiltering = computed(() =>
    this.typeFilter() !== 'all' || !!this.source().trim() || !!this.search().trim()
    || !!this.userFilter() || !!this.startDate() || !!this.endDate());

  readonly rangeError = computed(() => {
    const start = this.startDate();
    const end = this.endDate();
    return start && end && end < start ? 'Bitiş tarihi başlangıç tarihinden önce olamaz.' : null;
  });

  // ---- Liste ----
  readonly result = httpResource<PagedResultDto<ErrorLog>>(() => {
    if (this.rangeError()) return undefined;
    const p = new URLSearchParams();
    const type = this.typeFilter();
    if (type !== 'all') p.set('isBackground', String(type === 'background'));
    const source = this.source().trim();
    if (source) p.set('source', source);
    const search = this.search().trim();
    if (search) p.set('search', search);
    const user = this.userFilter();
    if (user) p.set('userId', user.id);
    // Tarihler UTC'dir: seçilen günler yerel gece yarısına göre gönderilir, bitiş hariç tutulduğu
    // için bir sonraki günün başlangıcı verilir.
    if (this.startDate()) p.set('startDate', localDayStartIso(this.startDate()));
    if (this.endDate()) p.set('endDate', localDayStartIso(this.endDate(), 1));
    p.set('page', String(this.currentPage()));
    p.set('pageSize', String(this.pageSize()));
    return `api/ErrorLogs/GetAll?${p.toString()}`;
  });

  // Not: hata durumundaki bir resource'ta value() istisna fırlatır; önce hasValue() ile bakılır.
  readonly rows = computed(() => this.result.hasValue() ? (this.result.value().items ?? []) : []);
  readonly totalCount = computed(() => this.result.hasValue() ? (this.result.value().totalCount ?? 0) : 0);
  readonly loading = computed(() => this.result.isLoading());
  readonly error = computed(() => this.result.error());

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
  }

  setPageSize(value: number | string): void {
    this.pageSize.set(Number(value));
    this.currentPage.set(1);
  }

  // ---- Filtre değişimleri ----
  setTypeFilter(value: TypeFilter): void {
    this.typeFilter.set(value);
    this.currentPage.set(1);
  }

  /** Yazarken her tuşta istek atmamak için 400 ms beklenir. */
  setSource(value: string): void {
    this.sourceInput.set(value);
    clearTimeout(this.#sourceTimer);
    this.#sourceTimer = setTimeout(() => {
      this.source.set(value);
      this.currentPage.set(1);
    }, 400);
  }

  setSearch(value: string): void {
    this.searchInput.set(value);
    clearTimeout(this.#searchTimer);
    this.#searchTimer = setTimeout(() => {
      this.search.set(value);
      this.currentPage.set(1);
    }, 400);
  }

  clearSource(): void {
    clearTimeout(this.#sourceTimer);
    this.sourceInput.set('');
    this.source.set('');
    this.currentPage.set(1);
  }

  clearSearch(): void {
    clearTimeout(this.#searchTimer);
    this.searchInput.set('');
    this.search.set('');
    this.currentPage.set(1);
  }

  filterByUser(row: ErrorLog, event?: Event): void {
    event?.stopPropagation();
    if (!row.userId) return;
    this.userFilter.set({ id: row.userId, label: this.userLabel(row) });
    this.currentPage.set(1);
  }

  clearUser(): void {
    this.userFilter.set(null);
    this.currentPage.set(1);
  }

  setStartDate(value: string): void {
    this.startDate.set(value ?? '');
    this.currentPage.set(1);
  }

  setEndDate(value: string): void {
    this.endDate.set(value ?? '');
    this.currentPage.set(1);
  }

  clearFilters(): void {
    clearTimeout(this.#sourceTimer);
    clearTimeout(this.#searchTimer);
    this.typeFilter.set('all');
    this.sourceInput.set('');
    this.source.set('');
    this.searchInput.set('');
    this.search.set('');
    this.userFilter.set(null);
    this.startDate.set('');
    this.endDate.set('');
    this.currentPage.set(1);
  }

  refresh(): void {
    this.result.reload();
  }

  // ---- Detay penceresi ----
  readonly selectedId = signal<string | null>(null);

  readonly detail = httpResource<ErrorLogDetail>(() => {
    const id = this.selectedId();
    return id ? { url: 'api/ErrorLogs/GetById', params: { id } } : undefined;
  });

  readonly detailValue = computed(() => this.detail.hasValue() ? this.detail.value() : null);
  readonly detailNotFound = computed(() => (this.detail.error() as HttpErrorResponse | undefined)?.status === 404);

  openDetail(row: ErrorLog): void {
    this.selectedId.set(row.id);
  }

  closeDetail(): void {
    this.selectedId.set(null);
  }

  /** Hata bildirirken geliştiriciye iletmek için tam hata metni kopyalanır. */
  copyError(): void {
    const text = this.detailValue()?.errorMessage;
    if (!text) return;
    if (this.#clipboard.copy(text)) {
      this.#toast.showToast('Kopyalandı', 'Hata metni panoya kopyalandı', 'success');
    } else {
      this.#toast.showToast('Uyarı', 'Hata metni kopyalanamadı', 'warning');
    }
  }

  // ---- Görüntüleme yardımcıları ----
  /** Backend UTC verir; saat dilimi eki yoksa ekleyerek yerel saate doğru çevrilmesini sağlar. */
  toLocalDate(value: string): string {
    if (!value) return value;
    return /Z|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`;
  }

  userLabel(row: ErrorLog): string {
    if (row.userId === 'system') return 'Sistem';
    return row.userFullName || row.userId || '—';
  }
}
