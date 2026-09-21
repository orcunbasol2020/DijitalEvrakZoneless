import { ChangeDetectionStrategy, Component, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import GenericModel from '../../../../components/generic-model/generic-model';
import { BreadcrumbModel } from '../../layouts/breadcrumb/breadcrumb';
import { navigations } from '../../../navigation';
import { Common } from '../../../services/common';
import { httpResource } from '@angular/common/http';
import { FlexiGridModule } from 'flexi-grid';
import { FormsModule } from '@angular/forms';
import { NgStyle } from '@angular/common';
import { RouterLink } from '@angular/router';
import { RoleService } from '../../../services/role-service';
import { getUserAvatar } from '../../../services/user-avatar';

export interface RoleModel {
  id?: string;
  name: string;
  isActive: boolean;
  isDeleted: boolean;
  createdDate: string;
  updateDate: string;
  hasRole?: boolean;
}

@Component({
  imports: [
    GenericModel,
    FlexiGridModule,
    FormsModule,
    NgStyle,
    RouterLink
  ],
  templateUrl: './profile.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Profile {

  readonly search = signal<string>("");
  readonly navigations = computed(() => navigations);
  readonly user = computed(() => this.#common.user());
  readonly #common = inject(Common);
  readonly #roleService = inject(RoleService);

  readonly result = httpResource<RoleModel[]>(() => "api/Roles/GetAll", {});
  readonly data = computed(() =>
    (this.result.value() ?? []).map(r => ({ ...r, hasRole: this.#roleService.has(r.name) }))
  );
  readonly loading = computed(() => this.result.isLoading());
  readonly activeRoleCount = computed(() => this.data().filter(r => r.hasRole).length);

  showFilters = false;

  readonly userAvatar = computed(() => getUserAvatar(this.user(), 'assets/images/personel/oral.jpg'));
  readonly title = 'Kullanıcı Profili';

  constructor() {

  }


}
