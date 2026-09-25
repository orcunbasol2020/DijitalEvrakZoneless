import { Component, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import * as echarts from 'echarts';

@Component({
  selector: 'mission-chart',
  standalone: true,
  templateUrl: './mission-chart.html'
})
export class MissionChart implements AfterViewInit {

  @ViewChild('chart') chartContainer!: ElementRef;
  chart!: echarts.ECharts;

  missions = [
    { name: 'Berlin Büyükelçiliği', value: 120 },
    { name: 'New York Başkonsolosluğu', value: 95 },
    { name: 'Londra Büyükelçiliği', value: 80 },
    { name: 'Bağdat Büyükelçiliği', value: 72 },
    { name: 'Bakü Büyükelçiliği', value: 65 },
    { name: 'Brüksel Büyükelçiliği', value: 58 },
    { name: 'Paris Büyükelçiliği', value: 52 },
    { name: 'Moskova Büyükelçiliği', value: 47 },
    { name: 'Dubai Başkonsolosluğu', value: 43 },
    { name: 'Pekin Büyükelçiliği', value: 40 }
  ];

  ngAfterViewInit() {
    this.chart = echarts.init(this.chartContainer.nativeElement);

    const sorted = [...this.missions]
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    this.chart.setOption({
      tooltip: {
        trigger: 'item',
        formatter: (p: any) =>
          `<b>${p.name}</b><br/>Evrak Sayısı: ${p.value}`
      },

      grid: {
        top: 10,
        bottom: 10,
        left: '5%',
        right: '5%',
        containLabel: true
      },

      xAxis: { type: 'value' },

      yAxis: {
        type: 'category',
        data: sorted.map(x => x.name),
        axisLabel: {
          fontSize: 11,
          formatter: (v: string) =>
            v.length > 40 ? v.slice(0, 40) + '...' : v
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
        // Yoğunluğa göre petrol tonu: yüksek = koyu, düşük = açık
        itemStyle: {
          color: (params: any) => {
            const value = params.value;
            if (value >= 100) return '#0c4a6e';  // çok yoğun
            if (value >= 70) return '#0369a1';   // orta
            return '#38bdf8';                    // düşük
          },
          borderRadius: [4, 4, 0, 0]
        },

        barWidth: 22
      }]
    });
  }
}
