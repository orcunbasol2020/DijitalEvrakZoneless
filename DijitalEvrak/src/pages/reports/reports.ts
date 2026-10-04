import { ChangeDetectionStrategy, Component, ViewEncapsulation, WritableSignal, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import GenericModel from '../../../components/generic-model/generic-model';
import { ReportChart } from './report-chart';
import { MultiOption, ReportMultiselect } from './report-multiselect';
import { Direction, EnvelopeRow, ReportDataService, ReportDataset, ReportDoc } from './report-data';
import { UrgencyDegreeEnum, UrgencyDegreeLabels } from '../../models/urgencydegree.model';
import { SecurityDegreeEnum, SecurityDegreeLabels } from '../../models/securitydegree.model';

type Tab = 'overview' | 'incoming' | 'outgoing' | 'units' | 'staff' | 'envelopes' | 'query';
type Preset = 'today' | '7' | '30' | '90' | 'year' | 'all' | 'custom';
type DateField = 'created' | 'document';
type Granularity = 'day' | 'week' | 'month';
type ChartKind = 'bar' | 'hbar' | 'donut';

interface Range { from: Date | null; to: Date | null; }
interface Item { name: string; value: number; color?: string; }

/** Kırılım kartı: aynı veri grafik ya da tablo olarak gösterilir */
interface Breakdown {
  id: string;
  title: string;
  icon: string;
  kind: ChartKind;
  items: Item[];
}

interface UnitRow {
  id: string;
  name: string;
  incoming: number;
  delivered: number;
  pending: number;
  rate: number;
  urgent: number;
  published: number;
  outgoing: number;
  total: number;
}

interface StaffRow {
  id: string;
  name: string;
  incoming: number;
  outgoing: number;
  assignedOpen: number;
  total: number;
}

type UnitSort = Exclude<keyof UnitRow, 'id'>;
type StaffSort = Exclude<keyof StaffRow, 'id'>;
type QuerySort = 'no' | 'direction' | 'date' | 'department' | 'institution' | 'urgency' | 'security' | 'status';
type QueryGroup = 'department' | 'institution' | 'institutionType' | 'urgency' | 'security' | 'type' | 'status'
  | 'publish' | 'action' | 'language' | 'creator' | 'direction' | 'month';

const DAY = 86_400_000;

// Site paleti: petrol (gelen), turkuaz (giden), lacivert ve yardımcı tonlar
const C_IN = '#0369a1';
const C_OUT = '#14b8a6';
const C_PREV = '#cbd5e1';
const PALETTE = ['#0369a1', '#14b8a6', '#0c4a6e', '#38bdf8', '#f59e0b', '#6366f1', '#0891b2', '#94a3b8', '#ef4444', '#22c55e', '#a855f7', '#64748b'];

/** İvedilik sırası ve renkleri: Yüksek Öncelikli Evraklar ile aynı tonlar */
const URGENCY_ORDER = [
  UrgencyDegreeEnum.Lightning, UrgencyDegreeEnum.Dated, UrgencyDegreeEnum.VeryUrgent,
  UrgencyDegreeEnum.Urgent, UrgencyDegreeEnum.UrgentTimeLimited, UrgencyDegreeEnum.Normal,
];
const URGENCY_COLORS: Record<number, string> = {
  [UrgencyDegreeEnum.Lightning]: '#dc2626',
  [UrgencyDegreeEnum.Dated]: '#ea580c',
  [UrgencyDegreeEnum.VeryUrgent]: '#d97706',
  [UrgencyDegreeEnum.Urgent]: '#f59e0b',
  [UrgencyDegreeEnum.UrgentTimeLimited]: '#a855f7',
  [UrgencyDegreeEnum.Normal]: '#94a3b8',
};
/** Dikkat gerektiren ivedilikler (Yönetici paneli ile aynı küme) */
const HIGH_URGENCY = new Set<number>([
  UrgencyDegreeEnum.Lightning, UrgencyDegreeEnum.Dated, UrgencyDegreeEnum.VeryUrgent, UrgencyDegreeEnum.Urgent,
]);
const SECURITY_ORDER = [1, 2, 3, 4, 5, 6, 7] as SecurityDegreeEnum[];
const SECURITY_COLORS = ['#94a3b8', '#38bdf8', '#0891b2', '#6366f1', '#f59e0b', '#ef4444', '#7c3aed'];

const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

const fmtDay = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });
const fmtMonth = new Intl.DateTimeFormat('tr-TR', { month: 'short', year: 'numeric' });

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  return addDays(s, -((s.getDay() + 6) % 7));
}

