import { ChangeDetectionStrategy, Component, computed, inject, Injectable, signal, ViewEncapsulation } from '@angular/core';
import { RoleService } from '../../../services/role-service';

export type HomeDashboard = 'admin' | 'gelen-evrak' | 'on-kayit' | 'birim-yonetici' | 'birim';

const DASHBOARD_TITLES: Record<HomeDashboard, string> = {
  'admin': 'Yönetici Paneli',
  'gelen-evrak': 'Gelen Evrak Paneli',
  'on-kayit': 'Misyon Paneli',
  'birim-yonetici': 'Birim Yönetici Paneli',
  'birim': 'Birim Evrak Paneli',
};

/**
 * Ana sayfa panelinin rol önceliği: ilk eşleşen rolün paneli açılışta gösterilir,
 * kullanıcının diğer rollerinin panellerine başlıktaki okla geçilir.
 * Giden Evrak'ın henüz paneli yok; bu yüzden listede yer almaz.
 * Ön Kayıt, Gelen Evrak ile aynı paneli görür; iki rol birlikteyse panel bir kez sayılır.
 * İki birim rolü birlikte verilmişse yalnızca yönetici paneli gösterilir.
 */
const DASHBOARD_PRIORITY: [role: string, dashboard: HomeDashboard][] = [
  ['Yönetici', 'admin'],
  ['Gelen Evrak', 'gelen-evrak'],
  ['Ön Kayıt', 'gelen-evrak'],
  ['Misyon', 'on-kayit'],
  ['Birim Yöneticisi', 'birim-yonetici'],
  ['Birim Evrak Sorumlusu', 'birim'],
];

/** Ana sayfada kullanıcının görebildiği paneller ve o an gösterilen panel; Home bileşeni sağlar. */
@Injectable()
export class HomeDashboards {
  readonly #roles = inject(RoleService);

  readonly list: HomeDashboard[] = [...new Set(
    DASHBOARD_PRIORITY
      .filter(([role]) => this.#roles.has(role))
      .map(([, dashboard]) => dashboard)
      .filter((d, _, all) => !(d === 'birim' && all.includes('birim-yonetici')))
  )];

  /** Seçilen panel kullanıcı başına bu tarayıcıda saklanır; aynı bilgisayarı kullanan başka kullanıcıyı etkilemez. */
  readonly #storageKey = `home-dashboard:${storedUserKey()}`;

  /** Saklanan panel kullanıcının artık erişemediği bir panelse öncelikli panelle açılır. */
  readonly #index = signal(Math.max(0, this.list.indexOf(readStored(this.#storageKey) as HomeDashboard)));
  readonly active = computed<HomeDashboard | null>(() => this.list[this.#index()] ?? null);
  readonly nextTitle = computed(() => DASHBOARD_TITLES[this.list[(this.#index() + 1) % this.list.length]]);

  next(): void {
    this.#index.update(i => (i + 1) % this.list.length);
    try { localStorage.setItem(this.#storageKey, this.list[this.#index()]); } catch { /* depolama kapalıysa seçim kaydedilmez */ }
  }
}

function readStored(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

/** Oturumdaki kullanıcının kimliği (RoleService ile aynı kaynaktan); okunamazsa boş döner. */
function storedUserKey(): string {
  try {
    const user = JSON.parse(localStorage.getItem('user') ?? sessionStorage.getItem('user') ?? '{}');
    return String(user.id ?? user.userName ?? '');
  } catch {
    return '';
  }
}

/** Panel üst şeridinin en sağındaki geçiş oku; kullanıcının birden fazla paneli yoksa görünmez. */
@Component({
  selector: 'app-dashboard-switch',
  template: `
    @if (dashboards && dashboards.list.length > 1) {
      <button type="button" class="ad-hero-switch" (click)="dashboards.next()"
        [title]="'Sonraki panel: ' + dashboards.nextTitle()" [attr.aria-label]="'Sonraki panel: ' + dashboards.nextTitle()">
        <span class="material-symbols-outlined">chevron_right</span>
      </button>
    }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class DashboardSwitch {
  /** Panel ana sayfa dışında kullanıldığında sağlayıcı yoktur; ok gösterilmez. */
  readonly dashboards = inject(HomeDashboards, { optional: true });
}
