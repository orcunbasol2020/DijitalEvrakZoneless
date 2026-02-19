import { Component, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import * as echarts from 'echarts';

@Component({
  selector: 'center-chart',
  standalone: true,
  templateUrl: './center-chart.html'
})
export class CenterChart implements AfterViewInit {

  @ViewChild('chart') chartContainer!: ElementRef;
  chart!: echarts.ECharts;

  centerUnits = [
    { name: 'Destek Hizmetleri Genel Müdürlüğü', value: 52 },
    { name: 'Bilim ve Teknoloji Politikaları Genel Müdürlüğü', value: 37 },
    { name: 'Dış Politika Danışma Kurulu', value: 21 },
    { name: 'BYLG Bakan Yardımcılığı', value: 16 },
    { name: 'Diplomatik Arşiv Genel Müdürlüğü', value: 29 },
    { name: 'Bilgi Teknolojileri Genel Müdürlüğü', value: 45 },
    { name: 'Enerji, Çevre ve Sınıraşan Sular Genel Müdürlüğü', value: 18 },
    { name: 'Bakanlık Sözcülüğü', value: 12 },
    { name: 'Basın ve Halkla İlişkiler Müşavirliği', value: 33 },
    { name: 'Diplomasi Akademisi Başkanlığı', value: 14 }
  ];

  ngAfterViewInit() {
    this.chart = echarts.init(this.chartContainer.nativeElement);

    const sorted = [...this.centerUnits]
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    this.chart.setOption({
      tooltip: {
        trigger: 'item',
        formatter: (p: any) =>
          `${p.value}`
      },

      grid: { top: 10, left: '3%', right: '4%', bottom: '3%', containLabel: true },

      // 🔥 YATAY BAR → Kategoriler Y ekseninde
      xAxis: { type: 'value' },
      yAxis: {
        type: 'category',
        data: sorted.map(x => x.name),
        axisLabel: {
          fontSize: 11,
          formatter: (v: string) =>
            v.length > 35 ? v.slice(0, 35) + '...' : v
        }
      },

      series: [{
        type: 'bar',
        data: sorted.map(x => x.value),
        // 🔥 Değerleri barın sağına yaz
        label: {
          show: true,
          position: 'right',
          formatter: '{c}',   // sadece value
          fontSize: 12,
          color: '#333'
        },
        // 🔥 Kritik seviyeye göre renk
        itemStyle: {
          color: (params: any) => {
            const value = params.value;
            if (value >= 40) return '#d0021b';  // kırmızı (yüksek yoğunluk)
            if (value >= 20) return '#f5a623';  // turuncu (orta)
            return '#50bfa0';                   // yeşil (düşük)
          }
        },

        barWidth: 22
      }]
    });
  }
}
