import { ChangeDetectionStrategy, Component, computed, ViewEncapsulation } from '@angular/core';
import GenericModel from '../../../../components/generic-model/generic-model';
import { httpResource } from '@angular/common/http';
import { FlexiGridModule } from 'flexi-grid';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

export interface DepartmentModel {
  id?: string;
  name: string;
  shortName:string;
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
  templateUrl: './departments.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Departments {
  readonly result = httpResource<DepartmentModel[]>(() => "api/Departments/GetAll", {});
  readonly data = computed(() => this.result.value() ?? []);
  readonly loading = computed(() => this.result.isLoading());

  showFilters = false;

}
