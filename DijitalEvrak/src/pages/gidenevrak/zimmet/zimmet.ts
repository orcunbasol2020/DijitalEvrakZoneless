import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal, ViewEncapsulation } from '@angular/core';
import GenericModel from '../../../../components/generic-model/generic-model';
import { FlexiToastService } from 'flexi-toast';
import { EnvelopeDocumentService } from '../../../services/envelopedocument';
import { EnvelopeService } from '../../../services/envelope';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef } from '@angular/core';
import { FlexiGridModule } from 'flexi-grid';
import { IncomingDocumentPreRegisterModel } from '../../../models/incoming-document/incomingdocument-pregister.model';
import { IncomingDocumentService } from '../../../services/incomingdocument';
import { Common } from '../../../services/common';
import { forkJoin } from 'rxjs';

@Component({
  imports: [
    GenericModel,
    CommonModule,
    FlexiGridModule
  ],
  templateUrl: './zimmet.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Zimmet implements OnInit {

  private keydownHandler: any;
  detailsVisible = signal(false);
  readonly #toast = inject(FlexiToastService);
  private buffer: string = '';
  private envelopeDocumentService = inject(EnvelopeDocumentService);
  private incomingDocumentService = inject(IncomingDocumentService);
  private envelopeService = inject(EnvelopeService);
  private cdr = inject(ChangeDetectorRef);
  showFilters = false;
  readonly #common = inject(Common);
  readonly user = computed(() => this.#common.user());

  ngOnInit(): void {
    this.keydownHandler = (e: KeyboardEvent) => {
      this.handleKeydown(e);
    };
    window.addEventListener('keydown', this.keydownHandler);
  }
  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.keydownHandler);
  }
  private handleKeydown(e: KeyboardEvent) {
    if (!this.detailsVisible()) {
      if (e.key === 'Enter') {
        this.onQrScanned(this.buffer.trim());
        this.buffer = '';
      } else {
        this.buffer += e.key;
      }
    }
  }
  documents: any[] = [];
  loading = false;
  alertVisible = true;
  currentItem: {
    type: 'envelope' | 'document';
    code: string;
  } | null = null;

  async onQrScanned(result: string) {

    if (this.loading) return;

    if (!result) {
      this.showToast('Bilgi', 'QR okutunuz', 'warning');
      return;
    }

    this.loading = true;

    try {

      // ZARF KONTROLÜ (prefix ile)
      if (result.startsWith('ZRF')) {
        this.currentItem = {
          type: 'envelope',
          code: result
        };
        const envelope = await this.envelopeService.getEnvelopeByNo(result);

        if (!envelope) {
          this.documents = [];
          this.showToast('Bilgi', 'Zarf bulunamadı.', 'warning');
          return;
        }

        const docs = await this.envelopeDocumentService
          .getEnvelopeDocumentsByEnvelopeId(envelope.id);

        if (docs.length > 0) {
          this.documents = docs;
          this.alertVisible = false;
        } else {
          this.documents = [];
          this.showToast('Bilgi', 'Zarf içinde evrak yok.', 'warning');
        }

        return;
      }
      else {
        this.currentItem = {
          type: 'document',
          code: result
        };
        const isValidDocument = /^20\d{2}/.test(result);
        if (!isValidDocument) {
          this.showToast(
            'Hata',
            'Lütfen geçerli bir evrak numarasını girin.' + "( geçersiz : " + result + ")",
            'warning'
          );
          return;
        }
        //  BELGE AKIŞI
        const exists = this.documents.some(x => x.qrCode === result);

        if (exists) {
          this.showToast('Bilgi', 'Bu belge zaten eklendi', 'info');
          return;
        }

        // ( burada backend doğrulama gelecek)

        this.documents = [
          ...this.documents,
          {
            qrCode: result,
            createdDate: new Date()
          }
        ];

        this.alertVisible = false;
      }

    } catch (err) {
      console.error(err);
      this.showToast('Hata', 'Bir hata oluştu', 'error');
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }
  private toastVisible = false;
  private showToast(title: string, message: string, type: 'info' | 'warning' | 'error') {
    if (this.toastVisible) return;
    this.toastVisible = true;
    this.#toast.showToast(title, message, type);
    setTimeout(() => this.toastVisible = false, 2000);
  }
  getCaptionTitle(): string {
    if (!this.currentItem) {
      return 'Belgeler';
    }

    return this.currentItem.type === 'envelope'
      ? 'Zarf İçindeki Belgeler'
      : 'Eklenen Evrak ';
  }

  reset() {
    this.documents = [];
    this.buffer = '';
    this.loading = false;
    this.alertVisible = true;
    this.currentItem = null;
  }

  addZimmet() {
    const userId = this.user()?.id;
    if (!userId) {
      this.#toast.showToast("Hata", "Kullanıcı bilgisi alınamadı", "error");
      return;
    }

    const requests = this.documents.map(doc => {
      const model: IncomingDocumentPreRegisterModel = {
        id: "",
        qrCode: doc.qrCode,
        userId: userId,
        userType: 1,
        documentDirection: 2,
        isDeleted: false,
        createdDate: new Date()
      };

      return this.incomingDocumentService.createIncomingDocumentPreRegister(model);
    });

    forkJoin(requests).subscribe({
      next: (results) => {
        let successCount = 0;
        let alreadyCount = 0;

        for (const res of results) {
          if (!res) continue;

          if (res.id != "") successCount++;
          else alreadyCount++;
        }

        if (successCount > 0) {
          this.#toast.showToast('Başarılı', `${successCount} evrak zimmetlendi`, 'info');

          // TEMİZLEME
          this.documents = [];
          this.buffer = '';
          this.alertVisible = true;
          this.currentItem = null;
          this.cdr.detectChanges();
        }

        if (alreadyCount > 0) {
          this.#toast.showToast('Bilgi', `${alreadyCount} kayıt zaten vardı.`, 'warning');
        }
      },
      error: () => {
        this.#toast.showToast('Hata', 'Kayıtlar oluşturulamadı', 'error');
      }
    });
  }

}