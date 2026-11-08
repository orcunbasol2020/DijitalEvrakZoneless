import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ViewEncapsulation,
  computed,
  inject,
  output,
  signal
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FlexiToastService } from 'flexi-toast';
import { firstValueFrom } from 'rxjs';
import { RoleService } from '../../src/services/role-service';
import { ScannedDocumentService, scanPoolErrorMessage } from '../../src/services/scanneddocument';
import {
  ScanPoolImportInstance,
  ScanPoolImportStatus,
  ScanPoolInstanceState
} from '../../src/models/scan-pool-import-status.model';

/** Ekran açıkken durumun yenilenme aralığı (backend 15–30 sn öneriyor) */
const POLL_MS = 20_000;

type Overall = 'off' | 'ok' | 'error' | 'down';

const OVERALL: Record<Overall, { label: string; icon: string }> = {
  off: { label: 'Kapalı', icon: 'toggle_off' },
  ok: { label: 'Çalışıyor', icon: 'check_circle' },
  error: { label: 'Hata', icon: 'warning' },
  down: { label: 'Çalışmıyor', icon: 'error' }
};

const STATES: Record<ScanPoolInstanceState, { label: string; icon: string }> = {
  Running: { label: 'Tur sürüyor', icon: 'sync' },
  Idle: { label: 'Çalışıyor', icon: 'check_circle' },
  Error: { label: 'Hata', icon: 'warning' },
  Unresponsive: { label: 'Yanıt vermiyor', icon: 'error' },
  Stopped: { label: 'Kapandı', icon: 'power_settings_new' }
};

/** Hatalı da olsa ayakta olan pod'lar; Stopped ve Unresponsive canlı sayılmaz */
const LIVE_STATES = new Set<ScanPoolInstanceState>(['Running', 'Idle', 'Error']);

/**
 * Hatası süren pod: Error ya da önceki turu hatalı bitmiş, yeni turu sürmekte olan pod. Aksi halde
 * her tur hata verirken pod tur sırasında Running göründüğünden kart Çalışıyor / Hata arasında gidip gelir.
 */
function isFailing(item: ScanPoolImportInstance): boolean {
  return item.state === 'Error' || (item.state === 'Running' && item.lastRunSucceeded === false);
}

function time(iso: string | null): number {
  return iso ? new Date(iso).getTime() : NaN;
}

/** Alanı en yeni (ya da en eski) olan pod; alanı boş pod'lar atlanır */
function pick(list: ScanPoolImportInstance[], field: keyof ScanPoolImportInstance, newest = true): ScanPoolImportInstance | null {
  let best: ScanPoolImportInstance | null = null;
  for (const item of list) {
    const t = time(item[field] as string | null);
    if (isNaN(t)) continue;
    const bestTime = best ? time(best[field] as string | null) : NaN;
    if (!best || (newest ? t > bestTime : t < bestTime)) best = item;
  }
  return best;
}

/**
 * Taranan belgeleri arka planda önceden çeken servisin durum kartı (Tarama Klasörleri ekranının üstünde).
 * Durum pod başına DB'den gelir; özet satırı canlı pod'lardan, "Son başarılı" tüm pod'lardan hesaplanır.
 * "x sn önce" hesapları yanıttaki serverTimeUtc ile yapılır: sunucu ile tarayıcı saati arasındaki fark
 * yanıt geldiğinde bir kez ölçülür, sayaç bu farkla her saniye ilerler. Sekme arka plandayken sorgu yapılmaz.
 * Endpoint henüz yoksa (404, backend yayına çıkmadan) kart gizlenir.
 */
