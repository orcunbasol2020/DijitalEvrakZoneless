import { Component, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import * as echarts from 'echarts';

@Component({
  selector: 'pending-chart',
  standalone: true,
  templateUrl: './pending-chart.html'
})
export class PendingChart implements AfterViewInit {

  @ViewChild('chart') chartContainer!: ElementRef;
  chart!: echarts.ECharts;

  pendingData = [
    { name: 'Teslim Alınmayı', value: 32 },
    { name: 'Kurye Teslimi', value: 14 },
    { name: 'Nota', value: 9 },
    { name: 'Dış Kuruma Gönderilmeyi', value: 5 },
    { name: 'OCR Kuyruğunda', value: 17 },
    { name: 'Kayıt/İşlem', value: 28 }
  ];

ngAfterViewInit() {
  this.chart = echarts.init(this.chartContainer.nativeElement);

  // 🔥 Çoktan aza sıralama
  const sorted = [...this.pendingData].sort((a, b) => b.value - a.value);

  this.chart.setOption({
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => `${p.value}`
    },

    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },

    xAxis: {
      type: 'category',
      data: sorted.map(x => x.name),   // ← 🔥 BURAYA DİKKAT
      axisLabel: {
        rotate: 35,
        fontSize: 11
      }
    },

    yAxis: { type: 'value' },

    series: [{
      type: 'bar',
      data: sorted.map(x => x.value),  // ← 🔥 BURAYA DİKKAT

      label: {
        show: true,
        position: 'top',
        formatter: '{c}',
        fontSize: 12,
        color: '#333'
      },

      itemStyle: {
        color: (params: any) => {
          const palette = [
            '#4a90e2',
            '#50bfa0',
            '#f5a623',
            '#d0021b',
            '#9013fe',
            '#7ed321'
          ];
          return palette[params.dataIndex % palette.length];
        }
      },

      barWidth: 30
    }]
  });
}

}
