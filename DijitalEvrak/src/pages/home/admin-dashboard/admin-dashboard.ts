import { Component, ChangeDetectionStrategy, ViewEncapsulation, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { MapWorld } from '../../map-world/map-world';
import { PendingChart } from '../pending-chart/pending-chart';
import { CenterChart } from '../center-chart/center-chart';
import { MissionChart } from '../mission-chart/mission-chart';
import { Currentdocument } from '../currentdocument/currentdocument';

type Direction = 'incoming' | 'outgoing';

interface StatCard {
  label: string;
  value: string;
  period: string;
  trend: number;
  icon: string;
  url: string;
  hint: string;
}

@Component({
  imports: [
    CommonModule,
    DatePipe,
    RouterLink,
    MapWorld,
    PendingChart,
    CenterChart,
    MissionChart,
    Currentdocument
  ],
  selector: 'app-admin-dashboard',
  standalone: true,
  templateUrl: './admin-dashboard.html',
  styleUrl: '../dashboard.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminDashboard {
  // ---- Üst şerit ----
  readonly today = new Date();

  /** Yenile butonu: veriler bağlanana kadar yalnızca "son güncelleme" zamanını tazeler. */
  readonly lastUpdated = signal(new Date());
  readonly refreshing = signal(false);

  refresh(): void {
    if (this.refreshing()) return;
    this.refreshing.set(true);
    setTimeout(() => {
      this.lastUpdated.set(new Date());
      this.refreshing.set(false);
    }, 600);
  }

  // ---- İstatistik kartları (veri bağlanana kadar örnek değerler) ----
  readonly stats: StatCard[] = [
    { label: 'BUGÜN GELEN / GİDEN', value: '237 / 168', period: 'Bugün', trend: 8.3, icon: 'document_scanner', url: '/documentlist', hint: 'Bugün kaydedilen gelen ve giden evrak' },
    { label: 'GELEN EVRAK', value: '24.580', period: 'Son 30 gün', trend: 12.5, icon: 'folder_open', url: '/documentlist', hint: 'Son 30 günde kaydedilen gelen evrak' },
    { label: 'GİDEN EVRAK', value: '15.320', period: 'Son 30 gün', trend: -2.1, icon: 'outbox', url: '/gidenevrak/outgoing', hint: 'Son 30 günde kaydedilen giden evrak' },
    { label: 'NOTA GELEN / GİDEN', value: '96 / 23', period: 'Bugün', trend: 15.7, icon: 'history_edu', url: '/documentlist', hint: 'Bugün işlenen diplomatik notalar' },
  ];

  // ---- Kart sekmeleri: her kartın kendi durumu var, biri diğerini etkilemez ----
  readonly statusTab = signal<Direction>('incoming');
  readonly centerTab = signal<Direction>('incoming');
  readonly missionTab = signal<Direction>('incoming');
}