@Component({
  selector: 'app-scan-import-status-card',
  imports: [DatePipe],
  templateUrl: './scan-import-status-card.html',
  styleUrl: './scan-import-status-card.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ScanImportStatusCard {
  readonly #service = inject(ScannedDocumentService);
  readonly #toast = inject(FlexiToastService);

  /** "Şimdi çalıştır" ile belge alındığında; ekran kendi listesini yeniler */
  readonly imported = output<void>();

  /** Elle tur, Taranmış Evraklar penceresindeki "Şimdi kontrol et" gibi yalnızca Yönetici'ye açık */
  readonly canRunNow = inject(RoleService).has('Yönetici');

  readonly status = signal<ScanPoolImportStatus | null>(null);
  /** Durum alınamadıysa gösterilecek metin; eski durum varsa kartta kalır */
  readonly loadError = signal<string | null>(null);
  /** Endpoint yok (404): kart hiç gösterilmez */
  readonly unavailable = signal(false);
  readonly expanded = signal(false);
  readonly runningNow = signal(false);

  /** Sunucu saati − tarayıcı saati (ms) */
  #clockOffset = 0;
  /** Sunucu saatine göre şimdiki an; her saniye ilerler */
  readonly now = signal(Date.now());

  readonly overall = computed<Overall | null>(() => {
    const s = this.status();
    if (!s) return null;
    if (!s.enabled) return 'off';
    const live = this.live();
    if (live.some(i => !isFailing(i))) return 'ok';
    return live.length ? 'error' : 'down';
  });
  readonly overallInfo = computed(() => {
    const o = this.overall();
    return o ? OVERALL[o] : null;
  });

  readonly instances = computed(() => this.status()?.instances ?? []);
  readonly live = computed(() => this.instances().filter(i => LIVE_STATES.has(i.state)));
  /** Kart "Çalışıyor" derken hatalı olan canlı pod sayısı; aksi halde hata gözden kaçar */
  readonly erroredLiveCount = computed(() =>
    this.overall() === 'ok' ? this.live().filter(isFailing).length : 0);
  readonly isRunning = computed(() => this.live().some(i => i.state === 'Running'));

  /** Özet satırının pod'u: canlı pod'lar içinde son turu en yeni biten; canlı yoksa tüm pod'lar içinde */
  readonly lastRun = computed(() => {
    const live = this.live();
    return pick(live.length ? live : this.instances(), 'lastRunFinishedAtUtc');
  });
  /** Bekleyen canlı pod'lardan en erken sıradaki tur; tur süren pod'un nextRunAtUtc'si eskidir */
  readonly nextRunAt = computed(() =>
    pick(this.live().filter(i => i.state !== 'Running'), 'nextRunAtUtc', false)?.nextRunAtUtc ?? null);
  /** Deploy sonrası yeni pod'da henüz başarılı tur olmayabileceğinden kapanmış pod'lar da sayılır */
  readonly lastSuccessAt = computed(() => pick(this.instances(), 'lastSuccessAtUtc')?.lastSuccessAtUtc ?? null);
  /** Hata sürerken gösterilir */
  readonly showLastSuccess = computed(() => {
    const o = this.overall();
    return o === 'error' || o === 'down' || this.lastRun()?.lastRunSucceeded === false;
  });
  /** Kart "Hata" iken gösterilecek hata: son haber veren hatalı pod'unki */
  readonly errorText = computed(() => {
    if (this.overall() !== 'error') return null;
    return pick(this.live().filter(isFailing), 'lastSeenAtUtc')?.lastError ?? null;
  });

  constructor() {
    this.#load();
    const poll = setInterval(() => { if (!document.hidden) this.#load(); }, POLL_MS);
    const tick = setInterval(() => { if (!document.hidden) this.now.set(Date.now() + this.#clockOffset); }, 1000);
    const onVisible = () => { if (!document.hidden) this.#load(); };
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }

  async #load(): Promise<void> {
    if (this.unavailable()) return;
    try {
      const data = await firstValueFrom(this.#service.getScanPoolImportStatus());
      this.#clockOffset = new Date(data.serverTimeUtc).getTime() - Date.now();
      this.now.set(Date.now() + this.#clockOffset);
      this.status.set({ ...data, instances: data.instances ?? [] });
      this.loadError.set(null);
    } catch (err: any) {
      if (err?.status === 404) {
        this.unavailable.set(true);
        return;
      }
      const code = err?.status ? ` (${err.status})` : '';
      this.loadError.set(err?.status === 0 ? 'Sunucuya ulaşılamadı.' : `Durum alınamadı${code}.`);
    }
  }

  async runNow(): Promise<void> {
    if (this.runningNow()) return;
    this.runningNow.set(true);
    try {
      const result = await firstValueFrom(this.#service.importFromScanApi());
      this.#toast.showToast('Tur tamamlandı', result?.message || 'Tarama sistemi kontrol edildi.', 'success');
      this.imported.emit();
    } catch (err) {
      this.#toast.showToast('Hata', scanPoolErrorMessage(err, 'Tarama sistemi kontrol edilemedi.'), 'error');
    } finally {
      this.runningNow.set(false);
    }
  }

  stateInfo(state: ScanPoolInstanceState) {
    return STATES[state] ?? { label: state, icon: 'help' };
  }

  readonly isFailing = isFailing;

  isFaded(item: ScanPoolImportInstance): boolean {
    return !LIVE_STATES.has(item.state);
  }

  /** Sunucu saatine göre geçen süre */
  ago(iso: string | null): string {
    const t = time(iso);
    if (isNaN(t)) return '';
    const seconds = Math.max(0, Math.floor((this.now() - t) / 1000));
    if (seconds < 60) return `${seconds} sn önce`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} dk önce`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} saat önce`;
    return `${Math.floor(hours / 24)} gün önce`;
  }

  /** Sıradaki tur geçmişte kaldıysa (pod turu başlatmak üzere) saat yerine "birazdan" */
  isDue(iso: string | null): boolean {
    return time(iso) <= this.now();
  }
}
