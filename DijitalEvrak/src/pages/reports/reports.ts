import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, signal, ViewChild, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as echarts from 'echarts';
import GenericModel from '../../../components/generic-model/generic-model';

interface RecentReport {
  name: string;
  type: string;
  createdBy: string;
  date: string;
  format: string;
  status: 'Hazır' | 'Oluşturuluyor' | 'Zamanlandı';
}

type Period = '7g' | '30g' | '90g';

@Component({
  imports: [
    GenericModel,
    CommonModule
  ],
  templateUrl: './reports.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Reports implements AfterViewInit {
  @ViewChild('trendChart') trendChartRef!: ElementRef;
  @ViewChild('statusChart') statusChartRef!: ElementRef;
  @ViewChild('departmentChart') departmentChartRef!: ElementRef;

  readonly selectedPeriod = signal<Period>('30g');

  readonly statusBadgeClass: Record<RecentReport['status'], string> = {
    'Hazır': 'badge-soft-success',
    'Oluşturuluyor': 'badge-soft-warning',
    'Zamanlandı': 'badge-soft-info'
  };

  readonly recentReports: RecentReport[] = [
    { name: 'Aylık Gelen Evrak Özeti', type: 'Gelen Evrak', createdBy: 'Bülent Kaya', date: '08.09.2026', format: 'PDF', status: 'Hazır' },
    { name: 'Giden Evrak Performans Raporu', type: 'Giden Evrak', createdBy: 'Tahsin Yıldız', date: '07.09.2026', format: 'Excel', status: 'Hazır' },
    { name: 'Birim Bazlı Yoğunluk Analizi', type: 'İstatistik', createdBy: 'Oral Demir', date: '05.09.2026', format: 'PDF', status: 'Hazır' },
    { name: 'Zimmet Devir Süreleri', type: 'Zimmet', createdBy: 'Sistem', date: '01.09.2026', format: 'Excel', status: 'Zamanlandı' },
    { name: 'Haftalık OCR İşlem Raporu', type: 'OCR', createdBy: 'Sistem', date: '30.08.2026', format: 'PDF', status: 'Oluşturuluyor' }
  ];

  setPeriod(period: Period) {
    this.selectedPeriod.set(period);
  }

  ngAfterViewInit() {
    this.renderTrendChart();
    this.renderStatusChart();
    this.renderDepartmentChart();
  }

  private renderTrendChart() {
    const chart = echarts.init(this.trendChartRef.nativeElement);
    const days = ['1 Eyl', '2 Eyl', '3 Eyl', '4 Eyl', '5 Eyl', '6 Eyl', '7 Eyl', '8 Eyl'];
    const incoming = [180, 210, 195, 240, 260, 190, 150, 237];
    const outgoing = [120, 140, 130, 165, 175, 110, 90, 168];

    chart.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['Gelen Evrak', 'Giden Evrak'], bottom: 0 },
      grid: { top: 20, left: '3%', right: '4%', bottom: 40, containLabel: true },
      xAxis: { type: 'category', data: days },
      yAxis: { type: 'value' },
      series: [
        {
          name: 'Gelen Evrak',
          type: 'line',
          smooth: true,
          data: incoming,
          itemStyle: { color: '#4a90e2' },
          areaStyle: { opacity: 0.08 }
        },
        {
          name: 'Giden Evrak',
          type: 'line',
          smooth: true,
          data: outgoing,
          itemStyle: { color: '#f5a623' },
          areaStyle: { opacity: 0.08 }
        }
      ]
    });
  }

  private renderStatusChart() {
    const chart = echarts.init(this.statusChartRef.nativeElement);

    chart.setOption({
      tooltip: { trigger: 'item', formatter: '{b}: {c} (%{d})' },
      legend: { bottom: 0 },
      series: [{
        type: 'pie',
        radius: ['45%', '70%'],
        avoidLabelOverlap: true,
        label: { show: false },
        data: [
          { name: 'Kaydı Tamamlanan', value: 221, itemStyle: { color: '#50bfa0' } },
          { name: 'Teslim Edilen', value: 56, itemStyle: { color: '#4a90e2' } },
          { name: 'OCR Kuyruğunda', value: 26, itemStyle: { color: '#f5a623' } },
          { name: 'Kurye Bekleyen', value: 14, itemStyle: { color: '#d0021b' } }
        ]
      }]
    });
  }

  private renderDepartmentChart() {
    const chart = echarts.init(this.departmentChartRef.nativeElement);
    const data = [
      { name: 'EÇGM', value: 18 },
      { name: 'DSGM', value: 15 },
      { name: 'KOGM', value: 12 },
      { name: 'TPGM', value: 11 },
      { name: 'BYMB', value: 9 }
    ];

    chart.setOption({
      tooltip: { trigger: 'item' },
      grid: { top: 10, left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: data.map(d => d.name) },
      series: [{
        type: 'bar',
        data: data.map(d => d.value),
        barWidth: 18,
        label: { show: true, position: 'right', fontSize: 12 },
        itemStyle: { color: '#9013fe' }
      }]
    });
  }
}
