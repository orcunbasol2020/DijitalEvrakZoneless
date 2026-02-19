import { ChangeDetectionStrategy, Component, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import GenericModel from '../../../../components/generic-model/generic-model';
import { BreadcrumbModel } from '../../layouts/breadcrumb/breadcrumb';
import { navigations } from '../../../navigation';
import { Common } from '../../../services/common';
import { httpResource } from '@angular/common/http';
import { FlexiGridModule } from 'flexi-grid';
import { FormsModule } from '@angular/forms';
import { NgStyle } from '@angular/common';

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
    NgStyle
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

  readonly result = httpResource<RoleModel[]>(() => "api/Roles/GetAll", {});
  readonly data = computed(() => this.result.value() ?? []);
  readonly loading = computed(() => this.result.isLoading());

  showFilters = false;

  readonly userAvatar = computed(() => {
    const name = this.user()?.name ?? '';

    switch (name) {
      case 'Bülent':
        return 'assets/images/personel/bulent.jpg';
      case 'Tahsin':
        return 'assets/images/personel/tahsin.jpg';
      default:
        return 'assets/images/personel/oral.jpg';
    }
  });
  readonly title = 'Kullanıcı Profili';

  constructor() {

  }


}
