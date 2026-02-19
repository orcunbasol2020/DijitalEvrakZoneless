import { ChangeDetectionStrategy, Component, computed, inject, ViewEncapsulation } from '@angular/core';
import { FlexiGridModule } from 'flexi-grid';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import GenericModel from '../../../../components/generic-model/generic-model';
import { RouterLink } from '@angular/router';
import { FlexiToastService } from 'flexi-toast';

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
    CommonModule,
    RouterLink
  ],
  templateUrl: './role.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Role {
  readonly result = httpResource<RoleModel[]>(() => "api/Roles/GetAll", {});
  readonly data = computed(() => this.result.value() ?? []);
  readonly loading = computed(() => this.result.isLoading());
  readonly #toast = inject(FlexiToastService);
  readonly #http = inject(HttpClient);

  showFilters = false;

  // Detay sayfasına yönlendirme
  goToDetail(id: string) {

  }

}


