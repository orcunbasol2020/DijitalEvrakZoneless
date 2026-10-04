import { Component, ChangeDetectionStrategy, ViewEncapsulation, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { MapWorld, MissionMapCountry } from '../../map-world/map-world';
import { countryOfMission } from '../../map-world/mission-countries';
import { PendingChart } from '../pending-chart/pending-chart';
import { Currentdocument } from '../currentdocument/currentdocument';
import { StatusOverview } from '../status-overview/status-overview';
import { SmartRouting } from '../smart-routing/smart-routing';
import { NotaCounts } from '../nota-counts/nota-counts';
import { ReportChart } from '../../reports/report-chart';
import { ExternalInstitutionType } from '../../../services/external-institution';
import { AdminDashboardData, INCOMING_NOTA_TYPES, OUTGOING_NOTA_TYPE } from './admin-dashboard-data';

type Direction = 'incoming' | 'outgoing';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Misyon haritasının kapsadığı gün sayısı */
const MAP_DAYS = 30;

const fmt = (n: number) => n.toLocaleString('tr-TR');

/** Önceki döneme göre yüzde değişim; önceki dönem boşsa karşılaştırma anlamsız (null) */
function change(current: number, previous: number): number | null {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}

interface StatCard {
  label: string;
  value: string;
  period: string;
  trend: number | null;
  icon: string;
  url: string;
  hint: string;
}

/** En Çok Bekleyen Evrakı Olan Birimler satırı */
interface PendingUnit {
  code: string;
  name: string;
  owners: { name: string; ext: string }[];
  pending: number;
}

// En Çok Bekleyen Evrakı Olan Birimler (veri bağlanana kadar örnek değerler)
const PENDING_UNITS: PendingUnit[] = [
  { code: 'EÇGM', name: 'Enerji, Çevre ve Sınıraşan Sular Genel Müdürlüğü', owners: [{ name: 'Banu Gültekin', ext: '3420' }], pending: 18 },
  { code: 'DSGM', name: 'Destek Hizmetleri Genel Müdürlüğü', owners: [{ name: 'Aytül Özcan', ext: '1323' }, { name: 'Zeynep Büşra Tatar', ext: '1323' }], pending: 15 },
  { code: 'KOGM', name: 'Konsolosluk Hizmetleri ve Yurtdışında Yaşayan Vatandaşlar Genel Müdürlüğü', owners: [{ name: 'Didem Pekzorlu', ext: '2025' }], pending: 12 },
  { code: 'TPGM', name: 'Bilim ve Teknoloji Politikaları Genel Müdürlüğü', owners: [{ name: 'Cevşen Büşra Bahçecik', ext: '1116' }], pending: 11 },
  { code: 'BYMB', name: 'BYMB Bakan Yardımcılığı', owners: [{ name: 'Eda Tokan Akkuş', ext: '2219' }], pending: 9 },
];

@Component({
  imports: [
    CommonModule,
    DatePipe,
    RouterLink,
    MapWorld,
    PendingChart,
    Currentdocument,
    StatusOverview,
    SmartRouting,
    NotaCounts,
    ReportChart
  ],
  selector: 'app-admin-dashboard',
  // Kartların ortak verisi; panel her açıldığında bir kez yüklenir
  providers: [AdminDashboardData],
  standalone: true,
  templateUrl: './admin-dashboard.html',
  styleUrl: '../dashboard.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminDashboard {
  // ---- Üst şerit ----
  readonly today = new Date();

  /** Yenile butonu: Yüksek Öncelikli Evraklar kartını yeniden yükler, "son güncelleme" zamanını tazeler. */
  readonly lastUpdated = signal(new Date());
  readonly refreshing = signal(false);
  private readonly attentionCard = viewChild(Currentdocument);
  readonly #data = inject(AdminDashboardData);

  refresh(): void {
    if (this.refreshing()) return;
    this.refreshing.set(true);
    this.attentionCard()?.reload();
    this.#data.load();
    setTimeout(() => {
      this.lastUpdated.set(new Date());
      this.refreshing.set(false);
    }, 600);
  }

  // ---- İstatistik kartları ----
  // Kayıt tarihine göre sayılır. Eğilim önceki eşit dönemle karşılaştırılır: "Bugün" kartlarında
  // dün aynı saate kadar, 30 günlük kartlarda ondan önceki 30 gün. Önceki dönem boşsa eğilim gösterilmez.
  readonly statsLoading = this.#data.loading;

  readonly stats = computed<StatCard[]>(() => {
    const incoming = this.#data.incoming();
    const outgoing = this.#data.outgoing();
    const now = Date.now();
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const today = dayStart.getTime();
    const yesterday = today - DAY_MS;
    const month = now - 30 * DAY_MS;
    const prevMonth = month - 30 * DAY_MS;

    const times = (docs: { createdDate?: string | Date | null }[]) =>
      docs.map(d => (d.createdDate ? new Date(d.createdDate).getTime() : NaN)).filter(t => !isNaN(t));
    const count = (list: number[], from: number, to: number) => list.filter(t => t >= from && t < to).length;

    const inT = times(incoming);
    const outT = times(outgoing);
    const notaInT = times(incoming.filter(d => INCOMING_NOTA_TYPES.has(d.documentTypeId)));
    const notaOutT = times(outgoing.filter(d => d.type === OUTGOING_NOTA_TYPE));

    // Bugün: gece yarısından şimdiye; karşılaştırma dün aynı saate kadar
    const todayPair = (a: number[], b: number[]) => ({
      a: count(a, today, now + 1),
      b: count(b, today, now + 1),
      prev: count(a, yesterday, now - DAY_MS + 1) + count(b, yesterday, now - DAY_MS + 1),
    });
    const docsToday = todayPair(inT, outT);
    const notaToday = todayPair(notaInT, notaOutT);
    const inMonth = count(inT, month, now + 1);
    const outMonth = count(outT, month, now + 1);

    return [
      {
        label: 'BUGÜN GELEN / GİDEN', value: `${fmt(docsToday.a)} / ${fmt(docsToday.b)}`, period: 'Bugün',
        trend: change(docsToday.a + docsToday.b, docsToday.prev), icon: 'document_scanner', url: '/documentlist',
        hint: 'Bugün kaydedilen gelen ve giden evrak (eğilim: dün aynı saate göre)'
      },
      {
        label: 'GELEN EVRAK', value: fmt(inMonth), period: 'Son 30 gün',
        trend: change(inMonth, count(inT, prevMonth, month)), icon: 'folder_open', url: '/documentlist',
        hint: 'Son 30 günde kaydedilen gelen evrak (eğilim: önceki 30 güne göre)'
      },
      {
        label: 'GİDEN EVRAK', value: fmt(outMonth), period: 'Son 30 gün',
        trend: change(outMonth, count(outT, prevMonth, month)), icon: 'outbox', url: '/gidenevrak/outgoing',
        hint: 'Son 30 günde kaydedilen giden evrak (eğilim: önceki 30 güne göre)'
      },
      {
        label: 'NOTA GELEN / GİDEN', value: `${fmt(notaToday.a)} / ${fmt(notaToday.b)}`, period: 'Bugün',
        trend: change(notaToday.a + notaToday.b, notaToday.prev), icon: 'history_edu', url: '/reports',
        hint: 'Bugün kaydedilen diplomatik notalar (eğilim: dün aynı saate göre)'
      },
    ];
  });

  // ---- Kart sekmeleri: her kartın kendi durumu var, biri diğerini etkilemez ----
  pct(value: number, total: number): number {
    return total > 0 ? Math.round((value / total) * 100) : 0;
  }

  // ---- En Çok Bekleyen Evrakı Olan Birimler ----
  readonly pendingUnits = PENDING_UNITS;
  readonly #maxPending = Math.max(...PENDING_UNITS.map(u => u.pending), 1);

  /** Bekleyen sayısının listedeki en yüksek değere oranı (çubuk genişliği) */
  pendingShare(unit: PendingUnit): number {
    return this.pct(unit.pending, this.#maxPending);
  }

  // ---- En Çok Evrak Gelen Birimler / Misyonlar ----
  // Raporlar'daki Dönem Karşılaştırması ile aynı biçim: son 30 günün ilk 5'i, her biri için
  // önceki 30 gün yanında. Ayrıntılı kırılım Raporlar'da.
  readonly centerTab = signal<Direction>('incoming');
  readonly missionTab = signal<Direction>('incoming');
  readonly rankingFailed = this.#data.failed;

  /** Gelen: birime gelen evrak. Giden: birimin gönderdiği evrak. */
  readonly #unitRows = computed<CompareRow[]>(() => {
    const units = new Map(this.#data.departments().map(d => [d.id.toLowerCase(), d]));
    const docs: { departmentId?: string | null; createdDate?: string | Date | null }[] =
      this.centerTab() === 'incoming' ? this.#data.incoming() : this.#data.outgoing();
    const counter = periodCounter();
    for (const d of docs) counter.add(d.createdDate, d.departmentId);
    return counter.top(id => {
      const unit = units.get(id);
      const name = unit?.name ?? 'Bilinmeyen birim';
      return { name, short: unit?.shortName || name };
    });
  });

  /** Gelen: misyondan gelen evrak. Giden: misyona gönderilen evrak (dağıtım listesi, eski kayıtta tek alıcı). */
  readonly #missionRows = computed<CompareRow[]>(() => {
    const missions = new Map(this.#data.institutions()
      .filter(i => i.type === ExternalInstitutionType.Misyon)
      .map(i => [i.id.toLowerCase(), i.name]));
    const counter = periodCounter();
    const add = (date: string | Date | null | undefined, id: string | null | undefined) => {
      if (id && missions.has(id.toLowerCase())) counter.add(date, id);
    };

    if (this.missionTab() === 'incoming') {
      for (const d of this.#data.incoming()) add(d.createdDate, d.externalInstitutionId);
    } else {
      for (const d of this.#data.outgoing()) {
        const recipients = new Set((d.distributions ?? []).map(x => x.externalInstitutionId?.toLowerCase()).filter(Boolean));
        if (d.externalInstitutonId) recipients.add(d.externalInstitutonId.toLowerCase());
        recipients.forEach(id => add(d.createdDate, id));
      }
    }
    return counter.top(id => {
      const name = missions.get(id)!;
      return { name, short: name.replace(MISSION_SUFFIX, '').trim() || name };
    });
  });

  // ---- Misyon Evrak Yoğunluk Haritası ----
  // Son 30 günde (kayıt tarihine göre) misyonlardan gelen ya da misyonlara gönderilen evrak,
  // misyonun ülkesine göre toplanır. Ülke misyon adından tanınır; tanınmayan misyonlar haritada gösterilmez.
  readonly mapTab = signal<Direction>('incoming');

  readonly missionMap = computed<MissionMapCountry[]>(() => {
    const missions = new Map(this.#data.institutions()
      .filter(i => i.type === ExternalInstitutionType.Misyon)
      .map(i => [i.id.toLowerCase(), i.name]));
    const since = Date.now() - MAP_DAYS * DAY_MS;
    const inPeriod = (date?: string | Date | null) => !!date && new Date(date).getTime() >= since;
    const perMission = new Map<string, number>();
    const add = (id: string) => {
      if (missions.has(id)) perMission.set(id, (perMission.get(id) ?? 0) + 1);
    };

    if (this.mapTab() === 'incoming') {
      for (const d of this.#data.incoming()) {
        const id = d.externalInstitutionId?.toLowerCase();
        if (id && inPeriod(d.createdDate)) add(id);
      }
    } else {
      // Alıcılar dağıtım listesinden (eski kayıtta tek alıcı alanından); aynı evrak bir misyona bir kez sayılır
      for (const d of this.#data.outgoing()) {
        if (!inPeriod(d.createdDate)) continue;
        const recipients = new Set<string>();
        for (const dist of d.distributions ?? []) {
          const id = dist.externalInstitutionId?.toLowerCase();
          if (id && !(dist as { isDeleted?: boolean }).isDeleted) recipients.add(id);
        }
        if (d.externalInstitutonId) recipients.add(d.externalInstitutonId.toLowerCase());
        recipients.forEach(add);
      }
    }

    const countries = new Map<string, MissionMapCountry>();
    for (const [id, count] of perMission) {
      const name = missions.get(id)!;
      const country = countryOfMission(name);
      if (!country) continue;
      const row = countries.get(country.label) ?? { ...country, total: 0, missions: [] };
      row.total += count;
      row.missions.push({ name, count });
      countries.set(country.label, row);
    }
    for (const c of countries.values()) c.missions.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'tr'));
    return [...countries.values()];
  });
  readonly mapDays = MAP_DAYS;

  readonly unitsEmpty = computed(() => this.#unitRows().length === 0);
  readonly missionsEmpty = computed(() => this.#missionRows().length === 0);
  readonly unitCompareOption = computed(() =>
    compareOption(this.#unitRows(), this.centerTab() === 'incoming' ? C_IN : C_OUT));
  readonly missionCompareOption = computed(() =>
    compareOption(this.#missionRows(), this.missionTab() === 'incoming' ? C_IN : C_OUT));
}

// Raporlar ekranıyla aynı renkler: önceki dönem gri, bu dönem gelen mavi / giden turkuaz
const C_IN = '#0369a1';
const C_OUT = '#14b8a6';
const C_PREV = '#cbd5e1';

/** Grafik ekseninde misyon adı kısaltılır (ör. "Afganistan Büyükelçiliği" → "Afganistan") */
const MISSION_SUFFIX = /\s+(Büyükelçiliği|Başkonsolosluğu|Konsolosluğu|Daimi Temsilciliği|Temsilciliği|Delegasyonu)$/i;

interface CompareRow {
  name: string;
  short: string;
  current: number;
  previous: number;
}

/** Son 30 gün ve ondan önceki 30 gün sayaçları; sıralama bu döneme göre (eşitlikte önceki, sonra ad), ilk 5 */
function periodCounter() {
  const now = Date.now();
  const start = now - 30 * DAY_MS;
  const prevStart = start - 30 * DAY_MS;
  const counts = new Map<string, { current: number; previous: number }>();

  return {
    add(date: string | Date | null | undefined, id: string | null | undefined): void {
      if (!date || !id) return;
      const t = new Date(date).getTime();
      const field = t >= start && t <= now ? 'current' : t >= prevStart && t < start ? 'previous' : null;
      if (!field) return;
      const key = id.toLowerCase();
      const row = counts.get(key) ?? { current: 0, previous: 0 };
      row[field]++;
      counts.set(key, row);
    },
    top(label: (id: string) => { name: string; short: string }): CompareRow[] {
      return [...counts.entries()]
        .filter(([, c]) => c.current > 0)
        .map(([id, c]) => ({ ...label(id), ...c }))
        .sort((a, b) => b.current - a.current || b.previous - a.previous || a.name.localeCompare(b.name, 'tr'))
        .slice(0, 5);
    },
  };
}

/** Raporlar "Dönem Karşılaştırması" ile aynı gruplu sütun grafiği */
function compareOption(rows: CompareRow[], color: string) {
  const bar = (name: string, data: number[], barColor: string) => ({
    name, type: 'bar', barMaxWidth: 26, barGap: '15%',
    itemStyle: { color: barColor, borderRadius: [5, 5, 0, 0] },
    label: { show: true, position: 'top', fontSize: 11 },
    data,
  });
  return {
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      // Eksende kısa ad, ipucunda tam ad
      formatter: (params: { dataIndex: number; marker: string; seriesName: string; value: number }[]) => {
        const row = rows[params[0]?.dataIndex];
        return [`<b>${row?.name ?? ''}</b>`, ...params.map(p => `${p.marker}${p.seriesName}: <b>${p.value}</b>`)].join('<br>');
      },
    },
    legend: { bottom: 0 },
    grid: { top: 24, left: 8, right: 8, bottom: 36, containLabel: true },
    xAxis: {
      type: 'category', data: rows.map(r => r.short),
      axisLabel: { interval: 0, width: 88, overflow: 'truncate' },
    },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      bar('Önceki 30 gün', rows.map(r => r.previous), C_PREV),
      bar('Son 30 gün', rows.map(r => r.current), color),
    ],
  };
}
