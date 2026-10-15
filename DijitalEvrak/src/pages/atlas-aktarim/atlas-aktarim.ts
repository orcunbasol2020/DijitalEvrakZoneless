import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, ViewEncapsulation, WritableSignal, computed, inject, signal } from '@angular/core';
import { DatePipe, DOCUMENT } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FlexiToastService } from 'flexi-toast';
import { Observable, Subscription } from 'rxjs';
import GenericModel from '../../../components/generic-model/generic-model';
import { AtlasTransferDetail } from '../../../components/atlas-transfer-detail/atlas-transfer-detail';
import {
  AtlasTransferAttempt,
  AtlasTransferCheck,
  AtlasTransferFailure,
  AtlasTransferQueueItem,
  AtlasTransferService,
  AtlasTransferStatus,
  attemptOutcome,
  utc
} from '../../services/atlas-transfer';
import { incomingErrorMessage } from '../../services/incomingdocument';
import { Common } from '../../services/common';

type TransferTab = 'sirada' | 'hatali' | 'denemeler';

const TABS: TransferTab[] = ['sirada', 'hatali', 'denemeler'];

// Sayfa açıkken durum yoklaması; tur çalışırken daha sık
const POLL_MS = 15_000;
const POLL_RUNNING_MS = 5_000;

// Son Denemeler'de "Daha fazla" ile sırayla açılan kayıt sayıları (backend en fazla 500)
const ATTEMPT_LIMITS = [50, 100, 200, 500];

// Bunlardan biri kırmızıysa aktarım çalışmaz ya da paket hazırlanamaz; diğerleri bilgi amaçlı
const CRITICAL_CHECKS = new Set(['Recipient', 'PhysicalDeliveryPdf']);

const DETAILS_STORAGE_KEY = 'atlasAktarim.detailsOpen';

function readDetailsOpen(): boolean {
  try { return localStorage.getItem(DETAILS_STORAGE_KEY) === '1'; } catch { return false; }
}

/** Liste sekmesinin durumu; her sekme ayrı yüklenir ve kendi hata/boş durumunu gösterir. */
interface TabState<T> {
  rows: T[];
  loading: boolean;
  error: string | null;
  loaded: boolean;
}

const emptyTab = <T>(): TabState<T> => ({ rows: [], loading: false, error: null, loaded: false });

/**
 * Atlas Aktarım: yayınlanan gelen evrakların EYP paketi olarak Atlas'a aktarımını izleme ve
 * müdahale ekranı (yalnızca yönetici). Üstte tek satırlık servis özeti (ayrıntılar aç/kapa) ve
 * kritik ön koşul uyarıları (GetStatus, yoklanır); altında sekme işlevi gören sayı kartları
 * (Sırada / Hatalı / Yayınlandı → Son Denemeler) ve seçili liste (açılınca ve işlemlerden sonra
 * yüklenir). Evrak numarasına tıklanınca aktarım detayı penceresi açılır.
 */
