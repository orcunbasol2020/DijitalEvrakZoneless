import { HttpClient, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, ViewEncapsulation } from '@angular/core';
import { ExternalInstitutionModel } from '../../../services/external-institution';
import { FlexiToastService } from 'flexi-toast';
import GenericModel from '../../../../components/generic-model/generic-model';
import { FlexiGridModule } from 'flexi-grid';
import { RouterLink } from '@angular/router';

@Component({
  imports: [
    GenericModel,
    FlexiGridModule,
    RouterLink
  ],
  templateUrl: './external-institutions.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ExternalInstitutions {
  readonly result = httpResource<ExternalInstitutionModel[]>(() => "api/ExternalInstitutions/GetAll");
  readonly data = computed(() => this.result.value() ?? []);
  readonly loading = computed(() => this.result.isLoading());
  readonly #toast = inject(FlexiToastService);
  readonly #http = inject(HttpClient);
  // Modal veya filtre açma durumu
  showFilters = false;

  typeMap: any = {
    1: 'Misyon',
    2: 'Kurum',
    3: 'Şahıs'
  };
}


