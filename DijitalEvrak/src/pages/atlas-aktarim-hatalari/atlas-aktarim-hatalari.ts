import { ChangeDetectionStrategy, Component, OnInit, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FlexiToastService } from 'flexi-toast';
import { catchError, of } from 'rxjs';
import GenericModel from '../../../components/generic-model/generic-model';
import { AtlasTransferFailure, AtlasTransferService, AtlasTransferStats } from '../../services/atlas-transfer';
import { incomingErrorMessage } from '../../services/incomingdocument';
import { Common } from '../../services/common';

/** Atlas Aktarım Hataları: aktarımı kalıcı hata alan (submissionStatus 5) evraklar.
 *  Servis bu evrakları yeniden denemez; yönetici nedeni okuyup evrakı yeniden kuyruğa alır
 *  ya da Evrak Kayıt ekranında eksiği düzeltip Yayınla der. */
@Component({
  imports: [GenericModel, DatePipe, RouterLink],
  templateUrl: './atlas-aktarim-hatalari.html',
  // Üst şerit ve özet kartları (ad-*) Kontrol Paneli ile ortak
  styleUrls: ['../home/dashboard.css', './atlas-aktarim-hatalari.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class AtlasAktarimHatalari implements OnInit {
  readonly #service = inject(AtlasTransferService);
  readonly #toast = inject(FlexiToastService);
  readonly #common = inject(Common);

  readonly rows = signal<AtlasTransferFailure[]>([]);
  readonly stats = signal<AtlasTransferStats | null>(null);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly lastUpdated = signal<Date | null>(null);
  // Yeniden kuyruğa alınmakta olan evraklar; istek sürerken satırın butonu pasiftir
  readonly retrying = signal<ReadonlySet<string>>(new Set());

  readonly inQueue = computed(() => {
    const s = this.stats();
    return s ? s.queued + s.transferring : null;
  });

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.#service.getFailed().subscribe({
      next: list => {
        this.rows.set(list ?? []);
        this.loading.set(false);
        this.lastUpdated.set(new Date());
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      }
    });
    this.#service.getStats().pipe(catchError(() => of(null))).subscribe(s => this.stats.set(s));
  }

  isRetrying(row: AtlasTransferFailure): boolean {
    return this.retrying().has(row.documentId);
  }

  retry(row: AtlasTransferFailure): void {
    const userId = this.#common.user()?.id;
    if (!userId || this.isRetrying(row)) return;

    this.#setRetrying(row.documentId, true);
    this.#service.retry(row.documentId, userId).subscribe({
      next: () => {
        // Evrak kuyruğa döndü; listeden düşmesi sonucun kendisidir
        this.#setRetrying(row.documentId, false);
        this.rows.update(list => list.filter(r => r.documentId !== row.documentId));
        this.stats.update(s => s ? { ...s, failed: Math.max(0, s.failed - 1), queued: s.queued + 1 } : s);
      },
      error: err => {
        this.#setRetrying(row.documentId, false);
        this.#toast.showToast('Yeniden kuyruğa alınamadı',
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
}