@Component({
  imports: [GenericModel, DatePipe, AtlasTransferDetail],
  templateUrl: './atlas-aktarim.html',
  // Üst şerit ve sayı kartları (ad-*) Kontrol Paneli ile, rozet ve durumlar (aa-*) aktarım detayıyla ortak
  styleUrls: [
    '../home/dashboard.css',
    '../../../components/atlas-transfer-detail/atlas-transfer-detail.css',
    './atlas-aktarim.css'
  ],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class AtlasAktarim implements OnInit {
  readonly #service = inject(AtlasTransferService);
  readonly #toast = inject(FlexiToastService);
  readonly #common = inject(Common);
  readonly #route = inject(ActivatedRoute);
  readonly #router = inject(Router);
  readonly #document = inject(DOCUMENT);
  readonly #destroyRef = inject(DestroyRef);

  readonly utc = utc;
  readonly outcome = attemptOutcome;

  // ---- Durum (GetStatus) ----
  readonly status = signal<AtlasTransferStatus | null>(null);
  readonly statusLoading = signal(false);
  readonly statusError = signal<string | null>(null);
  readonly lastUpdated = signal<Date | null>(null);

  readonly counts = computed(() => this.status()?.counts ?? null);
  readonly queueCount = computed(() => {
    const c = this.counts();
    return c ? c.queued + c.transferring : null;
  });
  readonly failedChecks = computed(() =>
    (this.status()?.checks ?? []).filter(c => !c.ok && CRITICAL_CHECKS.has(c.code)));
  /** Kritik olmayan başarısız kontroller; kritikler zaten üstte uyarı olarak görünür */
  readonly checkWarnings = computed(() =>
    (this.status()?.checks ?? []).filter(c => !c.ok && !CRITICAL_CHECKS.has(c.code)).length);

  // Servis ayrıntıları paneli; seçim tarayıcıda hatırlanır
  readonly detailsOpen = signal(readDetailsOpen());

  toggleDetails(): void {
    this.detailsOpen.update(open => !open);
    try { localStorage.setItem(DETAILS_STORAGE_KEY, this.detailsOpen() ? '1' : '0'); } catch { /* depolama kapalı */ }
  }

  /** Son turun mesaj tonu: hata kırmızı, iş yapmayan tur gri. */
  readonly lastRunTone = computed(() => {
    const run = this.status()?.lastRun;
    if (!run) return 'muted';
    if (run.error || !run.result) return 'error';
    if (!run.result.ran) return 'muted';
    return run.result.failed > 0 ? 'warn' : 'ok';
  });

  // ---- Sekmeler ----
  readonly tab = signal<TransferTab>('sirada');
  readonly queue = signal<TabState<AtlasTransferQueueItem>>(emptyTab());
  readonly failed = signal<TabState<AtlasTransferFailure>>(emptyTab());
  readonly attempts = signal<TabState<AtlasTransferAttempt>>(emptyTab());
  readonly attemptLimit = signal(ATTEMPT_LIMITS[0]);
  readonly canLoadMoreAttempts = computed(() =>
    this.attemptLimit() < ATTEMPT_LIMITS[ATTEMPT_LIMITS.length - 1]
    && this.attempts().rows.length >= this.attemptLimit());

  // ---- İşlemler ----
  readonly running = signal(false);
  // Yeniden sıraya alınmakta olan evraklar; istek sürerken satırın butonu pasiftir
  readonly retrying = signal<ReadonlySet<string>>(new Set());

  // Evrak aktarım detayı ve "Nasıl çalışır?" pencereleri
  readonly selectedDocumentId = signal<string | null>(null);
  readonly infoOpen = signal(false);

  #pollTimer?: ReturnType<typeof setTimeout>;
  #statusSub?: Subscription;
  readonly #tabSubs = new Map<TransferTab, Subscription>();

  ngOnInit(): void {
    const requested = this.#route.snapshot.queryParamMap.get('tab') as TransferTab | null;
    if (requested && TABS.includes(requested)) this.tab.set(requested);

    // Tarayıcı sekmesi arka plandayken yoklama durur, öne gelince hemen yenilenir
    const onVisibility = () => {
      if (this.#document.visibilityState === 'hidden') this.#stopPolling();
      else this.loadStatus();
    };
    this.#document.addEventListener('visibilitychange', onVisibility);
    this.#destroyRef.onDestroy(() => {
      this.#document.removeEventListener('visibilitychange', onVisibility);
      this.#stopPolling();
      this.#statusSub?.unsubscribe();
      this.#tabSubs.forEach(s => s.unsubscribe());
    });

    this.loadStatus();
    this.loadTab(this.tab());
  }

  // ---------- Durum ve yoklama ----------

  loadStatus(): void {
    this.#stopPolling();
    this.#statusSub?.unsubscribe();
    this.statusLoading.set(true);
    this.#statusSub = this.#service.getStatus().subscribe({
      next: s => {
        const wasRunning = this.status()?.isRunning ?? false;
        this.status.set(s);
        this.statusError.set(null);
        this.statusLoading.set(false);
        this.lastUpdated.set(new Date());
        // Arka plandaki tur bitti: açık sekmedeki liste de değişmiş olabilir
        if (wasRunning && !s.isRunning) this.loadTab(this.tab());
        this.#schedulePoll();
      },
      error: err => {
        this.statusError.set(incomingErrorMessage(err, 'Aktarım durumu alınamadı.'));
        this.statusLoading.set(false);
        this.#schedulePoll();
      }
    });
  }

  #schedulePoll(): void {
    this.#stopPolling();
    if (this.#document.visibilityState === 'hidden') return;
    const delay = this.status()?.isRunning ? POLL_RUNNING_MS : POLL_MS;
    this.#pollTimer = setTimeout(() => this.loadStatus(), delay);
  }

  #stopPolling(): void {
    if (this.#pollTimer) clearTimeout(this.#pollTimer);
    this.#pollTimer = undefined;
  }

  /** Sağ üstteki Yenile: durum ve açık sekme. */
  refresh(): void {
    this.loadStatus();
    this.loadTab(this.tab());
  }

  checkTone(check: AtlasTransferCheck): string {
    if (check.ok) return 'ok';
    if (CRITICAL_CHECKS.has(check.code)) return 'error';
    return check.code === 'AtlasDelivery' ? 'warn' : 'muted';
  }

  checkIcon(check: AtlasTransferCheck): string {
    if (check.ok) return 'check_circle';
    return CRITICAL_CHECKS.has(check.code) ? 'cancel' : check.code === 'AtlasDelivery' ? 'warning' : 'info';
  }

  // ---------- Sekmeler ----------

  selectTab(tab: TransferTab): void {
    if (this.tab() !== tab) {
      this.tab.set(tab);
      // Bağlantı paylaşılabilsin ve geri tuşu sekmeyi korusun
      this.#router.navigate([], { relativeTo: this.#route, queryParams: { tab }, replaceUrl: true });
    }
    this.loadTab(tab);
  }

  loadTab(tab: TransferTab): void {
    this.#tabSubs.get(tab)?.unsubscribe();
    switch (tab) {
      case 'sirada':
        this.#tabSubs.set(tab, this.#fill(this.queue, this.#service.getQueue(), 'Sıradaki evraklar alınamadı.'));
        break;
      case 'hatali':
        this.#tabSubs.set(tab, this.#fill(this.failed, this.#service.getFailed(), 'Hatalı evraklar alınamadı.'));
        break;
      case 'denemeler':
        this.#tabSubs.set(tab, this.#fill(this.attempts, this.#service.getAttempts(this.attemptLimit()),
          'Son denemeler alınamadı.'));
        break;
    }
  }

  #fill<T>(target: WritableSignal<TabState<T>>, source: Observable<T[]>, fallback: string): Subscription {
    target.update(s => ({ ...s, loading: true, error: null }));
    return source.subscribe({
      next: rows => target.set({ rows: rows ?? [], loading: false, error: null, loaded: true }),
      error: err => target.update(s => ({ ...s, loading: false, error: incomingErrorMessage(err, fallback) }))
    });
  }

  loadMoreAttempts(): void {
    const next = ATTEMPT_LIMITS.find(l => l > this.attemptLimit());
    if (!next) return;
    this.attemptLimit.set(next);
    this.loadTab('denemeler');
  }

  // ---------- İşlemler ----------

  /** Bir tur çalıştırır (otomatik aktarım kapalı olsa da). Tur bitene kadar cevap gelmez. */
  run(): void {
    if (this.running()) return;
    this.running.set(true);
    this.#service.run().subscribe({
      next: r => {
        this.running.set(false);
        // ran: false hata değildir (ör. "zaten çalışıyor", alıcı kurum tanımsız); bilgi olarak gösterilir
        const tone = !r.ran ? 'info' : r.failed > 0 ? 'warning' : 'success';
        this.#toast.showToast('Atlas aktarımı', r.message || 'Tur tamamlandı.', tone);
        this.refresh();
      },
      error: err => {
        this.running.set(false);
        this.#toast.showToast('Atlas aktarımı çalıştırılamadı',
          incomingErrorMessage(err, 'Aktarım turu çalıştırılamadı.'), 'error');
        this.loadStatus();
      }
    });
  }

  isRetrying(documentId: string): boolean {
    return this.retrying().has(documentId);
  }

  retry(row: AtlasTransferFailure): void {
    const userId = this.#common.user()?.id;
    if (!userId || this.isRetrying(row.documentId)) return;

    this.#setRetrying(row.documentId, true);
    this.#service.retry(row.documentId, userId).subscribe({
      next: res => {
        this.#setRetrying(row.documentId, false);
        this.#toast.showToast('Yeniden sıraya alındı', res?.message || 'Evrak yeniden Atlas aktarım sırasına alındı.', 'success');
        this.afterDocumentChanged();
      },
      error: err => {
        this.#setRetrying(row.documentId, false);
        // Evrakta hâlâ eksik bilgi varsa neden gösterilir; detay penceresinden düzenlemeye gidilebilir
        this.#toast.showToast('Yeniden sıraya alınamadı',
          incomingErrorMessage(err, 'Evrak yeniden Atlas aktarım sırasına alınamadı.'), 'error');
      }
    });
  }

  /** Yeniden Dene sonrası (satırdan ya da detay penceresinden): durum ve listeler yenilenir. */
  afterDocumentChanged(): void {
    this.loadStatus();
    this.loadTab('hatali');
    if (this.tab() !== 'hatali') this.loadTab(this.tab());
    else if (this.queue().loaded) this.loadTab('sirada');
  }

  #setRetrying(id: string, on: boolean): void {
    this.retrying.update(set => {
      const next = new Set(set);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }

  openDocument(documentId: string): void {
    this.selectedDocumentId.set(documentId);
  }

  closeDocument(): void {
    this.selectedDocumentId.set(null);
  }
}
