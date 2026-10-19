import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient, HttpContext } from '@angular/common/http';
import { FlexiToastService } from 'flexi-toast';
import { firstValueFrom } from 'rxjs';
import { ScanFileModel } from '../../src/models/scanneddocument.model';
import { AppSettingModel } from '../../src/services/app-settings';
import { RoleService } from '../../src/services/role-service';
import { SKIP_ERROR_TOAST } from '../../src/interceptors/error-interceptor';
import {
  ScannedDocumentService,
  scanPoolErrorMessage,
  scanSourceLabel
} from '../../src/services/scanneddocument';

// Metindeki süreler sabit yazılmaz; ayar yoksa backend'in varsayılanları kullanılır
const DEFAULT_INTERVAL_SECONDS = 15;
const DEFAULT_RETENTION_DAYS = 30;

type SectionKey = 'arrive' | 'register' | 'after' | 'messages' | 'retention' | 'admin';

/**
 * "Taranmış belgeler nasıl çalışır?" penceresi (Taranmış Evraklar ve Evrak Kayıt).
 * Kullanıcı metni herkese, Ayarlar / arşiv / şimdi kontrol et bölümü yalnızca Yönetici'ye gösterilir.
 * Kontrol aralığı ve bekleme süresi her açılışta Uygulama Ayarları'ndan okunur.
 * Görsel iskelet (ship-*) styles.css'teki ortak pencere stilinden gelir.
 */
