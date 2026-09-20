import { HttpClient, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, ViewEncapsulation } from '@angular/core';
import { FlexiGridModule } from 'flexi-grid';
import { Router, RouterLink } from '@angular/router';
import { FlexiToastService } from 'flexi-toast';
import { FormsModule } from '@angular/forms';
import GenericModel from '../../../../components/generic-model/generic-model';
import { CommonModule } from '@angular/common';
import { EnvelopeModel } from '../../../models/envelope.model';
import { ZimmetStateService } from '../../../services/zimmet-state-service';
import { EnvelopeService } from '../../../services/envelope';
import { Common } from '../../../services/common';
import { RoleService } from '../../../services/role-service';


@Component({
  imports: [
    GenericModel,
    FlexiGridModule,
    FormsModule,
    CommonModule
  ],
  templateUrl: './envelope.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Envelopes {
  readonly #common = inject(Common);
  readonly #roleService = inject(RoleService);
  // Yönetici hiçbir filtre göndermez (tüm zarfları görür); diğer kullanıcılar
  // kendi departmentId'siyle sınırlanır, böylece aynı birimdeki herkesin
  // oluşturduğu zarfları görür (sadece kendi oluşturduklarını değil).
  readonly result = httpResource<EnvelopeModel[]>(() => {
    const departmentId = this.#roleService.has('Yönetici') ? undefined : this.#common.user()?.departmentId;
    return departmentId
      ? `api/Envelopes/GetAll?departmentId=${encodeURIComponent(departmentId)}`
      : "api/Envelopes/GetAll";
  });
  readonly data = computed(() =>
    [...(this.result.value() ?? [])].sort(
      (a, b) => new Date(b.createdDate ?? 0).getTime() - new Date(a.createdDate ?? 0).getTime()
    )
  );
  readonly loading = computed(() => this.result.isLoading());
  readonly isBirimEvrakSorumlusu = computed(() => this.#roleService.has('Birim Evrak Sorumlusu'));
  readonly #toast = inject(FlexiToastService);
  readonly #http = inject(HttpClient);
  readonly #envelopeService = inject(EnvelopeService);
  // Modal veya filtre açma durumu
  showFilters = false;

  constructor(
    private router: Router,
    private state: ZimmetStateService) { }

  goToGidenZimmet(envelopeId: string) {
    this.state.setEnvelopeId(envelopeId);
    this.router.navigate(['/gidenzimmet']);
  }

  goToDetail(envelopeId: string) {
    this.#envelopeService.setSelectedEnvelope(envelopeId);
    this.router.navigate(['/ticket']);
  }
  deleteEnvelope(id: string) {
    this.#http.delete(`api/envelopes/${id}`).subscribe(() => {
      this.result.reload();
      this.#toast.showToast(
        'Bilgi',
        'Zarf Silindi.',
        'info'
      );
    });
  }

  createEnvelope2() {
    this.#toast.showToast(
      'Bilgi',
      'Zarf Silindi.',
      'info'
    );
  }
}