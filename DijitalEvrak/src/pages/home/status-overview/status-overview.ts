import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, inject, input, signal } from '@angular/core';
import { AdminDashboardData } from '../admin-dashboard/admin-dashboard-data';
import { isPublished } from '../../../models/publishstatus.model';
import { OutgoingDocumentStatus } from '../../../models/outgoingdocument.model';
import { DeliveryMethodEnum } from '../../../models/shipment.model';

type Direction = 'incoming' | 'outgoing';

/** Anlık Durum kartındaki bir yatay çubuk */
interface StatusBar {
  label: string;
  icon: string;
  value: number;
  total: number;
}

interface StatusView {
  /** Açık (işi bitmemiş) evrak sayısı */
  total: number;
  totalLabel: string;
  /** Sağ üstteki özet: tamamlanan / tüm evrak */
  note: string;
  bars: StatusBar[];
}

/** Gelen evrakın OCR durumu: 0 Bekliyor, 1 Tamamlandı, 2 Hatalı (bkz. Evrak Kayıt) */
const OCR_WAITING = 0;
const INCOMING_DELIVERED = 3;

/**
 * Anlık Durum kartı: Yönetici ve Gelen Evrak panellerinde ortak. Tarihten bağımsız olarak
 * şu an açık olan evrakların nerede beklediğini gösterir.
 * Gelen evrak hem Atlas'ta yayınlanmış hem teslim alınmışsa tamamlanmış sayılır, değilse açıktır;
 * bir evrak birden çok çubukta yer alabilir (ör. hem OCR hem teslim bekleyen).
 * Giden evrak Teslim Edildi olana kadar açıktır.
 * Veri Yönetici panelinde paneldeki ortak servisten, Gelen Evrak panelinde kartın kendi isteğinden gelir.
 */
@Component({
  selector: 'status-overview',
  standalone: true,
  templateUrl: './status-overview.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatusOverview {
  /** Giden verileri ve Gelen/Giden sekmeleri gösterilsin mi (Gelen Evrak panelinde kapalı: yalnızca gelen) */
  readonly showOutgoing = input(true);

  // Yönetici panelinde paneldeki örnek kullanılır; yoksa (Gelen Evrak paneli) kart kendisi yükler
  readonly #data = inject(AdminDashboardData, { optional: true }) ?? new AdminDashboardData();

  readonly loading = this.#data.loading;
  readonly failed = this.#data.failed;
  readonly statusTab = signal<Direction>('incoming');

  /** Panelin Yenile düğmesi için */
  reload(): void {
    this.#data.load();
  }

  readonly #incomingView = computed<StatusView>(() => {
    const all = this.#data.incoming();
    const isDone = (d: (typeof all)[number]) => d.status === INCOMING_DELIVERED && isPublished(d);
    const open = all.filter(d => !isDone(d));
    const total = open.length;
    const bar = (label: string, icon: string, test: (d: (typeof all)[number]) => boolean): StatusBar =>
      ({ label, icon, total, value: open.filter(test).length });

    return {
      total,
      totalLabel: 'açık gelen evrak',
      note: `${all.length - total} / ${all.length} tamamlandı`,
      bars: [
        bar('Ön kayıtta', 'app_registration', d => d.status === 1),
        bar('Taranmayı bekleyen', 'scanner', d => !d.documentName),
        // OCR servisi henüz çalışmadığından (tüm evraklar 0 Bekliyor) şimdilik gizli:
        // bar('OCR bekleyen', 'hourglass', d => !!d.documentName && (d.ocrStatus ?? OCR_WAITING) === OCR_WAITING),
        bar('Atlas\'a aktarılmayı bekleyen', 'cloud_upload', d => !isPublished(d)),
        bar('Teslim alınmayı bekleyen', 'approval_delegation', d => d.status !== INCOMING_DELIVERED),
      ],
    };
  });

  readonly #outgoingView = computed<StatusView>(() => {
    const all = this.#data.outgoing();
    type Doc = (typeof all)[number];
    // Backend evrak durumunu gönderimde ilerletmiyor (kargoya verilen evrak Taslak kalıyor, eski
    // kayıtlarda durum boş); bu yüzden gönderilmiş olmak dağıtım satırlarının gönderim tarihinden de okunur.
    const state = (d: Doc): 'draft' | 'sent' | 'delivered' | 'returned' => {
      if (d.status === OutgoingDocumentStatus.TeslimEdildi) return 'delivered';
      if (d.status === OutgoingDocumentStatus.Iade) return 'returned';
      const sent = d.status === OutgoingDocumentStatus.Gonderildi || (d.distributions ?? []).some(x => !!x.sentDate);
      return sent ? 'sent' : 'draft';
    };
    const open = all.filter(d => state(d) !== 'delivered');
    const total = open.length;
    const bar = (label: string, icon: string, test: (d: Doc) => boolean): StatusBar =>
      ({ label, icon, total, value: open.filter(test).length });
    // Kargoya verilmiş ama dağıtım satırına teslim tarihi düşmemiş evrak
    const inCargo = (d: Doc) => (d.distributions ?? []).some(x =>
      x.deliveryMethod === DeliveryMethodEnum.Kargo && !x.deliveryDate);

    return {
      total,
      totalLabel: 'açık giden evrak',
      note: `${all.length - total} / ${all.length} teslim edildi`,
      bars: [
        bar('Ön kayıtta', 'app_registration', d => state(d) === 'draft'),
        bar('Gönderildi, teslim bekleyen', 'send', d => state(d) === 'sent'),
        bar('Kargoda', 'local_shipping', inCargo),
        bar('İade edilen', 'undo', d => state(d) === 'returned'),
      ],
    };
  });

  readonly statusView = computed(() =>
    this.statusTab() === 'outgoing' && this.showOutgoing() ? this.#outgoingView() : this.#incomingView()
  );

  pct(value: number, total: number): number {
    return total > 0 ? Math.round((value / total) * 100) : 0;
  }

  /** Çubuk rengi doluluğa göre: %50'ye kadar mavi tonları, sonra bordo, tamamı bekliyorsa kırmızı */
  barColor(bar: StatusBar): string {
    const base = colorAt(this.pct(bar.value, bar.total) / 100);
    return `linear-gradient(90deg, ${rgb(base)}, ${rgb(mix(base, WHITE, 0.3))})`;
  }
}

type Rgb = [number, number, number];

const WHITE: Rgb = [255, 255, 255];
// Renk durakları: %50'ye kadar açıktan koyuya mavi, ardından bordo, en doluda kırmızı
const STOPS: { at: number; color: Rgb }[] = [
  { at: 0, color: [56, 189, 248] },   // #38bdf8 açık mavi
  { at: 0.5, color: [29, 78, 216] },  // #1d4ed8 koyu mavi
  { at: 0.75, color: [127, 29, 29] }, // #7f1d1d bordo
  { at: 1, color: [220, 38, 38] },    // #dc2626 kırmızı
];

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t)) as Rgb;
}

function colorAt(ratio: number): Rgb {
  const r = Math.min(1, Math.max(0, ratio));
  const upper = STOPS.findIndex(s => s.at >= r);
  if (upper <= 0) return STOPS[0].color;
  const lo = STOPS[upper - 1];
  const hi = STOPS[upper];
  return mix(lo.color, hi.color, (r - lo.at) / (hi.at - lo.at));
}

const rgb = ([r, g, b]: Rgb) => `rgb(${r}, ${g}, ${b})`;
