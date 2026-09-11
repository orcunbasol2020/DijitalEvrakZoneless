import { ChangeDetectionStrategy, Component, ViewEncapsulation, OnInit, inject, computed, ElementRef, ViewChild } from '@angular/core';
import GenericModel from '../../../../components/generic-model/generic-model';
import { FlexiGridModule } from 'flexi-grid';
import { RouterLink } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { SimpleAutocompleteComponent } from '../../simpleautocomplete/simpleautocomplete';
import { ExternalInstitution, ExternalInstitutionModel } from '../../../services/external-institution';
import { EnvelopeService } from '../../../services/envelope';
import { FlexiToastService } from 'flexi-toast';
import { EnvelopeModel } from '../../../models/envelope.model';
import { Common } from '../../../services/common';
import { ChangeDetectorRef } from '@angular/core';
import { PrintPreview } from '../../printpreview/printpreview';
import html2pdf from "html2pdf.js";
import { EnvelopeDocumentService } from '../../../services/envelopedocument';
import { EnvelopeDocumentModel } from '../../../models/envelopedocument.model';
import { firstValueFrom } from 'rxjs';
import { QRCodeComponent } from 'angularx-qrcode';

@Component({
  standalone: true,
  imports: [
    GenericModel,
    FlexiGridModule,
    FormsModule,
    ReactiveFormsModule,
    CommonModule,
    SimpleAutocompleteComponent,
    PrintPreview,
    QRCodeComponent
  ],
  templateUrl: './ticket.html',
  styleUrls: ['./ticket.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Ticket implements OnInit {
  previewOpen = false;
  private envelopeService = inject(EnvelopeService);
  private envelopeDocumentService = inject(EnvelopeDocumentService);
  readonly #toast = inject(FlexiToastService);
  private externalInstitutionService = inject(ExternalInstitution);
  externalInstitutionControl = new FormControl<ExternalInstitutionModel | null>(null);
  externalInstitutions: ExternalInstitutionModel[] = [];
  readonly #common = inject(Common);
  readonly user = computed(() => this.#common.user());
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('qrInput') qrInput!: ElementRef<HTMLInputElement>;
  documents: EnvelopeDocumentModel[] = [];
  selectedEnvelope: EnvelopeModel | null = null;
  // Zarflar listesinden "Detaya Git" ile gelindiğinde true olur;
  // yeni etiket oluşturma formu yerine mevcut zarfın özeti gösterilir.
  isViewMode = false;


  qrActive = false;      // QR okutma aktif mi

  // Evrak Ekle paneli göründüğü an imleç doğrudan QR alanında olsun diye
  // *ngIf render'ının tamamlanmasını bekleyip odaklanıyoruz.
  private focusQrInputSoon() {
    setTimeout(() => this.qrInput?.nativeElement.focus());
  }

  activateQr() {
    this.qrInput.nativeElement.focus();  // input’a odaklan
    this.qrActive = true;
    // sonra tekrar pasif yapmak 
    setTimeout(() => this.qrActive = false, 10000);
  }

  focusQrInput() {
    this.qrInput.nativeElement.focus();
    this.qrActive = true;

    // 3 saniye sonra aktifliği geri alabiliriz
    setTimeout(() => this.qrActive = false, 5000);
  }

  onQrKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      const qrValue = (event.target as HTMLInputElement).value.trim();
      if (!qrValue) return;

      // EnvelopeId zaten seçili veya başka bir değişkende tutuluyor olmalı
      const envelopeId = this.selectedEnvelope?.id;
      if (!envelopeId) {
        this.#toast.showToast('Uyarı', 'Önce bir zarf oluşturun ya da seçin', 'warning');
        return;
      }

      this.addDocumentByQr(qrValue, envelopeId);

      // Inputu temizle
      (event.target as HTMLInputElement).value = '';
    }
  }

  loadingTable = false;

  loading = false;

  async addDocumentByQr(qrCode: string, envelopeId: string) {

    if (!envelopeId) {
      console.error("EnvelopeId yok, belge eklenemiyor!");
      return;
    }

    const createdUserId = this.user()?.id;
    if (!createdUserId) {
      this.#toast.showToast('Hata', 'Kullanıcı bilgisi alınamadı', 'error');
      return;
    }

    try {

      this.loading = true;
      this.cdr.markForCheck();

      const newEnvelopeDoc: EnvelopeDocumentModel = {
        id: '',
        envelopeId: envelopeId,
        documentId: '',
        qrCode: qrCode,
        createdUserId: createdUserId,
      };

      const createdDoc = await firstValueFrom(
        this.envelopeDocumentService.createEnvelopeDocument(newEnvelopeDoc)
      );

      this.documents.push(createdDoc.data);
      this.#toast.showToast('Başarılı', 'Evrak zarfa eklendi', 'success');

    } catch (error) {
      this.#toast.showToast('Hata', 'Evrak eklenemedi. QR kodu kontrol ediniz.', 'error');
      console.error("Evrak ekleme hatası:", error);
    } finally {

      this.loading = false;
      this.cdr.markForCheck(); // kritik satır
    }
  }

  // Model tipini EnvelopeModel olarak ayarladık
  model: Partial<EnvelopeModel> = {
    externalInstitutionId: '',
    departmentId: undefined,
    createdByUserId: '',
    unitName: '',
    address: '',
    envelopeNo: ''
  };

  ngOnInit(): void {
    this.loadExternalInstitutions();

    const envelopeId = this.envelopeService.currentEnvelopeId;
    if (envelopeId) {
      this.loadEnvelopeDetail(envelopeId);
      this.envelopeService.clearSelectedEnvelope();
    }
  }

  private loadEnvelopeDetail(envelopeId: string) {
    this.envelopeService.getEnvelopeById(envelopeId).subscribe({
      next: (res: EnvelopeModel) => {
        if (res) {
          this.previewEnvelope = res;
          this.selectedEnvelope = res;
          this.isViewMode = true;
          this.cdr.markForCheck();
          this.focusQrInputSoon();
          this.loadEnvelopeDocuments(envelopeId);

          // GetById uçları, GetAll'ın aksine kurum adını (externalInstitutionName)
          // join'lemeden dönüyor; yalnızca id geldiği için burada ayrıca çekiyoruz.
          if (!res.externalInstitutionName && res.externalInstitutionId) {
            this.externalInstitutionService.getExternalInstitutionById(res.externalInstitutionId).subscribe({
              next: (institution) => {
                if (this.previewEnvelope === res) {
                  this.previewEnvelope = { ...res, externalInstitutionName: institution.name };
                  this.cdr.markForCheck();
                }
              }
            });
          }
        }
      },
      error: (err) => {
        this.#toast.showToast('Hata', 'Zarf bilgileri yüklenemedi', 'error');
        console.error(err);
      }
    });
  }

  private async loadEnvelopeDocuments(envelopeId: string) {
    this.loading = true;
    this.cdr.markForCheck();

    try {
      this.documents = await this.envelopeDocumentService.getEnvelopeDocumentsByEnvelopeId(envelopeId);
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  private loadExternalInstitutions() {
    this.externalInstitutionService.getExternalInstitutions().subscribe({
      next: (res) => {
        this.externalInstitutions = res;
      },
      error: (err) => {
        console.error(err);
      }
    });
  }

  previewEnvelope: EnvelopeModel | null = null;

  createEnvelope() {

    const userId = this.user()?.id;
    if (!userId) {
      this.#toast.showToast("Hata", "Kullanıcı bilgisi alınamadı", "error");
      return;
    }

    if (this.externalInstitutionControl.value) {
      this.model.externalInstitutionId = this.externalInstitutionControl.value.id;
    }
    this.model.createdByUserId = userId;
    this.model.departmentId = this.user()?.departmentId;

    //console.log(this.model);
    this.envelopeService.createEnvelope(this.model as EnvelopeModel).subscribe({
      next: (res: EnvelopeModel) => {
        if (res) {
          this.previewEnvelope = res;
          this.selectedEnvelope = res;
          this.cdr.markForCheck();
          this.focusQrInputSoon();
          this.#toast.showToast('Bilgi', 'Etiket Oluşturuldu', 'success');

          // Formu temizleme
          this.model = {
            id: '',
            envelopeNo: '',
            createdByUserId: '',
            externalInstitutionId: undefined,
            departmentId: undefined,
            unitName: '',
            address: ''
          };

          // Autocomplete kontrolünü temizle
          this.externalInstitutionControl.setValue(null);
        }
      },
      error: (err) => {
        this.#toast.showToast('Hata', 'Etiket oluşturulamadı', 'error');
        console.error(err);
      }
    });
  }

  previewData: any;

  openPreview() {
    if (!this.previewEnvelope) return;

    this.previewData = {
      ...this.previewEnvelope,
      departmentName: this.user()?.departmentName
    };

    this.previewOpen = true;
  }

  directPrint() {
    const element = document.getElementById('print-area');
    if (!element) return;

    const opt: any = {
      margin: 0,
      filename: 'zarf-etiketi.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 3, useCORS: true, scrollY: -window.scrollY },
      jsPDF: { unit: 'mm', format: [110, 106], orientation: 'landscape' }
    };

    html2pdf()
      .from(element)
      .set(opt)
      .outputPdf('blob')
      .then((pdfBlob: Blob) => {

        const blobUrl = URL.createObjectURL(pdfBlob);

        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = blobUrl;

        document.body.appendChild(iframe);

        iframe.onload = () => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        };
      });

  }

// Ticket component içinde
loadingRemove = false; // yeni değişken

async removeDocument(id: string) {
  try {
    this.loadingRemove = true;
    this.cdr.markForCheck();

    await firstValueFrom(this.envelopeDocumentService.removeEnvelopeDocument(id));

    // Evrak listesinden çıkar
    this.documents = this.documents.filter(x => x.id !== id);

  } catch (error) {
    this.#toast.showToast('Hata', 'Evrak çıkarılamadı', 'error');
    console.error(error);
  } finally {
    this.loadingRemove = false;
    this.cdr.markForCheck();
  }
}
}