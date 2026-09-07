import {
  ChangeDetectionStrategy,
  Component,
  signal,
  ViewEncapsulation,
  computed,
  inject,
  effect
} from '@angular/core';
import { FlexiGridFilterDataModel, FlexiGridModule } from 'flexi-grid';
import { Router, RouterLink } from '@angular/router';
import GenericModel from '../../../../components/generic-model/generic-model';
import { CommonModule, NgStyle } from '@angular/common';
import { FlexiToastService } from 'flexi-toast';
import { FormsModule } from '@angular/forms';
import { IncomingDocumentService } from '../../../services/incomingdocument';
import { IncomingDocumentModel } from '../../../models/incoming-document/incoming-document.model';
import { DocumentAssignmentService } from '../../../services/documentassignment';
import { identity } from 'rxjs';
import { Common } from '../../../services/common';

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
  selectedOcrFilter = 'completed';
  private assignmentService = inject(DocumentAssignmentService);
  readonly #common = inject(Common);
  readonly user = computed(() => this.#common.user());
  readonly scanListData = signal<IncomingDocumentModel[]>([]);
  readonly documentsResourceSig = signal<any>(null);
  readonly #toast = inject(FlexiToastService);
  private readonly router = inject(Router);
  private readonly incomingDocumentService = inject(IncomingDocumentService);
  readonly loading = computed(() => this.documentsResourceSig()?.isLoading?.() ?? false);

  showFilters = false;
  modalVisible = false;

  private emptyToastShown = false;


  personList = [
    { id: 0, name: 'Personel Seçiniz' },
    { id: '0e73004e-f243-414e-86eb-77cc21dc7454', name: 'Bahadır Tunçay' },
    { id: '0e73004e-f243-414e-86eb-77cc21dc7455', name: 'Bülent Arslan' },
    { id: '0e73004e-f243-414e-86eb-77cc21dc7453', name: 'Oral Akçakoyun' },
    { id: '0e73004e-f243-414e-86eb-77cc21dc7452', name: 'Ömer Ersoy' },
    { id: '0e73004e-f243-414e-86eb-77cc21dc7448', name: 'Yener Şahin' },
    { id: '0e73004e-f243-414e-86eb-77cc21dc7451', name: 'Murat Kale' }
  ];

  readonly personFilter = signal<FlexiGridFilterDataModel[]>([
    { name: 'Bahadır Tunçay', value: 'Bahadır Tunçay' },
    { name: 'Bülent Arslan', value: 'Bülent Arslan' },
    { name: 'Oral Akçakoyun', value: 'Oral Akçakoyun' },
    { name: 'Ömer Ersoy', value: 'Ömer Ersoy' },
    { name: 'Yener Şahin', value: 'Yener Şahin' },
    { name: 'Murat Kale', value: 'Murat Kale' }
  ]);

  readonly ocrFilter = signal<FlexiGridFilterDataModel[]>([
    { name: 'Tamamlanmış', value: '1' },
    { name: 'Beklemede', value: '0' },
    { name: 'Beklemede', value: '2' }
  ]);

  selectedPerson: any = null;
  activeDocId: string | null = null;

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

      let mapped = docs.map((item: IncomingDocumentModel) => ({
        ...item,
        assignmentStatus: item.currentAssignmentUserId
          ? (item.currentAssignmentUserId === this.currentUserId ? 'assignedToMe' : 'assignedToOther')
          : 'unassigned',
        ocrStr: (item.status ?? 0).toString()
      }));


      this.scanListData.set(mapped);

    });
  }
  loadDocuments(): void {
    this.documentsResourceSig.set(
      this.incomingDocumentService.getIncomingDocumentsByDirection("outgoing")
    );
  }

  openPersonModal(docId: string) {
    this.activeDocId = docId;
    this.selectedPerson = this.personList[0];
    this.modalVisible = true;
  }

  closePersonModal() {
    this.modalVisible = false;
  }

  savePerson() {
    //console.log('Evrak ID:', this.activeDocId);
    if (this.selectedPerson?.id && this.selectedPerson.id !== 0) {

      if (!this.activeDocId) {
        this.#toast.showToast(
          'Bilgi',
          'Evrak bulunamadı.',
          'info'
        );
        return;
      }
      this.assignmentService.createAssignment({
        documentId: this.activeDocId,
        userId: this.selectedPerson.id
      }).subscribe({
        next: () => {
          this.modalVisible = false;
          this.loadDocuments();
        },
        error: () => {
          this.#toast.showToast('Hata', 'Atama oluşturulamadı', 'error');
        }
      });


    }
    else {
      this.#toast.showToast('Bilgi', 'Atama yapmak istediğiniz personeli seçiniz.', 'info');
    }
  }

  toggleFilter() {
    this.showFilters = !this.showFilters;
  }



  goToDetail(id: string) {

    const currentUserId = this.user()?.id;

    if (!currentUserId) {
      this.#toast.showToast('Hata', 'Kullanıcı bulunamadı', 'error');
      return;
    }
    //console.log(id + " user id : "+ currentUserId);

    this.assignmentService.createAssignment({
      documentId: id,
      userId: currentUserId
    }).subscribe({
      next: () => {
        this.incomingDocumentService.setSelectedIncomingDocument(id);
        this.incomingDocumentService.setIncomingDocumentUpdateType('1');
        this.router.navigate(['/evrakkayit']);
      },
      error: () => {
        this.#toast.showToast('Hata', 'Atama oluşturulamadı', 'error');
      }
    });

  }

  goToProcess(id: string) {
    this.incomingDocumentService.setSelectedIncomingDocument(id);
    this.router.navigate(['/surecler']);
  }


  goToZimmet(id: string) {
    this.incomingDocumentService.setZimmetIncomingDocument(id);
    this.router.navigate(['/zimmet']);
  }

  delete(id: string) {
    this.#toast.showSwal(
      'Taranmış Evrakı Sil?',
      'Taranmış evrakı silmek istiyor musunuz?',
      'Sil',
      () => {
        this.incomingDocumentService.deleteIncomingDocument(id).subscribe(() => {
          // ✅ silme sonrası da resource yenile
          this.documentsResourceSig.set(
            this.incomingDocumentService.getIncomingDocumentsByStatus(this.selectedOcrFilter)
          );
        });
      }
    );
  }

}
