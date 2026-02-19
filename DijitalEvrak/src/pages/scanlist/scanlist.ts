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
import GenericModel from '../../../components/generic-model/generic-model';
import { CommonModule, NgStyle } from '@angular/common';
import { FlexiToastService } from 'flexi-toast';
import { FormsModule } from '@angular/forms';
import { IncomingDocumentService } from '../../services/incomingdocument';
import { IncomingDocumentModel } from '../../models/incoming-document/incoming-document.model';

@Component({
  imports: [
    FlexiGridModule,
    GenericModel,
    RouterLink,
    NgStyle,
    FormsModule,
    CommonModule
  ],
  templateUrl: './scanlist.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Scanlist {
  // ✅ Combobox bununla oynuyor olacak
  selectedOcrFilter = 'completed';

  // ✅ Grid datası
  readonly scanListData = signal<IncomingDocumentModel[]>([]);

  // ✅ Resource signal (kritik fix)
  readonly documentsResourceSig = signal<any>(null);

  readonly #toast = inject(FlexiToastService);
  private readonly router = inject(Router);
  private readonly incomingDocumentService = inject(IncomingDocumentService);

  // ✅ Loading computed: signal üzerinden
  readonly loading = computed(() => this.documentsResourceSig()?.isLoading?.() ?? false);

  showFilters = false;
  modalVisible = false;

  private emptyToastShown = false;

  personList = [
    { id: 0, name: 'Personel Seçiniz' },
    { id: 1, name: 'Bahadır Tunçay' },
    { id: 2, name: 'Bülent Arslan' },
    { id: 3, name: 'Oral Akçakoyun' },
    { id: 4, name: 'Ömer Ersoy' },
    { id: 5, name: 'Yener Şahin' }
  ];

  readonly personFilter = signal<FlexiGridFilterDataModel[]>([
    { name: 'Bahadır Tunçay', value: 'Bahadır Tunçay' },
    { name: 'Bülent Arslan', value: 'Bülent Arslan' },
    { name: 'Oral Akçakoyun', value: 'Oral Akçakoyun' },
    { name: 'Yener Şahin', value: 'Yener Şahin' }
  ]);

  readonly ocrFilter = signal<FlexiGridFilterDataModel[]>([
    { name: 'Tamamlanmış', value: '1' },
    { name: 'Beklemede', value: '0' }
  ]);

  selectedPerson: any = null;
  activeDocId: string | null = null;

  constructor() {
    // ✅ İlk yükleme
    this.documentsResourceSig.set(
      this.incomingDocumentService.getIncomingDocumentsByStatus(this.selectedOcrFilter)
    );

    // ✅ Resource değişince veya iç value değişince çalışır
    effect(() => {
      const res = this.documentsResourceSig();
      if (!res) return;

      // loading ise bekle
      if (res.isLoading?.()) return;

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

      // ✅ Null-safe durum desteği
      this.scanListData.set(
        docs.map((item: IncomingDocumentModel) => ({
          ...item,
          ocrStr: (item.status ?? 0).toString()
        }))
      );
    });
  }

  // ✅ OCR filtre değiştiğinde yeni resource set et (kritik fix)
  onOcrFilterChange() {
    console.log('change başladı ... ' + this.selectedOcrFilter);

    this.emptyToastShown = false;

    this.documentsResourceSig.set(
      this.incomingDocumentService.getIncomingDocumentsByStatus(this.selectedOcrFilter)
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
    console.log('Evrak ID:', this.activeDocId);
    console.log('Seçilen Personel:', this.selectedPerson);
    this.modalVisible = false;
  }

  toggleFilter() {
    this.showFilters = !this.showFilters;
  }

  goToDetail(id: string) {
    this.incomingDocumentService.setSelectedIncomingDocument(id);
    this.incomingDocumentService.setIncomingDocumentUpdateType('1');
    this.router.navigate(['/evrakkayit']);
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
