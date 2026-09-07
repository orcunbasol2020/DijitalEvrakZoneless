import { Component, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import { MapWorld } from '../../map-world/map-world';
import { PendingChart } from '../pending-chart/pending-chart';
import { CenterChart } from '../center-chart/center-chart';
import { MissionChart } from '../mission-chart/mission-chart';
import { CommonModule } from '@angular/common';
import { Currentdocument } from '../currentdocument/currentdocument';


@Component({
  imports: [
    CommonModule,
    MapWorld,
    PendingChart,
    CenterChart,
    MissionChart,
    Currentdocument
  ],
  selector: 'app-admin-dashboard',
  standalone: true,
  templateUrl: './admin-dashboard.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminDashboard {
  selectedTab = 'incoming';
  setTab(tab: string) {
    this.selectedTab = tab;
  }
}
