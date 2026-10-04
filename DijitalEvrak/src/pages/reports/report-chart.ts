import { Directive, ElementRef, OnDestroy, afterNextRender, effect, inject, input, signal } from '@angular/core';
import * as echarts from 'echarts';

type Option = echarts.EChartsCoreOption & Record<string, any>;

/** Sitenin teması <html data-theme="dark"> ile değişir */
function isDarkTheme(): boolean {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

/**
 * ECharts grafiği: [reportChart]="option". Seçenek değişince grafik güncellenir,
 * kap boyutu değişince yeniden boyutlanır, tema değişince yazı / çizgi renkleri uyarlanır.
 * Renk paleti ve seriler bileşende kurulur; burada yalnızca temaya bağlı ortak ayarlar var.
 */
@Directive({ selector: '[reportChart]', standalone: true })
export class ReportChart implements OnDestroy {
  readonly reportChart = input.required<Option>();

  private readonly el = inject(ElementRef<HTMLElement>);
  private chart: echarts.ECharts | null = null;
  private resizeObserver?: ResizeObserver;
  private themeObserver?: MutationObserver;
  private readonly dark = signal(isDarkTheme());
  private readonly ready = signal(false);

  constructor() {
    afterNextRender(() => {
      this.chart = echarts.init(this.el.nativeElement, undefined, { renderer: 'canvas' });
      this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
      this.resizeObserver.observe(this.el.nativeElement);
      this.themeObserver = new MutationObserver(() => this.dark.set(isDarkTheme()));
      this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      this.ready.set(true);
    });

    effect(() => {
      const option = this.reportChart();
      const dark = this.dark();
      if (!this.ready() || !this.chart) return;
      this.chart.setOption(this.themed(option, dark), { notMerge: true });
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.themeObserver?.disconnect();
    this.chart?.dispose();
  }

  private themed(option: Option, dark: boolean): Option {
    const text = dark ? '#cbd5e1' : '#475569';
    const muted = dark ? '#94a3b8' : '#64748b';
    const line = dark ? 'rgba(148, 163, 184, 0.16)' : '#eef2f7';
    const axis = (a: any) => a && ({
      ...a,
      axisLabel: { color: muted, fontSize: 11, ...a.axisLabel },
      axisLine: { lineStyle: { color: line }, ...a.axisLine },
      splitLine: { lineStyle: { color: line }, ...a.splitLine },
    });
    const axes = (a: any) => Array.isArray(a) ? a.map(axis) : axis(a);

    return {
      backgroundColor: 'transparent',
      textStyle: { fontFamily: 'inherit', color: text },
      animationDuration: 500,
      ...option,
      tooltip: option['tooltip'] && {
        backgroundColor: dark ? '#1e293b' : '#fff',
        borderColor: dark ? 'rgba(148, 163, 184, 0.24)' : '#e2e8f0',
        textStyle: { color: dark ? '#e2e8f0' : '#1e293b', fontSize: 12 },
        ...option['tooltip'],
      },
      legend: option['legend'] && { textStyle: { color: text, fontSize: 12 }, ...option['legend'] },
      xAxis: axes(option['xAxis']),
      yAxis: axes(option['yAxis']),
    };
  }
}