@Component({
  selector: 'app-scan-info-modal',
  imports: [DatePipe],
  templateUrl: './scan-info-modal.html',
  styleUrl: './scan-info-modal.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ScanInfoModal {
  readonly open = input(false);
  readonly closed = output<void>();

  private readonly http = inject(HttpClient);
  private readonly service = inject(ScannedDocumentService);
  private readonly roleService = inject(RoleService);
  private readonly toast = inject(FlexiToastService);

  readonly isAdmin = computed(() => this.roleService.hasAny(['Yönetici']));

  // ---- Canlı değerler ----
  readonly intervalSeconds = signal(DEFAULT_INTERVAL_SECONDS);
  readonly retentionDays = signal(DEFAULT_RETENTION_DAYS);
  readonly cleanupEnabled = signal(false);
  readonly settings = signal<AppSettingModel[]>([]);

  readonly pool = signal<ScanFileModel[] | null>(null);
  readonly poolCounts = computed(() => {
    const files = this.pool() ?? [];
    const bySource = new Map<string, number>();
    for (const f of files) bySource.set(f.source, (bySource.get(f.source) ?? 0) + 1);
    return {
      total: files.length,
      parts: [...bySource].map(([source, count]) => `${scanSourceLabel(source)} ${count}`).join(' · ')
    };
  });

  // ---- Yönetici ----
  readonly candidates = signal<ScanFileModel[] | null>(null);
  readonly candidatesVisible = signal(false);
  readonly cleaning = signal(false);
  readonly importing = signal(false);
  readonly lastJobMessage = signal('');

  readonly sourceLabel = scanSourceLabel;

  // Ayarlar tablosu: Uygulama Ayarları'ndaki güncel değer de gösterilir
  readonly settingRows = computed(() => {
    const values = new Map(this.settings().map(s => [s.key, s.value]));
    return SETTING_ROWS.map(row => ({ ...row, value: values.get(row.key) ?? null }));
  });

  // Bölümler açılır/kapanır; ilk açılışta "Belgeyi nasıl kaydederim?" açık gelir
  readonly openSections = signal<ReadonlySet<SectionKey>>(new Set(['register']));

  constructor() {
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.openSections.set(new Set(['register']));
        this.candidatesVisible.set(false);
        this.lastJobMessage.set('');
        this.loadSettings();
        this.loadPool();
        if (this.isAdmin()) this.loadCandidates();
      });
    });
  }

  isOpen(key: SectionKey): boolean {
    return this.openSections().has(key);
  }

  toggle(key: SectionKey, event: Event): void {
    const opened = (event.target as HTMLDetailsElement).open;
    this.openSections.update(set => {
      const next = new Set(set);
      if (opened) next.add(key); else next.delete(key);
      return next;
    });
  }

  close(): void {
    this.closed.emit();
  }

  private async loadSettings(): Promise<void> {
    try {
      const list = await firstValueFrom(this.http.get<AppSettingModel[]>('api/AppSettings/GetAll',
        { context: new HttpContext().set(SKIP_ERROR_TOAST, true) })) ?? [];
      this.settings.set(list);
      const value = (key: string) => list.find(s => s.key === key)?.value ?? null;
      this.intervalSeconds.set(positiveInt(value('ScanApiImportIntervalSeconds')) ?? DEFAULT_INTERVAL_SECONDS);
      this.retentionDays.set(positiveInt(value('ScanPoolCleanupRetentionDays')) ?? DEFAULT_RETENTION_DAYS);
      this.cleanupEnabled.set(value('ScanPoolCleanupEnabled')?.toLowerCase() === 'true');
    } catch (err) {
      // Ayarlar okunamazsa metin varsayılan değerlerle gösterilir
      console.error('Uygulama ayarları okunamadı:', err);
    }
  }

  private async loadPool(): Promise<void> {
    this.pool.set(null);
    this.pool.set(await this.service.getScannedDocuments());
  }

  private async loadCandidates(): Promise<void> {
    try {
      this.candidates.set(await firstValueFrom(this.service.getScanCleanupCandidates()) ?? []);
    } catch (err) {
      console.error('Arşive alınacak belgeler okunamadı:', err);
      this.candidates.set(null);
    }
  }

  async importNow(): Promise<void> {
    if (this.importing()) return;
    this.importing.set(true);
    this.lastJobMessage.set('');
    try {
      const result = await firstValueFrom(this.service.importFromScanApi());
      this.lastJobMessage.set(result?.message ?? '');
      await this.loadPool();
    } catch (err) {
      console.error(err);
      this.toast.showToast('Hata', scanPoolErrorMessage(err, 'Tarama sistemi kontrol edilemedi.'), 'error');
    } finally {
      this.importing.set(false);
    }
  }

  confirmCleanup(): void {
    const count = this.candidates()?.length ?? 0;
    if (!count || this.cleaning()) return;
    this.toast.showSwal(
      'Şimdi temizle',
      `Süresi dolan ${count} belge listeden kaldırılıp arşive alınacak. Devam edilsin mi?`,
      'Arşive al',
      () => this.runCleanup()
    );
  }

  private async runCleanup(): Promise<void> {
    this.cleaning.set(true);
    this.lastJobMessage.set('');
    try {
      const result = await firstValueFrom(this.service.runScanCleanup());
      this.lastJobMessage.set(result?.message ?? '');
      await Promise.all([this.loadCandidates(), this.loadPool()]);
    } catch (err) {
      console.error(err);
      this.toast.showToast('Hata', scanPoolErrorMessage(err, 'Temizlik çalıştırılamadı.'), 'error');
    } finally {
      this.cleaning.set(false);
    }
  }
}

const SETTING_ROWS = [
  { key: 'ScanApiImportEnabled', defaultValue: 'açık', text: 'Belgelerin tarama sisteminden kendiliğinden alınması.' },
  { key: 'ScanApiImportIntervalSeconds', defaultValue: '15', text: 'Kaç saniyede bir kontrol edileceği (en az 5).' },
  { key: 'ScanApiImportBatchSize', defaultValue: '20', text: 'Her kontrolde en fazla kaç belge alınacağı.' },
  { key: 'ScanPoolCleanupEnabled', defaultValue: 'kapalı', text: 'Süresi dolan bekleyen belgelerin günde bir arşive alınması.' },
  { key: 'ScanPoolCleanupRetentionDays', defaultValue: '30', text: 'Bekleyen belgenin arşive alınmadan önce kaç gün bekleyeceği.' }
] as const;

function positiveInt(value: string | null): number | null {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
