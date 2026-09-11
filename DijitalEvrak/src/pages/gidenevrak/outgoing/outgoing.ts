import {
  ChangeDetectionStrategy,
  Component,
  signal,
  ViewEncapsulation,
  computed,
  inject,
  effect
} from '@angular/core';
import { FlexiGridModule } from 'flexi-grid';
import { Router, RouterLink } from '@angular/router';
import GenericModel from '../../../../components/generic-model/generic-model';
import { CommonModule } from '@angular/common';
import { FlexiToastService } from 'flexi-toast';
import { FormsModule } from '@angular/forms';
import { IncomingDocumentService } from '../../../services/incomingdocument';
import { OutgoingDocumentService } from '../../../services/outgoingdocument';
import { OutgoingDocumentModel, OutgoingDocumentStatus } from '../../../models/outgoingdocument.model';
import { Common } from '../../../services/common';
import { ZimmetStateService } from '../../../services/zimmet-state-service';

@Component({
  imports: [
    FlexiGridModule,
    GenericModel,
    RouterLink,
    FormsModule,
    CommonModule
  ],
  templateUrl: './outgoing.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Outgoing {
  readonly #common = inject(Common);
  readonly user = computed(() => this.#common.user());
  readonly scanListData = signal<OutgoingDocumentModel[]>([]);
  readonly documentsResourceSig = signal<any>(null);
  readonly #toast = inject(FlexiToastService);
  private readonly router = inject(Router);
  // NOT: "Süreçler" satır aksiyonu hâlâ IncomingDocumentService üzerinden
  // çalışıyor; OutgoingDocuments artık ayrı bir tablo/servis olduğu için bu
  // id'lerle doğru şekilde eşleşmeyebilir. Giden evrağa özel bir süreç ekranı
  // netleşene kadar davranışı değiştirilmedi. "Zimmet" aksiyonu ise artık
  // /gidenevrak/outgoingzimmet üzerinden OutgoingDocumentAllocations'a gidiyor.
  private readonly incomingDocumentService = inject(IncomingDocumentService);
  private readonly outgoingDocumentService = inject(OutgoingDocumentService);
  private readonly zimmetState = inject(ZimmetStateService);
  readonly loading = computed(() => this.documentsResourceSig()?.isLoading?.() ?? false);

  readonly statusLabelMap: Record<number, string> = {
    [OutgoingDocumentStatus.Taslak]: 'Taslak',
    [OutgoingDocumentStatus.Gonderildi]: 'Gönderildi',
    [OutgoingDocumentStatus.TeslimEdildi]: 'Teslim Edildi',
    [OutgoingDocumentStatus.Iade]: 'İade'
  };

  readonly statusBadgeStyle: Record<number, string> = {
    [OutgoingDocumentStatus.Taslak]: 'bg-secondary-subtle text-secondary border border-secondary-subtle',
    [OutgoingDocumentStatus.Gonderildi]: 'bg-info-subtle text-info border border-info-subtle',
    [OutgoingDocumentStatus.TeslimEdildi]: 'bg-success-subtle text-success border border-success-subtle',
    [OutgoingDocumentStatus.Iade]: 'bg-warning-subtle text-warning border border-warning-subtle'
  };

  showFilters = false;

  private emptyToastShown = false;

  constructor() {
    this.setupDocumentsEffect();
    this.loadDocuments();
  }

  get currentUserId(): string | undefined {
    return this.user()?.id;
  }

  private setupDocumentsEffect(): void {
    effect(() => {
      const res = this.documentsResourceSig();
      if (!res || res.isLoading?.()) return;

      const docs = res.value?.();

      if (!docs || docs.length === 0) {
        if (!this.emptyToastShown) {
          this.#toast.showToast('Uyarı', 'Herhangi bir belge bulunamadı');
          this.emptyToastShown = true;
        }
        this.scanListData.set([]);
        return;
      }

      this.emptyToastShown = false;
      this.scanListData.set(docs);
    });
  }

  loadDocuments(): void {
    this.documentsResourceSig.set(
      this.outgoingDocumentService.getAll()
    );
  }

  toggleFilter() {
    this.showFilters = !this.showFilters;
  }

  goToProcess(id: string) {
    this.incomingDocumentService.setSelectedIncomingDocument(id);
    this.router.navigate(['/surecler']);
  }

  goToZimmet(id: string) {
    this.zimmetState.setOutgoingDocumentId(id);
    this.router.navigate(['/gidenevrak/outgoingzimmet']);
  }

  delete(id: string) {
    this.#toast.showSwal(
      'Giden Evrakı Sil?',
      'Giden evrakı silmek istiyor musunuz?',
      'Sil',
      () => {
        this.outgoingDocumentService.deleteOutgoingDocument(id).subscribe(() => {
          this.loadDocuments();
        });
      }
    );
  }

}
