import { ChangeDetectionStrategy, Component, inject, signal, ViewEncapsulation } from '@angular/core';
import GenericModel from '../../../components/generic-model/generic-model';
import { Common } from '../../services/common';
import { BreadcrumbModel } from '../layouts/breadcrumb/breadcrumb';
import { RoleService } from '../../services/role-service';
import { AdminDashboard } from './admin-dashboard/admin-dashboard';
import GelenEvrakDashboard from './gelen-evrak-dashboard/gelen-evrak-dashboard';
import OnKayitDashboard from './on-kayit-dashboard/on-kayit-dashboard';
import BirimDashboard from './birim-dashboard/birim-dashboard';
import { CommonModule } from '@angular/common';

@Component({
  imports: [
    GenericModel,
    AdminDashboard,
    GelenEvrakDashboard,
    OnKayitDashboard,
    BirimDashboard,
    CommonModule
  ],
  templateUrl: './home.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Home {
  //readonly #common = inject(Common);

  constructor(public roleService: RoleService) {
    //console.log(roleService.roles[0])
   // this.#common.set([{ title: 'Kontrol Paneli', url: '/', icon: 'home' }]);
  }
}
