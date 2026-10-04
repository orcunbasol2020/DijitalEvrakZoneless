import { Component, ChangeDetectionStrategy, ElementRef, OnDestroy, afterNextRender, effect, input, signal, viewChild } from '@angular/core';
import * as echarts from 'echarts';
import worldMap from '../../assets/maps/world.json' assert { type: 'json' };
import { MissionCountry } from './mission-countries';

/** Haritada bir ülke: toplam evrak ve misyon kırılımı */
export interface MissionMapCountry extends MissionCountry {
  total: number;
  missions: { name: string; count: number }[];
}

type Ring = number[][];
interface Feature { properties: { name: string }; geometry: { type: string; coordinates: any } }

/** Halka alanı ve ağırlık merkezi (shoelace) */
function ringCentroid(ring: Ring): { area: number; c: [number, number] } {
  let a = 0, x = 0, y = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += f;
    x += (ring[j][0] + ring[i][0]) * f;
    y += (ring[j][1] + ring[i][1]) * f;
  }
  return a === 0 ? { area: 0, c: ring[0] as [number, number] } : { area: Math.abs(a / 2), c: [x / (3 * a), y / (3 * a)] };
}

/** Ülke işaretinin konumu: en büyük kara parçasının merkezi (denizaşırı topraklar işareti kaydırmasın) */
const CENTERS = new Map<string, [number, number]>();
for (const f of (worldMap as { features: Feature[] }).features) {
  const polygons: Ring[][] = f.geometry?.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry?.coordinates];
  // world.json'da boş parçalar var (ör. Çin'in bir parçası []); bunlar atlanır
  const best = (polygons ?? [])
    .filter(p => Array.isArray(p?.[0]) && p[0].length > 2)
    .map(p => ringCentroid(p[0]))
    .sort((a, b) => b.area - a.area)[0];
  if (best) CENTERS.set(f.properties.name, best.c);
}

const DEFAULT_CENTER: [number, number] = [20, 25];
const DEFAULT_ZOOM = 1.2;

function isDarkTheme(): boolean {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

/**
 * Misyon evrak yoğunluk haritası: ülke evrak sayısına göre renklenir, üzerindeki işaret
 * sayıyı gösterir (küçük ülkeler ve haritada çizilmeyenler de görünsün diye).
 * İpucunda ülkenin misyonları ayrı ayrı listelenir.
 */
@Component({
  selector: 'app-map-world',
  standalone: true,
  templateUrl: './map-world.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MapWorld implements OnDestroy {
  readonly countries = input<MissionMapCountry[]>([]);
  readonly loading = input(false);
  readonly failed = input(false);
  /** Veri yokken haritanın üstünde gösterilen not */
  readonly emptyText = input('');

  private readonly container = viewChild.required<ElementRef<HTMLElement>>('chartContainer');
  private chart: echarts.ECharts | null = null;
  private resizeObserver?: ResizeObserver;
  private themeObserver?: MutationObserver;
  private readonly dark = signal(isDarkTheme());
  private readonly ready = signal(false);

  constructor() {
    afterNextRender(() => {
      echarts.registerMap('world', worldMap as any);
      const el = this.container().nativeElement;
      this.chart = echarts.init(el);
      this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
      this.resizeObserver.observe(el);
      this.themeObserver = new MutationObserver(() => this.dark.set(isDarkTheme()));
      this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      this.ready.set(true);
    });

    effect(() => {
      const countries = this.countries();
      const dark = this.dark();
      if (!this.ready() || !this.chart) return;
      // Kullanıcının yakınlaştırması veri yenilenince korunur
      const geo = (this.chart.getOption()?.['geo'] as any[] | undefined)?.[0];
      this.chart.setOption(this.option(countries, dark, geo?.zoom ?? DEFAULT_ZOOM, geo?.center ?? DEFAULT_CENTER), { notMerge: true });
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.themeObserver?.disconnect();
    this.chart?.dispose();
  }

  private option(countries: MissionMapCountry[], dark: boolean, zoom: number, center: [number, number]) {
    const max = Math.max(1, ...countries.map(c => c.total));
    const size = (n: number) => 14 + 22 * Math.sqrt(n / max);

    const tooltip = (c: MissionMapCountry) => [
      `<b>${c.label}</b> · ${c.total} evrak`,
      ...c.missions.map(m => `<span style="opacity:.8">${m.name}</span>: <b>${m.count}</b>`),
    ].join('<br>');

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: dark ? '#1e293b' : '#fff',
        borderColor: dark ? 'rgba(148, 163, 184, 0.24)' : '#e2e8f0',
        textStyle: { color: dark ? '#e2e8f0' : '#1e293b', fontSize: 12 },
        formatter: (p: any) => (p.data?.country ? tooltip(p.data.country) : ''),
      },
      visualMap: {
        type: 'continuous',
        seriesIndex: 0,
        min: 0,
        max,
        left: 12,
        bottom: 12,
        itemHeight: 90,
        text: [String(max), '0'],
        textStyle: { color: dark ? '#cbd5e1' : '#475569', fontSize: 11 },
        calculable: false,
        inRange: { color: ['#bae6fd', '#0369a1', '#0c4a6e'] },
      },
      geo: {
        map: 'world',
        roam: true,
        scaleLimit: { min: 0.8, max: 12 },
        zoom,
        center,
        itemStyle: {
          areaColor: dark ? '#1e293b' : '#eef2f7',
          borderColor: dark ? '#334155' : '#cbd5e1',
          borderWidth: 0.5,
        },
        emphasis: { label: { show: false }, itemStyle: { areaColor: dark ? '#334155' : '#dbe3ec' } },
        select: { disabled: true },
      },
      series: [
        {
          type: 'map',
          geoIndex: 0,
          data: countries.filter(c => c.mapName).map(c => ({ name: c.mapName, value: c.total, country: c })),
        },
        {
          type: 'scatter',
          coordinateSystem: 'geo',
          symbol: 'circle',
          symbolSize: (v: number[]) => size(v[2]),
          itemStyle: { color: '#14b8a6', borderColor: '#fff', borderWidth: 1.5, shadowBlur: 6, shadowColor: 'rgba(15, 23, 42, 0.25)' },
          label: { show: true, formatter: (p: any) => p.value[2], color: '#fff', fontSize: 10, fontWeight: 700 },
          emphasis: { scale: 1.15 },
          data: countries
            .map(c => ({ c, at: c.coord ?? (c.mapName ? CENTERS.get(c.mapName) : undefined) }))
            .filter(x => x.at)
            .sort((a, b) => b.c.total - a.c.total)
            .map(({ c, at }) => ({ name: c.label, value: [...at!, c.total], country: c })),
        },
      ],
    };
  }

  zoomIn(): void {
    this.setZoom(z => Math.min(z * 1.25, 12));
  }

  zoomOut(): void {
    this.setZoom(z => Math.max(z * 0.8, 0.8));
  }

  resetZoom(): void {
    this.chart?.setOption({ geo: { zoom: DEFAULT_ZOOM, center: DEFAULT_CENTER } });
  }

  private setZoom(next: (zoom: number) => number): void {
    const geo = (this.chart?.getOption()?.['geo'] as any[] | undefined)?.[0];
    this.chart?.setOption({ geo: { zoom: next(geo?.zoom ?? DEFAULT_ZOOM) } });
  }
}
