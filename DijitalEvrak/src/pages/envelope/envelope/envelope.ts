import { HttpClient, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { FlexiGridModule } from 'flexi-grid';
import { Router, RouterLink } from '@angular/router';
import { FlexiToastService } from 'flexi-toast';
import { FormsModule } from '@angular/forms';
import GenericModel from '../../../../components/generic-model/generic-model';
import { CommonModule } from '@angular/common';
import { EnvelopeModel, EnvelopeStatus, EnvelopeStatusBadgeClass, EnvelopeStatusIcon, EnvelopeStatusLabels } from '../../../models/envelope.model';
import { ZimmetStateService } from '../../../services/zimmet-state-service';
import { EnvelopeService } from '../../../services/envelope';
import { Common } from '../../../services/common';
import { RoleService } from '../../../services/role-service';
import { Department, DepartmentModel } from '../../../services/department';


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
  // Yönetici ve Giden Evrak rolündeki kullanıcılar hiçbir filtre göndermez
  // (tüm zarfları görür); diğer kullanıcılar kendi departmentId'siyle
  // sınırlanır, böylece aynı birimdeki herkesin oluşturduğu zarfları görür
  // (sadece kendi oluşturduklarını değil).
  readonly result = httpResource<EnvelopeModel[]>(() => {
    const departmentId = this.#roleService.hasAny(['Yönetici', 'Giden Evrak']) ? undefined : this.#common.user()?.departmentId;
    return departmentId
      ? `api/Envelopes/GetAll?departmentId=${encodeURIComponent(departmentId)}`
      : "api/Envelopes/GetAll";
  });
  readonly #departmentService = inject(Department);
  readonly departments = signal<DepartmentModel[]>([]);

  // "Ekleyen" sütunu için departmentId -> ad eşlemesi.
  readonly departmentNameMap = computed(() => {
    const map: Record<string, string> = {};
    for (const d of this.departments()) map[d.id] = d.name;
    return map;
  });

  // Şablonda enum değerleriyle karşılaştırma yapabilmek için dışa açılıyor.
  readonly EnvelopeStatus = EnvelopeStatus;
  readonly statusBadgeClassMap: Record<number, string> = EnvelopeStatusBadgeClass;
  readonly statusIconMap: Record<number, string> = EnvelopeStatusIcon;

  readonly data = computed(() => {
    const deptMap = this.departmentNameMap();
    return [...(this.result.value() ?? [])]
      .sort((a, b) => new Date(b.createdDate ?? 0).getTime() - new Date(a.createdDate ?? 0).getTime())
      .map(e => ({
        ...e,
        departmentName: (e.departmentId && deptMap[e.departmentId]) || '-',
        // Durum sütunu, filtre ve Excel dışa aktarımı ham sayı yerine etiketi kullansın.
        statusLabel: (e.status != null && EnvelopeStatusLabels[e.status]) || (e.status ?? '-')
      }));
  });
  readonly loading = computed(() => this.result.isLoading());
  readonly isBirimEvrakSorumlusu = computed(() => this.#roleService.has('Birim Evrak Sorumlusu'));
  // Giden Evrak rolündeki kullanıcılar tüm birimlerin zarflarını görebildiği için,
  // kendi biriminin kaydetmediği bir zarfta "Zarfı Teslim Et" yerine "Teslim Al"
  // ikonu gösteriliyor.
  readonly isGidenEvrakUser = computed(() => this.#roleService.has('Giden Evrak'));
  readonly ownDepartmentId = computed(() => this.#common.user()?.departmentId);
  readonly #toast = inject(FlexiToastService);
  readonly #http = inject(HttpClient);
  readonly #envelopeService = inject(EnvelopeService);
  // Modal veya filtre açma durumu
  showFilters = false;

  constructor(
    private router: Router,
    private state: ZimmetStateService) {
    this.loadDepartments();
  }

  private loadDepartments(): void {
    this.#departmentService.getDepartments().subscribe({
      next: (res) => this.departments.set(res),
      error: (err) => {
        console.error(err);
        this.#toast.showToast('Hata', 'Birimler yüklenemedi', 'error');
      }
    });
  }

  // Teslim edilmiş zarf: salt okunur Teslim Bilgisi ekranı.
  goToGidenZimmet(envelopeId: string) {
    this.state.setEnvelopeId(envelopeId);
    this.router.navigate(['/gidenzimmet']);
  }

  // Teslim Al / Teslim Et: QR okutma ekranına gidilir; etiket numarası query param
  // ile taşınarak zarf orada otomatik aranır ve ilgili sekme (Teslim Al = self,
  // Teslim Et = external) seçili gelir.
  goToZimmetScan(envelopeNo: string, mode: 'self' | 'external') {
    this.router.navigate(['/gidenevrak/zimmet'], { queryParams: { envelopeNo, mode } });
  }

  goToDetail(envelopeId: string) {
    this.#envelopeService.setSelectedEnvelope(envelopeId);
    this.router.navigate(['/ticket']);
  }

  // Ticket sayfası seçili zarf yoksa "Etiket Oluştur" formuyla açılır;
  // önceki bir "Detaya Git" seçimi kalmış olmasın diye önce temizlenir.
  goToCreate() {
    this.#envelopeService.clearSelectedEnvelope();
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
}