import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FlexiToastService } from 'flexi-toast';
import { Subscription } from 'rxjs';
import {
  AtlasTransferAttempt,
  AtlasTransferDocument,
  AtlasTransferPackage,
  AtlasTransferService,
  attemptOutcome,
  utc
} from '../../src/services/atlas-transfer';
import { incomingErrorMessage } from '../../src/services/incomingdocument';
import { Common } from '../../src/services/common';
import { formatFileSize } from '../../src/models/incoming-document-attachment.model';
import { PublishStatusEnum, PublishStatusLabels } from '../../src/models/publishstatus.model';

/** Yayın durumunun rozet tonu (aa-badge-*) ve simgesi. */
export const TRANSFER_STATUS_TONE: Record<PublishStatusEnum, { tone: string; icon: string }> = {
  [PublishStatusEnum.Yayinlanmadi]: { tone: 'muted', icon: 'unpublished' },
  [PublishStatusEnum.AktarimSirasinda]: { tone: 'info', icon: 'hourglass_top' },
  [PublishStatusEnum.Aktariliyor]: { tone: 'info', icon: 'sync' },
  [PublishStatusEnum.Yayinlandi]: { tone: 'ok', icon: 'verified' },
  [PublishStatusEnum.AktarimHatali]: { tone: 'error', icon: 'error' },
};

const TEST_PACKAGE = 'test';

/**
 * Gelen evrakın Atlas aktarım detayı: yayın durumu, EYP paketleri (indirilebilir) ve gönderim
 * denemeleri; durum Aktarım Hatalı ise Yeniden Dene. Atlas Aktarım sayfasındaki pencerede ve
 * Evrak Kayıt ekranının Aktarım sekmesinde kullanılır. Paket evrakın içeriğini taşıdığı için
 * bileşen yalnızca yönetici ekranlarında gösterilir. Stiller aa-* (atlas-transfer-detail.css).
 */
@Component({
  selector: 'app-atlas-transfer-detail',
  standalone: true,
  imports: [DatePipe, RouterLink],
  templateUrl: './atlas-transfer-detail.html',
  styleUrl: './atlas-transfer-detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class AtlasTransferDetail {
  readonly #service = inject(AtlasTransferService);
  readonly #toast = inject(FlexiToastService);
  readonly #common = inject(Common);

  readonly documentId = input<string | null>(null);
  // Başlıkta evrak no ve konu (Evrak Kayıt'ta zaten görünüyor, orada kapatılır)
  readonly showHeader = input(true);
  // Yeniden Dene eksik bilgi yüzünden reddedilirse Evrak Kayıt'a bağlantı verilir
  readonly editLink = input(false);
  /** Yeniden Dene başarılı oldu; çağıran sayfa kendi listelerini yeniler. */
  readonly changed = output<void>();

  readonly detail = signal<AtlasTransferDocument | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly retrying = signal(false);
  readonly retryError = signal<string | null>(null);
  // İndirilmekte olan paketin id'si; test paketi üretilirken TEST_PACKAGE
  readonly downloading = signal<string | null>(null);
  readonly testPackage = TEST_PACKAGE;

  readonly utc = utc;
  readonly outcome = attemptOutcome;
  readonly size = formatFileSize;

  readonly status = computed<PublishStatusEnum>(() =>
    (this.detail()?.status as PublishStatusEnum | null) || PublishStatusEnum.Yayinlanmadi);
  readonly statusLabel = computed(() => PublishStatusLabels[this.status()] ?? 'Bilinmiyor');
  readonly statusTone = computed(() => TRANSFER_STATUS_TONE[this.status()] ?? TRANSFER_STATUS_TONE[PublishStatusEnum.Yayinlanmadi]);
  readonly canRetry = computed(() => this.status() === PublishStatusEnum.AktarimHatali);
  readonly isTransferring = computed(() => this.status() === PublishStatusEnum.Aktariliyor);

  #sub?: Subscription;

  constructor() {
    effect(() => {
      const id = this.documentId();
      untracked(() => {
        this.retryError.set(null);
        this.detail.set(null);
        if (id) this.load();
      });
    });
  }

  load(): void {
    const id = this.documentId();
    if (!id) return;
    this.#sub?.unsubscribe();
    this.loading.set(true);
    this.loadError.set(null);
    this.#sub = this.#service.getDocument(id).subscribe({
      next: d => {
        this.detail.set(d);
        this.loading.set(false);
      },
      error: err => {
        this.loadError.set(incomingErrorMessage(err, 'Aktarım bilgisi alınamadı.'));
        this.loading.set(false);
      }
    });
  }

  retry(): void {
    const id = this.documentId();
    const userId = this.#common.user()?.id;
    if (!id || !userId || this.retrying()) return;

    this.retrying.set(true);
    this.retryError.set(null);
    this.#service.retry(id, userId).subscribe({
      next: res => {
        this.retrying.set(false);
        this.#toast.showToast('Yeniden sıraya alındı', res?.message || 'Evrak yeniden Atlas aktarım sırasına alındı.', 'success');
        this.load();
        this.changed.emit();
      },
      error: err => {
        this.retrying.set(false);
        // Evrakta hâlâ eksik bilgi varsa backend nedeni açıklar; kullanıcı düzeltip tekrar dener
        this.retryError.set(incomingErrorMessage(err, 'Evrak yeniden Atlas aktarım sırasına alınamadı.'));
      }
    });
  }

  async download(pkg: AtlasTransferPackage): Promise<void> {
    const d = this.detail();
    if (!d || !pkg.fileExists || this.downloading()) return;
    this.downloading.set(pkg.id);
    try {
      await this.#service.downloadPackage(d.documentId, pkg.id, `${d.qrCode || 'paket'}.eyp`);
    } catch (e) {
      this.#toast.showToast('Paket indirilemedi', (e as Error).message, 'error');
    } finally {
      this.downloading.set(null);
    }
  }

  // Evrakın şimdiki haliyle test paketi; kaydedilmez, kuyruğu etkilemez
  async generate(): Promise<void> {
    const d = this.detail();
    if (!d || this.downloading()) return;
    this.downloading.set(TEST_PACKAGE);
    try {
      await this.#service.generatePackage(d.documentId, `${d.qrCode || 'paket'}_test.eyp`);
    } catch (e) {
      this.#toast.showToast('Test paketi üretilemedi', (e as Error).message, 'error');
    } finally {
      this.downloading.set(null);
    }
  }

  trackAttempt(a: AtlasTransferAttempt): string {
    return `${a.packageId}-${a.attemptNo}`;
  }
}
