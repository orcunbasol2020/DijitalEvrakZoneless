import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FlexiGridModule } from 'flexi-grid';
import GenericModel from '../../../../components/generic-model/generic-model';
import { FlexiToastService } from 'flexi-toast';
import { EnvelopeDocumentService } from '../../../services/envelopedocument';
import { IncomingDocumentService } from '../../../services/incomingdocument';
import { forkJoin } from 'rxjs';
import { IncomingDocumentPreRegisterModel } from '../../../models/incoming-document/incomingdocument-pregister.model';
import { ZimmetStateService } from '../../../services/zimmet-state-service';
import { EnvelopeModel } from '../../../models/envelope.model';
import { EnvelopeService } from '../../../services/envelope';
import { ExternalInstitution, ExternalInstitutionModel } from '../../../services/external-institution';
import { Common } from '../../../services/common';
import { UserModel } from '../../users/users';
import { httpResource } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

@Component({
  imports: [
    GenericModel,
    CommonModule,
    FlexiGridModule,
    FormsModule
  ],
  templateUrl: './gidenzimmet.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Gidenzimmet implements OnInit {
  private envelopeService = inject(EnvelopeService);
  private externalService = inject(ExternalInstitution);
  private state = inject(ZimmetStateService);
  private envelopeDocumentService = inject(EnvelopeDocumentService);
  private incomingDocumentService = inject(IncomingDocumentService);
  private toast = inject(FlexiToastService);
  readonly #common = inject(Common);
  readonly user = computed(() => this.#common.user());
  selectedPersonId: string | null = null;

  readonly usersResult = httpResource<UserModel[]>(() => "api/Users/GetAll");
  readonly personList = computed(() =>
    (this.usersResult.value() ?? [])
      .filter(x => !x.isDeleted && x.isActive)
  );

  documents: any[] = [];
  selectedDocuments: any[] = [];
  externalName = signal<string | null>(null);
  externalType = signal<number | null>(null);
  showFilters = false;
  loading = false;

  ngOnInit(): void {
    const envelopeId = this.state.getEnvelopeId();

    if (!envelopeId) {
      this.toast.showToast('Hata', 'EnvelopeId bulunamadı', 'error');
      return;
    }


    this.envelopeService.getEnvelopeById(envelopeId).subscribe({
      next: (res: EnvelopeModel) => {
        console.log(res);
        if (res) {
          this.previewEnvelope = res;
          this.loadDocuments(envelopeId);

          //giden kurum bilgisi cekiliyor 
          if (res.externalInstitutionId) {
            console.log("external : " + res.externalInstitutionId)
            this.externalService.getExternalInstitutionById(res.externalInstitutionId).subscribe({
              next: (result: ExternalInstitutionModel) => {
                this.externalName.set(result.name);
                this.externalType.set(result.type);
              }
            });
          }
        }
      }
    });

  }

  async loadDocuments(envelopeId: string) {
    this.loading = true;

    try {
      this.documents = await this.envelopeDocumentService
        .getEnvelopeDocumentsByEnvelopeId(envelopeId);
    } catch {
      this.toast.showToast('Hata', 'Evraklar yüklenemedi', 'error');
    } finally {
      this.loading = false;
    }
  }

  toggleSelection(doc: any) {
    const exists = this.selectedDocuments.find(x => x.qrCode === doc.qrCode);

    if (exists) {
      this.selectedDocuments = this.selectedDocuments.filter(x => x.qrCode !== doc.qrCode);
    } else {
      this.selectedDocuments = [...this.selectedDocuments, doc];
    }
  }

addZimmet() {

  if (!this.selectedPersonId) {
    this.toast.showToast('Hata', 'Personel seçilmedi', 'error');
    return;
  }

  // 👉 Selection varsa onu kullan, yoksa tüm listeyi
  const docsToProcess = this.selectedDocuments.length > 0
    ? this.selectedDocuments
    : this.documents;

  if (docsToProcess.length === 0) {
    this.toast.showToast('Hata', 'Zimmetlenecek evrak yok', 'error');
    return;
  }

  const requests = docsToProcess.map(doc => {
    const model: IncomingDocumentPreRegisterModel = {
      id: "",
      qrCode: doc.qrCode,
      userId: this.selectedPersonId!,
      documentDirection: 2,
      isDeleted: false,
      createdDate: new Date()
    };

    return this.incomingDocumentService.createIncomingDocumentPreRegister(model);
  });

  forkJoin(requests).subscribe({
    next: () => {
      this.toast.showToast('Başarılı', 'Evraklar teslim edildi', 'info');

      this.selectedDocuments = [];
      this.loadDocuments(this.state.getEnvelopeId()!);
    },
    error: () => {
      this.toast.showToast('Hata', 'Teslim işlemi başarısız', 'error');
    }
  });
}
  reset() {
    this.documents = [];
    this.selectedDocuments = [];
    this.state.clear();
  }

  getCaptionTitle(): string {
    return 'Zarf İçindeki Evraklar';
  }

  previewEnvelope: EnvelopeModel | null = null;

  getTitle(): string {
  switch (this.externalType()) {
    case 1:
      return 'Misyon Personeline Teslim Et';
    case 2:
      return 'Kurum Personeline Teslim Et';
    default:
      return 'Teslim Et';
  }
}
}