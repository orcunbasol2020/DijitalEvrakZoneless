import { ChangeDetectionStrategy, Component, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Common } from '../../../services/common';
import { LoginLogRow, PagedResultDto } from '../../users/login-logs/login-logs';

/** Kart kapatıldığında bu oturum boyunca (sekme kapanana kadar) bir daha gösterilmez. */
const DISMISS_KEY = 'recentLoginsDismissed';
const SHOWN_COUNT = 5;

/** userAgent'tan kısa tarayıcı / işletim sistemi etiketi */
function describeUserAgent(ua: string | null | undefined): string {
  const s = ua ?? '';
  if (!s) return '-';

  let browser = 'Diğer';
  if (/Edg\//i.test(s)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(s)) browser = 'Opera';
  else if (/Firefox\//i.test(s)) browser = 'Firefox';
  else if (/Chrome\//i.test(s)) browser = 'Chrome';
  else if (/Safari\//i.test(s) && /Version\//i.test(s)) browser = 'Safari';

  let os = '';
  if (/Windows NT/i.test(s)) os = 'Windows';
  else if (/Android/i.test(s)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(s)) os = 'iOS';
  else if (/Mac OS X/i.test(s)) os = 'macOS';
  else if (/Linux/i.test(s)) os = 'Linux';

  return os ? `${browser} · ${os}` : browser;
}

function readDismissed(): boolean {
  try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}

@Component({
  selector: 'app-recent-logins',
  imports: [DatePipe],
  templateUrl: './recent-logins.html',
  styleUrl: './recent-logins.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecentLogins {
  readonly #common = inject(Common);

  readonly dismissed = signal(readDismissed());

  readonly #userId = computed(() => this.#common.user()?.id ?? null);

  /** Son SHOWN_COUNT + 1 kayıt: en yenisi bu oturumun kendi girişi olduğu için atlanır. */
  readonly #result = httpResource<PagedResultDto<LoginLogRow>>(() => {
    const id = this.#userId();
    if (!id || this.dismissed()) return undefined;
    return `api/UserLoginLogs/GetAll?userId=${encodeURIComponent(id)}&page=1&pageSize=${SHOWN_COUNT + 1}`;
  });

  readonly rows = computed<LoginLogRow[]>(() => {
    if (!this.#result.hasValue()) return [];
    const items = this.#result.value().items ?? [];
    // En yeni kayıt başarılıysa şu anki giriştir; onu listeden düş.
    const rest = items.length && items[0].isSuccess ? items.slice(1) : items;
    return rest.slice(0, SHOWN_COUNT);
  });

  readonly failedCount = computed(() => this.rows().filter(r => !r.isSuccess).length);
  readonly hasFailure = computed(() => this.failedCount() > 0);

  /** Veri yoksa ya da hata varsa kart hiç görünmez; kullanıcıya boş kart göstermeye gerek yok. */
  readonly visible = computed(() =>
    !this.dismissed() && this.#result.hasValue() && this.rows().length > 0);

  dismiss(): void {
    this.dismissed.set(true);
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* özel pencere vb. */ }
  }

  toLocalDate(value: string): string {
    if (!value) return value;
    return /Z|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`;
  }

  agentOf(row: LoginLogRow): string {
    return describeUserAgent(row.userAgent);
  }
}