function toInputDate(d: Date | null): string {
  if (!d) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fromInputDate(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  return y ? new Date(y, m - 1, d) : null;
}

function inRange(date: Date | null, r: Range): boolean {
  if (!r.from && !r.to) return true;
  if (!date) return false;
  return (!r.from || date >= r.from) && (!r.to || date < r.to);
}

function countBy<T>(list: T[], keyOf: (x: T) => string): Item[] {
  const map = new Map<string, number>();
  for (const x of list) {
    const k = keyOf(x);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  // Bilinmeyen değer (Belirtilmemiş / —) en sonda ve gri: asıl dağılımın önüne geçmesin
  const unknown = (n: string) => n === 'Belirtilmemiş' || n === '—';
  return [...map].map(([name, value]) => ({ name, value, ...(unknown(name) ? { color: '#cbd5e1' } : {}) }))
    .sort((a, b) => Number(unknown(a.name)) - Number(unknown(b.name)) || b.value - a.value);
}

/** Uzun listelerde ilk n kalem, kalanı "Diğer" */
function top(items: Item[], n: number): Item[] {
  if (items.length <= n) return items;
  const rest = items.slice(n).reduce((s, i) => s + i.value, 0);
  return [...items.slice(0, n), { name: 'Diğer', value: rest, color: '#cbd5e1' }];
}

function pct(part: number, total: number): number {
  return total ? Math.round((part / total) * 1000) / 10 : 0;
}

function change(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function formatHours(hours: number | null): string {
  if (hours == null) return '—';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} dk`;
  if (hours < 24) return `${Math.round(hours * 10) / 10} sa`;
  const days = Math.floor(hours / 24);
  const rest = Math.round(hours % 24);
  return rest ? `${days} g ${rest} sa` : `${days} g`;
}

function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Excel'in Türkçe ayarında doğrudan açılan CSV (noktalı virgül, UTF-8 BOM) */
function downloadCsv(fileName: string, header: string[], rows: unknown[][]): void {
  const body = [header, ...rows].map(r => r.map(csvCell).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

@Component({
  imports: [GenericModel, ReportChart, ReportMultiselect, DatePipe, DecimalPipe, NgTemplateOutlet],
  templateUrl: './reports.html',
  styleUrls: ['../home/dashboard.css', './reports.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Reports {
  private readonly dataService = inject(ReportDataService);

  // ---------------------------------------------------------------- Veri
  readonly data = signal<ReportDataset | null>(null);
  readonly loading = signal(true);
  readonly failed = signal(false);

  constructor() {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.dataService.load().subscribe({
      next: data => {
        this.data.set(data);
        this.loading.set(false);
      },
      error: err => {
        console.error('Rapor verileri alınamadı:', err);
        this.failed.set(true);
        this.loading.set(false);
      }
    });
  }

  // ---------------------------------------------------------------- Sekme ve genel süzgeçler
  readonly tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'overview', label: 'Genel Bakış', icon: 'dashboard' },
    { id: 'incoming', label: 'Gelen Evrak', icon: 'move_to_inbox' },
    { id: 'outgoing', label: 'Giden Evrak', icon: 'outbox' },
    { id: 'units', label: 'Birim Karşılaştırma', icon: 'apartment' },
    { id: 'staff', label: 'Personel', icon: 'groups' },
    { id: 'envelopes', label: 'Zarf', icon: 'mail' },
    { id: 'query', label: 'Detaylı Sorgu', icon: 'manage_search' },
  ];
  readonly tab = signal<Tab>('overview');

  readonly presets: { id: Preset; label: string }[] = [
    { id: 'today', label: 'Bugün' },
    { id: '7', label: '7 Gün' },
    { id: '30', label: '30 Gün' },
    { id: '90', label: '90 Gün' },
    { id: 'year', label: 'Bu Yıl' },
    { id: 'all', label: 'Tümü' },
    { id: 'custom', label: 'Özel' },
  ];
  readonly preset = signal<Preset>('30');
  readonly customFrom = signal(toInputDate(addDays(new Date(), -29)));
  readonly customTo = signal(toInputDate(new Date()));
  /** Dönem süzgeci kayıt tarihine mi belge tarihine mi uygulanır */
  readonly dateField = signal<DateField>('created');
  /** Genel birim süzgeci (boş: tüm birimler) */
  readonly unitFilter = signal<string>('');

  readonly granularityChoice = signal<Granularity | 'auto'>('auto');

  setPreset(p: Preset): void {
    if (p === 'custom' && this.preset() !== 'custom') {
      const r = this.range();
      if (r.from) this.customFrom.set(toInputDate(r.from));
      if (r.to) this.customTo.set(toInputDate(addDays(r.to, -1)));
    }
    this.preset.set(p);
  }

  /** Seçili dönem: [from, to) */
  readonly range = computed<Range>(() => {
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);
    switch (this.preset()) {
      case 'today': return { from: today, to: tomorrow };
      case '7': return { from: addDays(today, -6), to: tomorrow };
      case '30': return { from: addDays(today, -29), to: tomorrow };
      case '90': return { from: addDays(today, -89), to: tomorrow };
      case 'year': return { from: new Date(today.getFullYear(), 0, 1), to: tomorrow };
      case 'all': return { from: null, to: null };
      case 'custom': {
        const from = fromInputDate(this.customFrom());
        const to = fromInputDate(this.customTo());
        return { from, to: to ? addDays(to, 1) : null };
      }
    }
  });

  /** Karşılaştırma dönemi: seçili dönemle aynı uzunlukta, hemen önceki aralık */
  readonly prevRange = computed<Range | null>(() => {
    const r = this.range();
    if (!r.from || !r.to) return null;
    const len = r.to.getTime() - r.from.getTime();
    return { from: new Date(r.from.getTime() - len), to: r.from };
  });

  readonly rangeLabel = computed(() => {
    const r = this.range();
    if (!r.from && !r.to) return 'Tüm kayıtlar';
    const f = (d: Date | null) => d ? d.toLocaleDateString('tr-TR') : '…';
    return `${f(r.from)} – ${f(r.to ? addDays(r.to, -1) : null)}`;
  });

  readonly dateFieldLabel = computed(() => this.dateField() === 'created' ? 'Kayıt tarihi' : 'Belge tarihi');

  private dateOf(doc: ReportDoc): Date | null {
    return this.dateField() === 'created' ? doc.createdDate : doc.documentDate;
  }

  private scoped(r: Range | null): ReportDoc[] {
    const data = this.data();
    if (!data || !r) return [];
    const unit = this.unitFilter();
    return data.docs.filter(d => (!unit || d.departmentId === unit) && inRange(this.dateOf(d), r));
  }

  /** Genel süzgeçlerden geçen evraklar (Detaylı Sorgu hariç tüm sekmeler) */
  readonly docs = computed(() => this.scoped(this.range()));
  readonly prevDocs = computed(() => this.scoped(this.prevRange()));
  readonly incoming = computed(() => this.docs().filter(d => d.direction === 'in'));
  readonly outgoing = computed(() => this.docs().filter(d => d.direction === 'out'));

  readonly departmentOptions = computed<MultiOption[]>(() =>
    (this.data()?.departments ?? []).map(d => ({ value: d.id, label: d.name })));

  // ---------------------------------------------------------------- Genel Bakış
  readonly kpis = computed(() => {
    const inc = this.incoming();
    const out = this.outgoing();
    const prev = this.prevDocs();
    const prevIn = prev.filter(d => d.direction === 'in');
    const prevOut = prev.filter(d => d.direction === 'out');
    const hasPrev = !!this.prevRange();
    const delivered = inc.filter(d => d.delivered).length;
    const published = inc.filter(d => d.published).length;
    const urgent = inc.filter(d => d.urgency != null && HIGH_URGENCY.has(d.urgency)).length;
    const pubTimes = inc.map(d => d.publishHours).filter((h): h is number => h != null);
    const avgPublish = pubTimes.length ? pubTimes.reduce((s, h) => s + h, 0) / pubTimes.length : null;
    const envelopes = this.envelopes();

    return {
      incoming: inc.length,
      incomingChange: hasPrev ? change(inc.length, prevIn.length) : null,
      outgoing: out.length,
      outgoingChange: hasPrev ? change(out.length, prevOut.length) : null,
      pending: inc.length - delivered,
      deliveredRate: pct(delivered, inc.length),
      publishedRate: pct(published, inc.length),
      urgent,
      urgentRate: pct(urgent, inc.length),
      avgPublish: formatHours(avgPublish),
      publishedCount: pubTimes.length,
      envelopes: envelopes.length,
      envelopeDocs: envelopes.reduce((s, e) => s + e.documentCount, 0),
      hasPrev,
    };
  });

  readonly granularity = computed<Granularity>(() => {
    const choice = this.granularityChoice();
    if (choice !== 'auto') return choice;
    const { from, to } = this.trendBounds();
    const days = (to.getTime() - from.getTime()) / DAY;
    return days <= 45 ? 'day' : days <= 200 ? 'week' : 'month';
  });

  /** Trend ekseninin sınırları: "Tümü"de verinin ilk ve son tarihi */
  private readonly trendBounds = computed(() => {
    const r = this.range();
    if (r.from && r.to) return { from: r.from, to: r.to };
    const dates = this.docs().map(d => this.dateOf(d)).filter((d): d is Date => !!d).map(d => d.getTime());
    const min = dates.length ? new Date(Math.min(...dates)) : addDays(new Date(), -29);
    const max = dates.length ? new Date(Math.max(...dates)) : new Date();
    return { from: r.from ?? startOfDay(min), to: r.to ?? addDays(startOfDay(max), 1) };
  });

  private bucketKey(d: Date, g: Granularity): string {
    const s = g === 'week' ? startOfWeek(d) : startOfDay(d);
    return g === 'month' ? `${s.getFullYear()}-${s.getMonth()}` : toInputDate(s);
  }

  /** Dönemin tüm aralıkları (boş günler de 0 olarak görünsün) */
  private readonly buckets = computed(() => {
    const g = this.granularity();
    const { from, to } = this.trendBounds();
    const list: { key: string; label: string }[] = [];
    let cur = g === 'week' ? startOfWeek(from) : g === 'month' ? new Date(from.getFullYear(), from.getMonth(), 1) : startOfDay(from);
    let guard = 0;
    while (cur < to && guard++ < 1000) {
      const label = g === 'month' ? fmtMonth.format(cur) : fmtDay.format(cur);
      list.push({ key: this.bucketKey(cur, g), label });
      cur = g === 'month' ? new Date(cur.getFullYear(), cur.getMonth() + 1, 1) : addDays(cur, g === 'week' ? 7 : 1);
    }
    return list;
  });

  private series(docs: ReportDoc[]): number[] {
    const g = this.granularity();
    const counts = new Map<string, number>();
    for (const d of docs) {
      const date = this.dateOf(d);
      if (!date) continue;
      const k = this.bucketKey(date, g);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return this.buckets().map(b => counts.get(b.key) ?? 0);
  }

  readonly trendOption = computed(() => {
    const labels = this.buckets().map(b => b.label);
    return {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, data: ['Gelen Evrak', 'Giden Evrak'] },
      grid: { top: 16, left: 8, right: 16, bottom: 36, containLabel: true },
      xAxis: { type: 'category', data: labels, boundaryGap: false },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        this.lineSeries('Gelen Evrak', this.series(this.incoming()), C_IN),
        this.lineSeries('Giden Evrak', this.series(this.outgoing()), C_OUT),
      ],
    };
  });

  private lineSeries(name: string, data: number[], color: string) {
    return {
      name, type: 'line', smooth: true, symbol: 'circle', symbolSize: 6, data,
      itemStyle: { color }, lineStyle: { width: 2.5 },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: color + '33' }, { offset: 1, color: color + '00' }],
        },
      },
    };
  }

  /** Bu dönem / önceki dönem: aynı uzunluktaki iki aralığın başlıca ölçüleri */
  readonly compareOption = computed(() => {
    const cur = this.docs();
    const prev = this.prevDocs();
    const metrics: [string, (d: ReportDoc) => boolean][] = [
      ['Gelen', d => d.direction === 'in'],
      ['Giden', d => d.direction === 'out'],
      ['Teslim Alınan', d => d.direction === 'in' && d.delivered],
      ['Yayınlanan', d => d.direction === 'in' && d.published],
      ['İvedi', d => d.direction === 'in' && d.urgency != null && HIGH_URGENCY.has(d.urgency)],
    ];
    const bar = (name: string, list: ReportDoc[], color: string) => ({
      name, type: 'bar', barMaxWidth: 26, barGap: '15%',
      itemStyle: { color, borderRadius: [5, 5, 0, 0] },
      label: { show: true, position: 'top', fontSize: 11 },
      data: metrics.map(([, f]) => list.filter(f).length),
    });
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { bottom: 0 },
      grid: { top: 24, left: 8, right: 8, bottom: 36, containLabel: true },
      xAxis: { type: 'category', data: metrics.map(([n]) => n) },
      yAxis: { type: 'value', minInterval: 1 },
      series: [bar('Önceki dönem', prev, C_PREV), bar('Bu dönem', cur, C_IN)],
    };
  });

  /** Haftanın günü × saat: kayıtların yoğunlaştığı saatler (kayıt tarihine göre) */
  readonly heatmapOption = computed(() => {
    const grid = new Map<string, number>();
    let max = 0;
    for (const d of this.docs()) {
      if (!d.createdDate) continue;
      const day = (d.createdDate.getDay() + 6) % 7;
      const k = `${day}-${d.createdDate.getHours()}`;
      const v = (grid.get(k) ?? 0) + 1;
      grid.set(k, v);
      max = Math.max(max, v);
    }
    const data: [number, number, number][] = [];
    for (let day = 0; day < 7; day++) for (let h = 0; h < 24; h++) data.push([h, day, grid.get(`${day}-${h}`) ?? 0]);
    return {
      tooltip: {
        position: 'top',
        formatter: (p: any) => `${WEEKDAYS[p.value[1]]} ${String(p.value[0]).padStart(2, '0')}:00 · <b>${p.value[2]}</b> evrak`,
      },
      grid: { top: 8, left: 8, right: 8, bottom: 56, containLabel: true },
      xAxis: { type: 'category', data: [...Array(24).keys()].map(h => String(h).padStart(2, '0')), splitArea: { show: false } },
      yAxis: { type: 'category', data: WEEKDAYS, inverse: true },
      visualMap: {
        min: 0, max: Math.max(1, max), calculable: false, orient: 'horizontal', left: 'center', bottom: 0,
        itemHeight: 140, itemWidth: 10, text: ['Yoğun', 'Az'],
        inRange: { color: ['#f0f9ff', '#7dd3fc', '#0369a1', '#0c4a6e'] },
      },
      series: [{
        type: 'heatmap', data, itemStyle: { borderColor: 'rgba(255,255,255,0.6)', borderWidth: 1, borderRadius: 3 },
        emphasis: { itemStyle: { shadowBlur: 6, shadowColor: 'rgba(3,105,161,0.4)' } },
      }],
    };
  });

  // ---------------------------------------------------------------- Kırılım kartları
  private urgencyItems(docs: ReportDoc[]): Item[] {
    const counts = countBy(docs, d => String(d.urgency ?? ''));
    const items: Item[] = URGENCY_ORDER.map(u => ({
      name: UrgencyDegreeLabels[u], value: counts.find(c => c.name === String(u))?.value ?? 0, color: URGENCY_COLORS[u],
    }));
    const unknown = docs.filter(d => d.urgency == null || !URGENCY_ORDER.includes(d.urgency)).length;
    if (unknown) items.push({ name: 'Belirtilmemiş', value: unknown, color: '#cbd5e1' });
    return items.filter(i => i.value);
  }

  private securityItems(docs: ReportDoc[]): Item[] {
    const items: Item[] = SECURITY_ORDER.map((s, i) => ({
      name: SecurityDegreeLabels[s], value: docs.filter(d => d.security === s).length, color: SECURITY_COLORS[i],
    }));
    const unknown = docs.filter(d => d.security == null || !SECURITY_ORDER.includes(d.security)).length;
    if (unknown) items.push({ name: 'Belirtilmemiş', value: unknown, color: '#cbd5e1' });
    return items.filter(i => i.value);
  }

  readonly overviewBreakdowns = computed<Breakdown[]>(() => {
    const inc = this.incoming();
    return [
      { id: 'ov-status', title: 'Gelen Evrak Durumu', icon: 'donut_large', kind: 'donut', items: countBy(inc, d => d.statusLabel) },
      { id: 'ov-urgency', title: 'İvedilik Dağılımı', icon: 'bolt', kind: 'bar', items: this.urgencyItems(this.docs()) },
    ];
  });

  readonly incomingBreakdowns = computed<Breakdown[]>(() => {
    const inc = this.incoming();
    return [
      { id: 'in-unit', title: 'Birimlere Göre', icon: 'apartment', kind: 'hbar', items: top(countBy(inc, d => d.departmentName), 12) },
      { id: 'in-inst', title: 'Gönderen Kurumlar', icon: 'account_balance', kind: 'hbar', items: top(countBy(inc, d => d.institutionName), 12) },
      { id: 'in-urgency', title: 'İvedilik', icon: 'bolt', kind: 'bar', items: this.urgencyItems(inc) },
      { id: 'in-security', title: 'Gizlilik Derecesi', icon: 'lock', kind: 'donut', items: this.securityItems(inc) },
      { id: 'in-type', title: 'Evrak Türü', icon: 'description', kind: 'hbar', items: top(countBy(inc, d => d.typeLabel), 10) },
      { id: 'in-insttype', title: 'Gönderen Türü', icon: 'public', kind: 'donut', items: countBy(inc, d => d.institutionType) },
      { id: 'in-publish', title: 'Atlas Yayın Durumu', icon: 'cloud_upload', kind: 'donut', items: countBy(inc, d => d.publishLabel) },
      { id: 'in-delivery', title: 'Teslim Durumu', icon: 'inventory_2', kind: 'donut',
        items: [
          { name: 'Teslim Alındı', value: inc.filter(d => d.delivered).length, color: '#22c55e' },
          { name: 'Bekliyor', value: inc.filter(d => !d.delivered).length, color: '#f59e0b' },
        ].filter(i => i.value) },
      { id: 'in-action', title: 'Gereği / Bilgi', icon: 'assignment', kind: 'donut', items: countBy(inc, d => d.actionLabel) },
      { id: 'in-lang', title: 'Dil', icon: 'translate', kind: 'hbar', items: top(countBy(inc, d => d.languageName), 10) },
      { id: 'in-ecopy', title: 'Elektronik Kopya', icon: 'picture_as_pdf', kind: 'donut',
        items: countBy(inc, d => d.electronicCopy === true ? 'Var' : d.electronicCopy === false ? 'Yok' : 'Belirtilmemiş') },
      { id: 'in-creator', title: 'Kaydı Yapan Personel', icon: 'badge', kind: 'hbar', items: top(countBy(inc, d => d.createdUserName), 10) },
    ];
  });

  readonly outgoingBreakdowns = computed<Breakdown[]>(() => {
    const out = this.outgoing();
    return [
      { id: 'out-inst', title: 'Alıcı Kurumlar', icon: 'account_balance', kind: 'hbar', items: top(countBy(out, d => d.institutionName), 12) },
      { id: 'out-unit', title: 'Gönderen Birim', icon: 'apartment', kind: 'hbar', items: top(countBy(out, d => d.departmentName), 12) },
      { id: 'out-status', title: 'Durum', icon: 'donut_large', kind: 'donut', items: countBy(out, d => d.statusLabel) },
      { id: 'out-urgency', title: 'İvedilik', icon: 'bolt', kind: 'bar', items: this.urgencyItems(out) },
      { id: 'out-security', title: 'Gizlilik Derecesi', icon: 'lock', kind: 'donut', items: this.securityItems(out) },
      { id: 'out-type', title: 'Evrak Türü', icon: 'description', kind: 'donut', items: countBy(out, d => d.typeLabel) },
      { id: 'out-insttype', title: 'Alıcı Türü', icon: 'public', kind: 'donut', items: countBy(out, d => d.institutionType) },
      { id: 'out-source', title: 'Kayıt Kaynağı', icon: 'hub', kind: 'donut', items: countBy(out, d => d.sourceLabel) },
      { id: 'out-action', title: 'Gereği / Bilgi', icon: 'assignment', kind: 'donut', items: countBy(out, d => d.actionLabel) },
      { id: 'out-creator', title: 'Kaydı Yapan Personel', icon: 'badge', kind: 'hbar', items: top(countBy(out, d => d.createdUserName), 10) },
    ];
  });

  readonly incomingTrendOption = computed(() => this.directionTrend(this.incoming(), C_IN, 'Gelen Evrak'));
  readonly outgoingTrendOption = computed(() => this.directionTrend(this.outgoing(), C_OUT, 'Giden Evrak'));

  private directionTrend(docs: ReportDoc[], color: string, name: string) {
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { top: 16, left: 8, right: 16, bottom: 8, containLabel: true },
      xAxis: { type: 'category', data: this.buckets().map(b => b.label) },
      yAxis: { type: 'value', minInterval: 1 },
      series: [{ name, type: 'bar', barMaxWidth: 22, data: this.series(docs), itemStyle: { color, borderRadius: [4, 4, 0, 0] } }],
    };
  }

  /** Kart başına görünüm: grafik ya da tablo */
  private readonly tableViews = signal<Set<string>>(new Set());

  isTable(id: string): boolean {
    return this.tableViews().has(id);
  }

  setView(id: string, table: boolean): void {
    this.tableViews.update(s => {
      const next = new Set(s);
      if (table) next.add(id); else next.delete(id);
      return next;
    });
  }

  totalOf(items: Item[]): number {
    return items.reduce((s, i) => s + i.value, 0);
  }

  pctOf(value: number, items: Item[]): number {
    return pct(value, this.totalOf(items));
  }

  /** Kırılım kartının grafiği; seçenekler kart başına önbelleğe alınır (her değişiklik algılamasında yeniden kurulmasın) */
  private readonly optionCache = new WeakMap<Item[], Record<string, any>>();

  breakdownOption(b: Breakdown): Record<string, any> {
    const cached = this.optionCache.get(b.items);
    if (cached) return cached;
    const colored = b.items.map((i, idx) => ({ ...i, color: i.color ?? PALETTE[idx % PALETTE.length] }));
    let option: Record<string, any>;

    if (b.kind === 'donut') {
      option = {
        tooltip: { trigger: 'item', formatter: '{b}: <b>{c}</b> (%{d})' },
        legend: { type: 'scroll', bottom: 0, icon: 'circle', itemWidth: 9, itemHeight: 9 },
        series: [{
          type: 'pie', radius: ['48%', '72%'], center: ['50%', '44%'], avoidLabelOverlap: true,
          itemStyle: { borderColor: 'rgba(255,255,255,0.9)', borderWidth: 2, borderRadius: 4 },
          label: { show: true, position: 'center', formatter: () => `${this.totalOf(b.items)}`, fontSize: 22, fontWeight: 700 },
          emphasis: { label: { show: true, formatter: '{b}\n{c}', fontSize: 14 } },
          data: colored.map(i => ({ name: i.name, value: i.value, itemStyle: { color: i.color } })),
        }],
      };
    } else if (b.kind === 'hbar') {
      // Yatay çubuklar tek renk (petrol); yalnızca bilinmeyen / Diğer kalemi kendi gri rengini taşır
      const rows = [...b.items].reverse();
      option = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { top: 4, left: 8, right: 36, bottom: 4, containLabel: true },
        xAxis: { type: 'value', minInterval: 1, splitLine: { show: false }, axisLabel: { show: false } },
        yAxis: {
          type: 'category', data: rows.map(i => i.name), axisTick: { show: false },
          axisLabel: { width: 150, overflow: 'truncate' },
        },
        series: [{
          type: 'bar', barMaxWidth: 16,
          data: rows.map(i => i.color ? { value: i.value, itemStyle: { color: i.color } } : i.value),
          itemStyle: { color: C_IN, borderRadius: [0, 5, 5, 0] },
          label: { show: true, position: 'right', fontSize: 11, fontWeight: 600 },
        }],
      };
    } else {
      option = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { top: 24, left: 8, right: 8, bottom: 4, containLabel: true },
        xAxis: { type: 'category', data: colored.map(i => i.name), axisTick: { show: false }, axisLabel: { interval: 0, fontSize: 11 } },
        yAxis: { type: 'value', minInterval: 1 },
        series: [{
          type: 'bar', barMaxWidth: 34,
          data: colored.map(i => ({ value: i.value, itemStyle: { color: i.color, borderRadius: [5, 5, 0, 0] } })),
          label: { show: true, position: 'top', fontSize: 11, fontWeight: 600 },
        }],
      };
    }
    this.optionCache.set(b.items, option);
    return option;
  }

  chartHeight(b: Breakdown): number {
    return b.kind === 'hbar' ? Math.max(180, b.items.length * 28 + 16) : 260;
  }

  exportBreakdown(b: Breakdown): void {
    const total = this.totalOf(b.items);
    downloadCsv(`${b.title}.csv`, [b.title, 'Adet', 'Oran (%)'], b.items.map(i => [i.name, i.value, pct(i.value, total)]));
  }

  // ---------------------------------------------------------------- Birim karşılaştırma
  readonly unitRows = computed<UnitRow[]>(() => {
    const map = new Map<string, UnitRow>();
    for (const d of this.docs()) {
      const id = d.departmentId ?? '-';
      const r = map.get(id) ?? {
        id, name: d.departmentName, incoming: 0, delivered: 0, pending: 0, rate: 0, urgent: 0, published: 0, outgoing: 0, total: 0,
      };
      if (d.direction === 'in') {
        r.incoming++;
        if (d.delivered) r.delivered++; else r.pending++;
        if (d.published) r.published++;
        if (d.urgency != null && HIGH_URGENCY.has(d.urgency)) r.urgent++;
      } else {
        r.outgoing++;
      }
      r.total++;
      map.set(id, r);
    }
    for (const r of map.values()) r.rate = pct(r.delivered, r.incoming);
    return [...map.values()];
  });

  readonly unitSort = signal<UnitSort>('total');
  readonly unitSortDir = signal<'asc' | 'desc'>('desc');

  readonly sortedUnits = computed(() => {
    const col = this.unitSort();
    const dir = this.unitSortDir() === 'asc' ? 1 : -1;
    return [...this.unitRows()].sort((a, b) => {
      const diff = col === 'name' ? a.name.localeCompare(b.name, 'tr') : (a[col] as number) - (b[col] as number);
      return diff * dir || a.name.localeCompare(b.name, 'tr');
    });
  });

  sortUnits(col: UnitSort): void {
    if (this.unitSort() === col) this.unitSortDir.update(d => d === 'asc' ? 'desc' : 'asc');
    else { this.unitSort.set(col); this.unitSortDir.set(col === 'name' ? 'asc' : 'desc'); }
  }

  unitSortIcon(col: UnitSort): string {
    return this.unitSort() !== col ? 'unfold_more' : this.unitSortDir() === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  readonly unitTotals = computed(() => this.unitRows().reduce((t, r) => ({
    incoming: t.incoming + r.incoming, delivered: t.delivered + r.delivered, pending: t.pending + r.pending,
    urgent: t.urgent + r.urgent, published: t.published + r.published, outgoing: t.outgoing + r.outgoing, total: t.total + r.total,
  }), { incoming: 0, delivered: 0, pending: 0, urgent: 0, published: 0, outgoing: 0, total: 0 }));

  /** Birimlerin teslim durumu: en yoğun 12 birim, teslim alınan + bekleyen yığılmış */
  readonly unitStackOption = computed(() => {
    const rows = [...this.unitRows()].filter(r => r.incoming).sort((a, b) => b.incoming - a.incoming).slice(0, 12).reverse();
    const bar = (name: string, data: number[], color: string, radius: number[]) => ({
      name, type: 'bar', stack: 'in', barMaxWidth: 18, data, itemStyle: { color, borderRadius: radius },
      label: { show: true, fontSize: 10, formatter: (p: any) => p.value || '' },
    });
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { bottom: 0 },
      grid: { top: 8, left: 8, right: 16, bottom: 32, containLabel: true },
      xAxis: { type: 'value', minInterval: 1 },
      yAxis: { type: 'category', data: rows.map(r => r.name), axisLabel: { width: 170, overflow: 'truncate' } },
      series: [
        bar('Teslim Alınan', rows.map(r => r.delivered), '#0369a1', [0, 0, 0, 0]),
        bar('Bekleyen', rows.map(r => r.pending), '#f59e0b', [0, 5, 5, 0]),
      ],
    };
  });

  readonly unitStackHeight = computed(() => Math.max(220, Math.min(12, this.unitRows().filter(r => r.incoming).length) * 32 + 50));

  /** Karşılaştırılacak birimler (en çok 6); boşsa en yoğun 3 birim */
  readonly compareUnits = signal<string[]>([]);

  readonly effectiveCompareUnits = computed(() => {
    const picked = this.compareUnits().slice(0, 6);
    if (picked.length) return picked;
    return [...this.unitRows()].filter(r => r.id !== '-').sort((a, b) => b.total - a.total).slice(0, 3).map(r => r.id);
  });

  readonly unitCompareOption = computed(() => {
    const rows = this.unitRows();
    const units = this.effectiveCompareUnits().map(id => rows.find(r => r.id === id)
      ?? { id, name: this.data()?.departments.find(d => d.id === id)?.name ?? id, incoming: 0, delivered: 0, pending: 0, urgent: 0, published: 0, outgoing: 0 } as UnitRow);
    const metrics: [string, keyof UnitRow][] = [
      ['Gelen', 'incoming'], ['Teslim Alınan', 'delivered'], ['Bekleyen', 'pending'],
      ['İvedi', 'urgent'], ['Yayınlanan', 'published'], ['Giden', 'outgoing'],
    ];
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { bottom: 0, type: 'scroll' },
      grid: { top: 24, left: 8, right: 8, bottom: 40, containLabel: true },
      xAxis: { type: 'category', data: metrics.map(([n]) => n) },
      yAxis: { type: 'value', minInterval: 1 },
      series: units.map((u, i) => ({
        name: u.name, type: 'bar', barMaxWidth: 20,
        itemStyle: { color: PALETTE[i % PALETTE.length], borderRadius: [4, 4, 0, 0] },
        data: metrics.map(([, k]) => u[k] as number),
      })),
    };
  });

  readonly unitCompareTrendOption = computed(() => {
    const ids = this.effectiveCompareUnits();
    const names = new Map(this.unitRows().map(r => [r.id, r.name]));
    return {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, type: 'scroll' },
      grid: { top: 16, left: 8, right: 16, bottom: 40, containLabel: true },
      xAxis: { type: 'category', data: this.buckets().map(b => b.label), boundaryGap: false },
      yAxis: { type: 'value', minInterval: 1 },
      series: ids.map((id, i) => ({
        name: names.get(id) ?? this.data()?.departments.find(d => d.id === id)?.name ?? id,
        type: 'line', smooth: true, symbol: 'circle', symbolSize: 5,
        itemStyle: { color: PALETTE[i % PALETTE.length] }, lineStyle: { width: 2 },
        data: this.series(this.incoming().filter(d => d.departmentId === id)),
      })),
    };
  });

  exportUnits(): void {
    downloadCsv('Birim Karşılaştırma.csv',
      ['Birim', 'Gelen', 'Teslim Alınan', 'Bekleyen', 'Teslim Oranı (%)', 'İvedi', 'Yayınlanan', 'Giden', 'Toplam'],
      this.sortedUnits().map(r => [r.name, r.incoming, r.delivered, r.pending, r.rate, r.urgent, r.published, r.outgoing, r.total]));
  }

  // ---------------------------------------------------------------- Personel
  readonly staffRows = computed<StaffRow[]>(() => {
    const map = new Map<string, StaffRow>();
    const row = (id: string, name: string) => {
      const r = map.get(id) ?? { id, name, incoming: 0, outgoing: 0, assignedOpen: 0, total: 0 };
      map.set(id, r);
      return r;
    };
    for (const d of this.docs()) {
      const r = row(d.createdUserId ?? '-', d.createdUserName);
      if (d.direction === 'in') r.incoming++; else r.outgoing++;
      r.total++;
    }
    // Atanan personel: teslim alınmamış gelen evrakın şu anki sorumlusu (İşleme Al)
    for (const d of this.incoming()) {
      if (d.delivered || d.assigneeName === '—') continue;
      row(`a:${d.assigneeName}`, d.assigneeName).assignedOpen++;
    }
    return [...map.values()].filter(r => r.total || r.assignedOpen);
  });

  readonly staffSort = signal<StaffSort>('total');
  readonly staffSortDir = signal<'asc' | 'desc'>('desc');

  readonly sortedStaff = computed(() => {
    const col = this.staffSort();
    const dir = this.staffSortDir() === 'asc' ? 1 : -1;
    return [...this.staffRows()].sort((a, b) => {
      const diff = col === 'name' ? a.name.localeCompare(b.name, 'tr') : (a[col] as number) - (b[col] as number);
      return diff * dir || a.name.localeCompare(b.name, 'tr');
    });
  });

  sortStaff(col: StaffSort): void {
    if (this.staffSort() === col) this.staffSortDir.update(d => d === 'asc' ? 'desc' : 'asc');
    else { this.staffSort.set(col); this.staffSortDir.set(col === 'name' ? 'asc' : 'desc'); }
  }

  staffSortIcon(col: StaffSort): string {
    return this.staffSort() !== col ? 'unfold_more' : this.staffSortDir() === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  readonly staffOption = computed(() => {
    const rows = [...this.staffRows()].filter(r => r.total).sort((a, b) => b.total - a.total).slice(0, 12).reverse();
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { bottom: 0 },
      grid: { top: 8, left: 8, right: 16, bottom: 32, containLabel: true },
      xAxis: { type: 'value', minInterval: 1 },
      yAxis: { type: 'category', data: rows.map(r => r.name), axisLabel: { width: 150, overflow: 'truncate' } },
      series: [
        { name: 'Gelen Kayıt', type: 'bar', stack: 's', barMaxWidth: 18, data: rows.map(r => r.incoming), itemStyle: { color: C_IN } },
        { name: 'Giden Kayıt', type: 'bar', stack: 's', barMaxWidth: 18, data: rows.map(r => r.outgoing), itemStyle: { color: C_OUT, borderRadius: [0, 5, 5, 0] } },
      ],
    };
  });

  readonly staffHeight = computed(() => Math.max(220, Math.min(12, this.staffRows().filter(r => r.total).length) * 32 + 50));

  exportStaff(): void {
    downloadCsv('Personel.csv', ['Personel', 'Gelen Kayıt', 'Giden Kayıt', 'Toplam Kayıt', 'Üzerindeki Açık Gelen Evrak'],
      this.sortedStaff().map(r => [r.name, r.incoming, r.outgoing, r.total, r.assignedOpen]));
  }

  // ---------------------------------------------------------------- Zarf
  readonly envelopes = computed<EnvelopeRow[]>(() => {
    const data = this.data();
    if (!data) return [];
    const r = this.range();
    const unit = this.unitFilter();
    return data.envelopes.filter(e => (!unit || e.departmentId === unit) && inRange(e.createdDate, r));
  });

  readonly envelopeBreakdowns = computed<Breakdown[]>(() => {
    const env = this.envelopes();
    const size = (n: number) => n <= 1 ? '1 evrak' : n <= 3 ? '2–3 evrak' : n <= 5 ? '4–5 evrak' : '6+ evrak';
    return [
      { id: 'env-status', title: 'Zarf Durumu', icon: 'donut_large', kind: 'donut', items: countBy(env, e => e.statusLabel) },
      { id: 'env-target', title: 'Gideceği Yer', icon: 'location_on', kind: 'hbar', items: top(countBy(env, e => e.institutionName), 12) },
      { id: 'env-unit', title: 'Hazırlayan Birim', icon: 'apartment', kind: 'hbar', items: top(countBy(env, e => e.departmentName), 10) },
      { id: 'env-size', title: 'Zarf Başına Evrak', icon: 'stacks', kind: 'bar',
        items: ['1 evrak', '2–3 evrak', '4–5 evrak', '6+ evrak'].map(name => ({ name, value: env.filter(e => size(e.documentCount) === name).length })).filter(i => i.value) },
    ];
  });

  readonly envelopeTrendOption = computed(() => {
    const g = this.granularity();
    const counts = new Map<string, number>();
    for (const e of this.envelopes()) {
      if (!e.createdDate) continue;
      const k = this.bucketKey(e.createdDate, g);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { top: 16, left: 8, right: 16, bottom: 8, containLabel: true },
      xAxis: { type: 'category', data: this.buckets().map(b => b.label) },
      yAxis: { type: 'value', minInterval: 1 },
      series: [{ name: 'Zarf', type: 'bar', barMaxWidth: 22, data: this.buckets().map(b => counts.get(b.key) ?? 0), itemStyle: { color: '#0c4a6e', borderRadius: [4, 4, 0, 0] } }],
    };
  });

  // ---------------------------------------------------------------- Detaylı Sorgu
  readonly qDirection = signal<'all' | Direction>('all');
  readonly qText = signal('');
  readonly qDateField = signal<DateField>('created');
  readonly qFrom = signal('');
  readonly qTo = signal('');
  readonly qUnits = signal<string[]>([]);
  readonly qInstitutions = signal<string[]>([]);
  readonly qInstTypes = signal<string[]>([]);
  readonly qUrgencies = signal<string[]>([]);
  readonly qSecurities = signal<string[]>([]);
  readonly qTypes = signal<string[]>([]);
  readonly qLanguages = signal<string[]>([]);
  readonly qStatuses = signal<string[]>([]);
  readonly qPublish = signal<string[]>([]);
  readonly qActions = signal<string[]>([]);
  readonly qCreators = signal<string[]>([]);
  readonly qDelivered = signal<'all' | 'yes' | 'no'>('all');
  readonly qGroup = signal<QueryGroup>('department');

  /** Seçenekler verideki gerçek değerlerden üretilir (olmayan bir değer listelenmez) */
  private distinct(pick: (d: ReportDoc) => string): MultiOption[] {
    const values = new Set((this.data()?.docs ?? []).map(pick));
    return [...values].sort((a, b) => a.localeCompare(b, 'tr')).map(v => ({ value: v, label: v }));
  }

  readonly qOptions = computed(() => ({
    institutions: (this.data()?.institutions ?? [])
      .filter(i => (this.data()?.docs ?? []).some(d => d.institutionId === i.id))
      .map(i => ({ value: i.id, label: i.name })),
    instTypes: this.distinct(d => d.institutionType),
    types: this.distinct(d => d.typeLabel),
    languages: this.distinct(d => d.languageName),
    statuses: this.distinct(d => d.statusLabel),
    publish: this.distinct(d => d.publishLabel).filter(o => o.value !== '—'),
    actions: this.distinct(d => d.actionLabel),
    creators: this.distinct(d => d.createdUserName),
    urgencies: URGENCY_ORDER.map(u => ({ value: String(u), label: UrgencyDegreeLabels[u] })),
    securities: SECURITY_ORDER.map(s => ({ value: String(s), label: SecurityDegreeLabels[s] })),
  }));

  readonly qActiveCount = computed(() => [
    this.qDirection() !== 'all', !!this.qText().trim(), !!this.qFrom(), !!this.qTo(), this.qDelivered() !== 'all',
    ...[this.qUnits, this.qInstitutions, this.qInstTypes, this.qUrgencies, this.qSecurities, this.qTypes,
      this.qLanguages, this.qStatuses, this.qPublish, this.qActions, this.qCreators].map(s => s().length > 0),
  ].filter(Boolean).length);

  resetQuery(): void {
    this.qDirection.set('all');
    this.qText.set('');
    this.qFrom.set('');
    this.qTo.set('');
    this.qDelivered.set('all');
    for (const s of [this.qUnits, this.qInstitutions, this.qInstTypes, this.qUrgencies, this.qSecurities, this.qTypes,
      this.qLanguages, this.qStatuses, this.qPublish, this.qActions, this.qCreators]) s.set([]);
    this.qPage.set(1);
  }

  toggleIn(list: WritableSignal<string[]>, value: string): void {
    list.update(l => l.includes(value) ? l.filter(v => v !== value) : [...l, value]);
    this.qPage.set(1);
  }

  readonly queryResults = computed(() => {
    const data = this.data();
    if (!data) return [];
    const text = this.qText().trim().toLocaleLowerCase('tr');
    const dir = this.qDirection();
    const range: Range = {
      from: fromInputDate(this.qFrom()),
      to: this.qTo() ? addDays(fromInputDate(this.qTo())!, 1) : null,
    };
    const field = this.qDateField();
    const has = (list: string[], v: string) => !list.length || list.includes(v);
    const units = this.qUnits(), insts = this.qInstitutions(), instTypes = this.qInstTypes(), urg = this.qUrgencies(),
      sec = this.qSecurities(), types = this.qTypes(), langs = this.qLanguages(), statuses = this.qStatuses(),
      pub = this.qPublish(), actions = this.qActions(), creators = this.qCreators(), delivered = this.qDelivered();

    return data.docs.filter(d =>
      (dir === 'all' || d.direction === dir)
      && (!text || d.searchText.includes(text))
      && inRange(field === 'created' ? d.createdDate : d.documentDate, range)
      && has(units, d.departmentId ?? '')
      && has(insts, d.institutionId ?? '')
      && has(instTypes, d.institutionType)
      && has(urg, String(d.urgency ?? ''))
      && has(sec, String(d.security ?? ''))
      && has(types, d.typeLabel)
      && has(langs, d.languageName)
      && has(statuses, d.statusLabel)
      && has(pub, d.publishLabel)
      && has(actions, d.actionLabel)
      && has(creators, d.createdUserName)
      && (delivered === 'all' || (delivered === 'yes') === d.delivered));
  });

  readonly querySummary = computed(() => {
    const r = this.queryResults();
    const inc = r.filter(d => d.direction === 'in');
    return {
      total: r.length,
      incoming: inc.length,
      outgoing: r.length - inc.length,
      delivered: r.filter(d => d.delivered).length,
      urgent: r.filter(d => d.urgency != null && HIGH_URGENCY.has(d.urgency)).length,
      units: new Set(r.map(d => d.departmentId)).size,
      institutions: new Set(r.map(d => d.institutionId).filter(Boolean)).size,
    };
  });

  readonly groupOptions: { id: QueryGroup; label: string }[] = [
    { id: 'department', label: 'Birim' },
    { id: 'institution', label: 'Kurum' },
    { id: 'institutionType', label: 'Kurum Türü' },
    { id: 'urgency', label: 'İvedilik' },
    { id: 'security', label: 'Gizlilik' },
    { id: 'type', label: 'Evrak Türü' },
    { id: 'status', label: 'Durum' },
    { id: 'publish', label: 'Yayın Durumu' },
    { id: 'action', label: 'Gereği / Bilgi' },
    { id: 'language', label: 'Dil' },
    { id: 'creator', label: 'Kaydı Yapan' },
    { id: 'direction', label: 'Yön' },
    { id: 'month', label: 'Ay' },
  ];

  readonly queryGroupItems = computed<Item[]>(() => {
    const r = this.queryResults();
    switch (this.qGroup()) {
      case 'department': return top(countBy(r, d => d.departmentName), 15);
      case 'institution': return top(countBy(r, d => d.institutionName), 15);
      case 'institutionType': return countBy(r, d => d.institutionType);
      case 'urgency': return this.urgencyItems(r);
      case 'security': return this.securityItems(r);
      case 'type': return top(countBy(r, d => d.typeLabel), 15);
      case 'status': return countBy(r, d => d.statusLabel);
      case 'publish': return countBy(r.filter(d => d.direction === 'in'), d => d.publishLabel);
      case 'action': return countBy(r, d => d.actionLabel);
      case 'language': return top(countBy(r, d => d.languageName), 15);
      case 'creator': return top(countBy(r, d => d.createdUserName), 15);
      case 'direction': return countBy(r, d => d.direction === 'in' ? 'Gelen' : 'Giden');
      case 'month': {
        const field = this.qDateField();
        const months = new Map<string, { label: string; value: number; t: number }>();
        for (const d of r) {
          const date = field === 'created' ? d.createdDate : d.documentDate;
          if (!date) continue;
          const k = `${date.getFullYear()}-${date.getMonth()}`;
          const m = months.get(k) ?? { label: fmtMonth.format(date), value: 0, t: new Date(date.getFullYear(), date.getMonth(), 1).getTime() };
          m.value++;
          months.set(k, m);
        }
        return [...months.values()].sort((a, b) => a.t - b.t).map(m => ({ name: m.label, value: m.value }));
      }
    }
  });

  readonly queryGroupBreakdown = computed<Breakdown>(() => {
    const g = this.qGroup();
    const label = this.groupOptions.find(o => o.id === g)?.label ?? '';
    const items = this.queryGroupItems();
    const kind: ChartKind = g === 'month' || g === 'urgency' || g === 'security' ? 'bar' : items.length > 6 ? 'hbar' : 'donut';
    return { id: 'q-group', title: `Sonuçların ${label} Dağılımı`, icon: 'bar_chart', kind, items };
  });

  readonly qSort = signal<QuerySort>('date');
  readonly qSortDir = signal<'asc' | 'desc'>('desc');
  readonly qPage = signal(1);
  readonly qPageSize = 25;

  readonly sortedResults = computed(() => {
    const col = this.qSort();
    const dir = this.qSortDir() === 'asc' ? 1 : -1;
    const field = this.qDateField();
    const urgencyRank = (d: ReportDoc) => d.urgency == null ? 99 : URGENCY_ORDER.indexOf(d.urgency);
    const value = (d: ReportDoc): string | number => {
      switch (col) {
        case 'no': return d.no;
        case 'direction': return d.direction;
        case 'date': return (field === 'created' ? d.createdDate : d.documentDate)?.getTime() ?? 0;
        case 'department': return d.departmentName;
        case 'institution': return d.institutionName;
        case 'urgency': return urgencyRank(d);
        case 'security': return d.security ?? 0;
        case 'status': return d.statusLabel;
      }
    };
    return [...this.queryResults()].sort((a, b) => {
      const x = value(a), y = value(b);
      const diff = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'tr');
      return diff * dir;
    });
  });

  readonly qTotalPages = computed(() => Math.max(1, Math.ceil(this.queryResults().length / this.qPageSize)));
  readonly qCurrentPage = computed(() => Math.min(this.qPage(), this.qTotalPages()));
  readonly pagedResults = computed(() => {
    const start = (this.qCurrentPage() - 1) * this.qPageSize;
    return this.sortedResults().slice(start, start + this.qPageSize);
  });
  readonly qPageNumbers = computed(() => {
    const total = this.qTotalPages();
    const cur = this.qCurrentPage();
    const list: number[] = [];
    for (let i = Math.max(1, cur - 2); i <= Math.min(total, cur + 2); i++) list.push(i);
    return list;
  });

  sortQuery(col: QuerySort): void {
    if (this.qSort() === col) this.qSortDir.update(d => d === 'asc' ? 'desc' : 'asc');
    else { this.qSort.set(col); this.qSortDir.set(col === 'date' ? 'desc' : 'asc'); }
    this.qPage.set(1);
  }

  querySortIcon(col: QuerySort): string {
    return this.qSort() !== col ? 'unfold_more' : this.qSortDir() === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  goToPage(p: number): void {
    this.qPage.set(Math.min(Math.max(1, p), this.qTotalPages()));
  }

  queryDate(d: ReportDoc): Date | null {
    return this.qDateField() === 'created' ? d.createdDate : d.documentDate;
  }

  urgencyColor(d: ReportDoc): string {
    return d.urgency != null ? URGENCY_COLORS[d.urgency] ?? '#94a3b8' : '#cbd5e1';
  }

  exportQuery(): void {
    const fmt = (d: Date | null) => d ? d.toLocaleDateString('tr-TR') : '';
    downloadCsv('Detaylı Sorgu.csv',
      ['Evrak No', 'Yön', 'Kayıt Tarihi', 'Belge Tarihi', 'Birim', 'Kurum', 'Kurum Türü', 'Konu', 'İvedilik', 'Gizlilik',
        'Evrak Türü', 'Dil', 'Durum', 'Yayın Durumu', 'Gereği / Bilgi', 'Kaydı Yapan', 'Atanan'],
      this.sortedResults().map(d => [
        d.no, d.direction === 'in' ? 'Gelen' : 'Giden', fmt(d.createdDate), fmt(d.documentDate), d.departmentName,
        d.institutionName, d.institutionType, d.subject, d.urgencyLabel, d.securityLabel, d.typeLabel, d.languageName,
        d.statusLabel, d.publishLabel, d.actionLabel, d.createdUserName, d.assigneeName,
      ]));
  }

  print(): void {
    window.print();
  }
}
