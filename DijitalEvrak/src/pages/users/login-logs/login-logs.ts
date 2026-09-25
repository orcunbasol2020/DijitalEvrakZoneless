import { ChangeDetectionStrategy, Component, computed, signal, ViewEncapsulation } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import GenericModel from '../../../../components/generic-model/generic-model';

/** GET api/UserLoginLogs/GetAll satırı */
export interface LoginLogRow {
  id?: string;
  userId?: string | null;
  userName: string;
  fullName?: string | null;
  departmentName?: string | null;
  isSuccess: boolean;
  failureReason?: string | null;
  failureReasonText?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** UTC */
  loginDate: string;
}

export interface PagedResultDto<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}

type ResultFilter = 'all' | 'success' | 'fail';

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

/** Tarayıcı / işletim sistemi bilgisini userAgent'tan kısa bir etikete indirger. */
function describeUserAgent(ua: string | null | undefined): { browser: string; os: string } {
  const s = ua ?? '';
  if (!s) return { browser: '-', os: '' };

  let browser = 'Diğer';
  if (/Edg\//i.test(s)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(s)) browser = 'Opera';
  else if (/Firefox\//i.test(s)) browser = 'Firefox';
  else if (/Chrome\//i.test(s)) browser = 'Chrome';
  else if (/Safari\//i.test(s) && /Version\//i.test(s)) browser = 'Safari';
  else if (/MSIE|Trident\//i.test(s)) browser = 'Internet Explorer';

  let os = '';
  if (/Windows NT/i.test(s)) os = 'Windows';
  else if (/Android/i.test(s)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(s)) os = 'iOS';
  else if (/Mac OS X/i.test(s)) os = 'macOS';
  else if (/Linux/i.test(s)) os = 'Linux';

  return { browser, os };
}

@Component({
  imports: [GenericModel, FormsModule, DatePipe],
  templateUrl: './login-logs.html',
  // Roller / Zimmetlerim ekranlarıyla aynı görsel dil: kart iskeleti (st-*),
  // boş durum (sp-*) ve tablo / istatistik / sayfalama (zl-*) setleri paylaşılır.
  styleUrls: [
    '../../settings/settings.css',
    '../../support/support.css',
    '../../zimmetlerim/zimmetlerim.css',
    './login-logs.css'
  ],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class LoginLogs {
  readonly pageSizeOptions = PAGE_SIZE_OPTIONS;

  // ---- Filtreler (sunucu tarafında uygulanır) ----
  readonly userNameInput = signal('');
  /** Yazarken her tuşta istek atmamak için gecikmeli kopya */
  readonly userName = signal('');
  readonly resultFilter = signal<ResultFilter>('all');
  readonly startDate = signal('');
  readonly endDate = signal('');
  readonly pageSize = signal<number>(50);
  readonly currentPage = signal(1);

  #userNameTimer: ReturnType<typeof setTimeout> | undefined;

  readonly isFiltering = computed(() =>
    !!this.userName().trim() || this.resultFilter() !== 'all' || !!this.startDate() || !!this.endDate());

  /** Sonuç filtresi hariç ortak sorgu parçası; sayım kaynakları da bunu kullanır. */
  readonly #baseQuery = computed(() => {
    const p = new URLSearchParams();
    const name = this.userName().trim();
    if (name) p.set('userName', name);
    if (this.startDate()) p.set('startDate', this.startDate());
    if (this.endDate()) p.set('endDate', this.endDate());
    return p;
  });

  #buildUrl(extra: Record<string, string>): string {
    const p = new URLSearchParams(this.#baseQuery());
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    return `api/UserLoginLogs/GetAll?${p.toString()}`;
  }

  // ---- Liste ----
  readonly result = httpResource<PagedResultDto<LoginLogRow>>(() => {
    const filter = this.resultFilter();
    return this.#buildUrl({
      isSuccess: filter === 'all' ? '' : String(filter === 'success'),
      page: String(this.currentPage()),
      pageSize: String(this.pageSize())
    });
  });

  // Not: hata durumundaki bir resource'ta value() istisna fırlatır; önce hasValue() ile bakılır.
  readonly rows = computed(() => this.result.hasValue() ? (this.result.value().items ?? []) : []);
  readonly totalCount = computed(() => this.result.hasValue() ? (this.result.value().totalCount ?? 0) : 0);
  readonly loading = computed(() => this.result.isLoading());
  readonly error = computed(() => this.result.error());

  // ---- İstatistik kutuları: başarılı / başarısız sayıları (pageSize=1 ile sadece totalCount alınır) ----
  readonly #successCount = httpResource<PagedResultDto<LoginLogRow>>(() =>
    this.#buildUrl({ isSuccess: 'true', page: '1', pageSize: '1' }));
  readonly #failCount = httpResource<PagedResultDto<LoginLogRow>>(() =>
    this.#buildUrl({ isSuccess: 'false', page: '1', pageSize: '1' }));

  readonly successCount = computed(() =>
    this.#successCount.hasValue() ? (this.#successCount.value().totalCount ?? 0) : 0);
  readonly failCount = computed(() =>
    this.#failCount.hasValue() ? (this.#failCount.value().totalCount ?? 0) : 0);
  readonly allCount = computed(() => this.successCount() + this.failCount());

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
  setUserName(value: string): void {
    this.userNameInput.set(value);
    clearTimeout(this.#userNameTimer);
    this.#userNameTimer = setTimeout(() => {
      this.userName.set(value);
      this.currentPage.set(1);
    }, 350);
  }

  clearUserName(): void {
    clearTimeout(this.#userNameTimer);
    this.userNameInput.set('');
    this.userName.set('');
    this.currentPage.set(1);
  }

  setResultFilter(value: ResultFilter): void {
    this.resultFilter.set(value);
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
    clearTimeout(this.#userNameTimer);
    this.userNameInput.set('');
    this.userName.set('');
    this.resultFilter.set('all');
    this.startDate.set('');
    this.endDate.set('');
    this.currentPage.set(1);
  }

  refresh(): void {
    this.result.reload();
    this.#successCount.reload();
    this.#failCount.reload();
  }

  // ---- Görüntüleme yardımcıları ----
  /** Backend UTC verir; saat dilimi eki yoksa ekleyerek yerel saate doğru çevrilmesini sağlar. */
  toLocalDate(value: string): string {
    if (!value) return value;
    return /Z|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`;
  }

  browserOf(row: LoginLogRow): string {
    return describeUserAgent(row.userAgent).browser;
  }

  osOf(row: LoginLogRow): string {
    return describeUserAgent(row.userAgent).os;
  }

  initialsOf(row: LoginLogRow): string {
    const source = (row.fullName ?? row.userName ?? '').trim();
    if (!source) return '?';
    const parts = source.split(/\s+/);
    const first = parts[0]?.charAt(0) ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return `${first}${last}`.toLocaleUpperCase('tr');
  }
}
