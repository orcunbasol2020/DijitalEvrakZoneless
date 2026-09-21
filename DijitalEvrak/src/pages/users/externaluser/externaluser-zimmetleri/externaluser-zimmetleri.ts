import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import GenericModel from '../../../../../components/generic-model/generic-model';
import { FlexiToastService } from 'flexi-toast';
import { DocumentAllocation } from '../../../../services/documentallocation';
import { DocumentAllocationModel } from '../../../../models/documentallocation.model';
import { ExternalUserService, ExternalUserModel } from '../../../../services/external-user';
import { ExternalInstitution } from '../../../../services/external-institution';

@Component({
  imports: [
    GenericModel,
    CommonModule
  ],
  templateUrl: './externaluser-zimmetleri.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ExternaluserZimmetleri implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly allocationService = inject(DocumentAllocation);
  private readonly externalUserService = inject(ExternalUserService);
  private readonly externalInstitutionService = inject(ExternalInstitution);
  private readonly toast = inject(FlexiToastService);

  readonly loading = signal(false);
  readonly person = signal<ExternalUserModel | null>(null);
  readonly institutionName = signal<string | null>(null);
  readonly allocations = signal<DocumentAllocationModel[]>([]);

  readonly totalCount = computed(() => this.allocations().length);

  readonly expandedId = signal<string | null>(null);
  readonly detailHistory = signal<DocumentAllocationModel[]>([]);
  readonly detailLoading = signal(false);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');

    if (!id) {
      this.toast.showToast('Hata', 'Personel bulunamadı', 'error');
      return;
    }

    this.load(id);
  }

  load(id: string): void {
    this.loading.set(true);
    this.expandedId.set(null);
    this.detailHistory.set([]);

    this.externalUserService.getExternalUserById(id).subscribe({
      next: (person) => {
        this.person.set(person);

        if (person.externalInstitutionId) {
          this.externalInstitutionService.getExternalInstitutionById(person.externalInstitutionId).subscribe({
            next: (institution) => this.institutionName.set(institution.name),
            error: () => this.institutionName.set(null)
          });
        }
      },
      error: () => this.person.set(null)
    });

    this.allocationService.getActiveByUserId(id).subscribe({
      next: (allocations) => {
        this.allocations.set(allocations.filter(a => !a.isDeleted));
        this.loading.set(false);
      },
      error: () => {
        this.allocations.set([]);
        this.loading.set(false);
        this.toast.showToast('Hata', 'Zimmetli evraklar yüklenemedi', 'error');
      }
    });
  }

  toggleDetail(item: DocumentAllocationModel): void {
    if (this.expandedId() === item.incomingDocumentId) {
      this.expandedId.set(null);
      this.detailHistory.set([]);
      return;
    }

    this.expandedId.set(item.incomingDocumentId);
    this.detailHistory.set([]);
    this.detailLoading.set(true);

    this.allocationService.getByDocumentId(item.incomingDocumentId).subscribe({
      next: (history) => {
        const sorted = [...history]
          .filter(h => !h.isDeleted)
          .sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime());
        this.detailHistory.set(sorted);
        this.detailLoading.set(false);
      },
      error: () => {
        this.detailHistory.set([]);
        this.detailLoading.set(false);
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/externaluser']);
  }
}
