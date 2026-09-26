import { Component, ChangeDetectionStrategy, ViewEncapsulation, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { MapWorld } from '../../map-world/map-world';
import { PendingChart } from '../pending-chart/pending-chart';
import { CenterChart } from '../center-chart/center-chart';
import { MissionChart } from '../mission-chart/mission-chart';
import { Currentdocument } from '../currentdocument/currentdocument';
import { StatusOverview } from '../status-overview/status-overview';
import { SmartRouting } from '../smart-routing/smart-routing';

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

/** Diplomatik Nota Sayıları satırı */
interface NotaRow {
  country: string;
  flag: string;
  /** Türkçe temsilcilik adı (satırda görünen) */
  mission: string;
  /** Resmi yabancı ad (ipucunda) */
  missionOfficial: string;
  incoming: number;
  outgoing: number;
}

// Diplomatik Nota Sayıları (veri bağlanana kadar örnek değerler)
const NOTA_ROWS: NotaRow[] = [
  { country: 'Almanya', flag: 'almanya', mission: 'Almanya Federal Cumhuriyeti Ankara Büyükelçiliği', missionOfficial: 'Botschaft der Bundesrepublik Deutschland Ankara', incoming: 28, outgoing: 35 },
  { country: 'Rusya', flag: 'rusya', mission: 'Rusya Federasyonu Ankara Büyükelçiliği', missionOfficial: 'Embassy of the Russian Federation in Ankara', incoming: 15, outgoing: 22 },
  { country: 'ABD', flag: 'abd', mission: 'Amerika Birleşik Devletleri Ankara Büyükelçiliği', missionOfficial: 'U.S. Embassy Ankara', incoming: 14, outgoing: 10 },
  { country: 'Birleşik Krallık', flag: 'eng', mission: 'Birleşik Krallık Ankara Büyükelçiliği', missionOfficial: 'British Embassy Ankara', incoming: 12, outgoing: 18 },
];

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
    CenterChart,
    MissionChart,
    Currentdocument,
    StatusOverview,
    SmartRouting
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
  pct(value: number, total: number): number {
    return total > 0 ? Math.round((value / total) * 100) : 0;
  }

  // ---- Diplomatik Nota Sayıları ----
  readonly notaRows = NOTA_ROWS;

  /** Gelen notaların toplam içindeki payı (dağılım çubuğu) */
  incomingShare(row: NotaRow): number {
    return this.pct(row.incoming, row.incoming + row.outgoing);
  }

  // ---- En Çok Bekleyen Evrakı Olan Birimler ----
  readonly pendingUnits = PENDING_UNITS;
  readonly #maxPending = Math.max(...PENDING_UNITS.map(u => u.pending), 1);

  /** Bekleyen sayısının listedeki en yüksek değere oranı (çubuk genişliği) */
  pendingShare(unit: PendingUnit): number {
    return this.pct(unit.pending, this.#maxPending);
  }

  readonly centerTab = signal<Direction>('incoming');
  readonly missionTab = signal<Direction>('incoming');
}
