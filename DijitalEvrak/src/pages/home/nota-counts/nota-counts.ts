import { ChangeDetectionStrategy, Component, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ExternalInstitutionModel, ExternalInstitutionType } from '../../../services/external-institution';
import { AdminDashboardData, INCOMING_NOTA_TYPES, OUTGOING_NOTA_TYPE } from '../admin-dashboard/admin-dashboard-data';

type Period = 7 | 30;

interface NotaRow {
  id: string;
  name: string;
  /** assets/images/bayraklar altındaki dosya; ülke tanınmazsa boş (genel ikon gösterilir) */
  flag: string | null;
  incoming: number;
  outgoing: number;
}

const MAX_ROWS = 5;

// Dış kurum kaydında ülke bilgisi yok; bayrağı olan ülkeler misyon adının başından tanınır
const FLAGS: { prefix: string; file: string }[] = [
  { prefix: 'almanya', file: 'almanya' },
  { prefix: 'rusya', file: 'rusya' },
  { prefix: 'amerika birleşik devletleri', file: 'abd' },
  { prefix: 'abd', file: 'abd' },
  { prefix: 'birleşik krallık', file: 'eng' },
  { prefix: 'ingiltere', file: 'eng' },
];

function flagOf(name: string): string | null {
  const lower = name.toLocaleLowerCase('tr');
  return FLAGS.find(f => lower.startsWith(f.prefix))?.file ?? null;
}

const key = (id: string | null | undefined) => (id ? id.toLowerCase() : null);

/**
 * Yönetici paneli "Diplomatik Nota Sayıları": seçilen dönemde (kayıt tarihine göre) misyonlardan
 * gelen ve misyonlara gönderilen notalar, toplamı en yüksek ilk beş misyon.
 * Gelen nota: türü Nota / E-Nota olan ve gönderen kurumu Misyon türündeki gelen evrak.
 * Giden nota: türü Nota olan giden evrak; alıcı misyonlar dağıtım listesinden (eski
 * kayıtlarda tek alıcı alanından) okunur, aynı evrak bir misyona bir kez sayılır.
 */
@Component({
  selector: 'app-nota-counts',
  imports: [RouterLink],
  templateUrl: './nota-counts.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotaCounts {
  readonly #data = inject(AdminDashboardData);

  readonly period = signal<Period>(7);
  readonly loading = this.#data.loading;
  readonly failed = this.#data.failed;

  readonly #missions = computed(() => new Map<string, ExternalInstitutionModel>(
    this.#data.institutions()
      .filter(i => i.type === ExternalInstitutionType.Misyon)
      .map(i => [i.id.toLowerCase(), i])
  ));

  reload(): void {
    this.#data.load();
  }

  readonly rows = computed<NotaRow[]>(() => {
    const missions = this.#missions();
    const since = Date.now() - this.period() * 24 * 60 * 60 * 1000;
    const inPeriod = (date?: string | Date | null) => !!date && new Date(date).getTime() >= since;
    const counts = new Map<string, { incoming: number; outgoing: number }>();
    const bump = (id: string, field: 'incoming' | 'outgoing') => {
      const row = counts.get(id) ?? { incoming: 0, outgoing: 0 };
      row[field]++;
      counts.set(id, row);
    };

    for (const d of this.#data.incoming()) {
      const id = key(d.externalInstitutionId);
      if (!id || !missions.has(id) || !INCOMING_NOTA_TYPES.has(d.documentTypeId)) continue;
      if (inPeriod(d.createdDate)) bump(id, 'incoming');
    }

    for (const d of this.#data.outgoing()) {
      if (d.type !== OUTGOING_NOTA_TYPE || !inPeriod(d.createdDate)) continue;
      const recipients = new Set<string>();
      for (const dist of d.distributions ?? []) {
        const id = key(dist.externalInstitutionId);
        if (id && !(dist as { isDeleted?: boolean }).isDeleted) recipients.add(id);
      }
      const legacy = key(d.externalInstitutonId);
      if (legacy) recipients.add(legacy);
      for (const id of recipients) if (missions.has(id)) bump(id, 'outgoing');
    }

    return [...counts.entries()]
      .map(([id, c]) => {
        const name = missions.get(id)?.name ?? '-';
        return { id, name, flag: flagOf(name), ...c };
      })
      .sort((a, b) => (b.incoming + b.outgoing) - (a.incoming + a.outgoing) || a.name.localeCompare(b.name, 'tr'))
      .slice(0, MAX_ROWS);
  });

  /** Gelen notaların toplam içindeki payı (dağılım çubuğu) */
  incomingShare(row: NotaRow): number {
    const total = row.incoming + row.outgoing;
    return total > 0 ? Math.round((row.incoming / total) * 100) : 0;
  }
}
