import { ChangeDetectionStrategy, Component, computed, ViewEncapsulation } from '@angular/core';
import GenericModel from '../../../../../components/generic-model/generic-model';
import { FlexiGridModule } from 'flexi-grid';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { httpResource } from '@angular/common/http';

export interface RoleModel {
  id?: string;
  name: string;
  isActive: boolean;
  isDeleted: boolean;
  createdDate: string;
  updateDate: string;
}

@Component({
  imports: [
    GenericModel,
    FlexiGridModule,
    FormsModule,
    CommonModule
  ],
  templateUrl: './role.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Role {
  readonly result = httpResource<RoleModel[]>(() => "api/Roles/GetAll", {});
  readonly data = computed(() => this.result.value() ?? []);
  readonly loading = computed(() => this.result.isLoading());

  showFilters = false;
}
