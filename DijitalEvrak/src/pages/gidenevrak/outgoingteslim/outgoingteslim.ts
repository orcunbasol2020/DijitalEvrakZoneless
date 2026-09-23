import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { httpResource } from '@angular/common/http';
import GenericModel from '../../../../components/generic-model/generic-model';
import { FlexiToastService } from 'flexi-toast';
import { ZimmetStateService } from '../../../services/zimmet-state-service';
import { OutgoingDocumentService } from '../../../services/outgoingdocument';
import { OutgoingDocumentModel, OutgoingDocumentStatus } from '../../../models/outgoingdocument.model';
import { OutgoingDocumentAllocation } from '../../../services/outgoingdocumentallocation';
import { OutgoingDocumentAllocationModel } from '../../../models/outgoingdocumentallocation.model';
import { ExternalInstitutionModel } from '../../../services/external-institution';
import { DepartmentModel } from '../../../services/department';

// Giden evrak Teslim Bilgisi ekranı: yalnızca zimmetlenmiş / teslim edilmiş
// evraklar için açılır ve salt okunurdur. Evrak bilgisi, zimmetli/teslim alan
// kişi, zimmeti yapan ve tarih gösterilir; burada zimmetleme yapılmaz
// (zimmetleme Zimmetleme (outgoingzimmet) ekranında yapılır).
@Component({
  imports: [
    GenericModel,
    CommonModule
  ],
  templateUrl: './outgoingteslim.html',
  // Görsel dil Teslim Bilgisi (gidenzimmet) ekranıyla ortak; zm-* ve gz-* sınıfları oradan gelir.
  styleUrls: ['../zimmet/zimmet.css', '../gidenzimmet/gidenzimmet.css', './outgoingteslim.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Outgoingteslim implements OnInit {
  private outgoingDocumentService = inject(OutgoingDocumentService);
  private allocationService = inject(OutgoingDocumentAllocation);
  private state = inject(ZimmetStateService);
  private toast = inject(FlexiToastService);
  private router = inject(Router);

  readonly document = signal<OutgoingDocumentModel | null>(null);
  readonly loading = signal(false);
  // Sağ panel; evrak ve zimmet kaydı ikisi de gelene kadar tek bir yükleme
  // durumunda kalır (ekran titremesin diye).
  readonly infoLoading = signal(true);

  readonly statusLabelMap: Record<number, string> = {
    [OutgoingDocumentStatus.Taslak]: 'Ön Kayıt',
    [OutgoingDocumentStatus.Gonderildi]: 'Gönderildi',
    [OutgoingDocumentStatus.TeslimEdildi]: 'Teslim Edildi',
    [OutgoingDocumentStatus.Iade]: 'İade'
  };

  // Evrak özeti (koyu hero) üzerindeki durum rozeti; Teslim Bilgisi (zarf)
  // ekranındaki rozetle aynı "envelope-status-pill" stilini kullanır.
  readonly statusPillClassMap: Record<number, string> = {
    [OutgoingDocumentStatus.Taslak]: '',
    [OutgoingDocumentStatus.Gonderildi]: 'envelope-status-yeni',
    [OutgoingDocumentStatus.TeslimEdildi]: 'envelope-status-teslim',
    [OutgoingDocumentStatus.Iade]: 'envelope-status-iade'
  };

  readonly documentTypeLabelMap: Record<number, string> = {
    1: 'Nota',
    2: 'Evrak'
  };

  // Backend AllocationSourceEnum ile birebir: 1: Evrak Takip, 2: Atlas.
  readonly sourceLabelMap: Record<number, string> = {
    1: 'Evrak Takip',
    2: 'Atlas'
  };

  readonly institutionsResult = httpResource<ExternalInstitutionModel[]>(() => "api/ExternalInstitutions/GetAll");
  readonly departmentsResult = httpResource<DepartmentModel[]>(() => "api/Departments/GetAll");

  readonly senderDepartmentName = computed(() => {
    const departmentId = this.document()?.departmentId;
    if (!departmentId) return null;
    return (this.departmentsResult.value() ?? []).find(d => d.id === departmentId)?.name ?? null;
  });

  readonly receiverInstitutionName = computed(() => {
    const institutionId = this.document()?.externalInstitutonId;
    if (!institutionId) return null;
    return (this.institutionsResult.value() ?? []).find(i => i.id === institutionId)?.name ?? null;
  });

  // Dış kuruma teslim mi, iç kullanıcıya zimmet mi: evrağın alıcı kurumu varsa teslim dili kullanılır.
  readonly deliveredIsExternal = computed(() => !!this.document()?.externalInstitutonId);

  // Aktif zimmet kaydından okunan teslim bilgileri.
  readonly delivered = signal(false);
  readonly deliveredPersonName = signal<string | null>(null);
  readonly deliveredByPersonName = signal<string | null>(null);
  readonly deliveredDate = signal<string | Date | null>(null);

  ngOnInit(): void {
    const outgoingDocumentId = this.state.getOutgoingDocumentId();

    if (!outgoingDocumentId) {
      this.toast.showToast('Hata', 'Giden evrak bulunamadı', 'error');
      this.router.navigate(['/gidenevrak/outgoing']);
      return;
    }

    this.loadDocument(outgoingDocumentId);
  }

  private loadDocument(id: string): void {
    this.loading.set(true);

    this.outgoingDocumentService.getById(id).subscribe({
      next: (doc) => {
        this.document.set(doc);
        this.loading.set(false);
        this.loadDeliveryInfo(id);
      },
      error: () => {
        this.loading.set(false);
        this.infoLoading.set(false);
        this.toast.showToast('Hata', 'Evrak bulunamadı', 'error');
      }
    });
  }

  private loadDeliveryInfo(outgoingDocumentId: string): void {
    this.allocationService.getActiveByDocumentId(outgoingDocumentId).subscribe({
      next: (allocation) => {
        this.applyAllocation(allocation?.isActive ? allocation : null);
        this.infoLoading.set(false);
      },
      error: () => {
        this.applyAllocation(null);
        this.infoLoading.set(false);
      }
    });
  }

  private applyAllocation(allocation: OutgoingDocumentAllocationModel | null): void {
    this.delivered.set(!!allocation);
    this.deliveredPersonName.set(allocation?.fullName ?? null);
    this.deliveredByPersonName.set(allocation?.createdFullName ?? null);
    this.deliveredDate.set(allocation?.createdDate ?? null);
  }

  goBack(): void {
    this.state.clearOutgoingDocumentId();
    this.router.navigate(['/gidenevrak/outgoing']);
  }

  // Henüz zimmetlenmemiş evrak için: aynı evrak id'si ile zimmetleme ekranı açılır.
  goToZimmet(): void {
    this.router.navigate(['/gidenevrak/outgoingzimmet']);
  }
}
