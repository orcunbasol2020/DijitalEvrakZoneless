import { ChangeDetectionStrategy, Component, inject, OnInit, OnDestroy, signal, ViewEncapsulation } from '@angular/core';
import GenericModel from '../../../components/generic-model/generic-model';
import { CommonModule } from '@angular/common';
import { FlexiToastService } from 'flexi-toast';
import { DocumentService } from '../../services/document';
import { Router, RouterModule } from '@angular/router';
import { IncomingDocumentService } from '../../services/incomingdocument';

@Component({
  imports: [
    GenericModel,
    CommonModule,
    RouterModule
  ],
  templateUrl: './qrokut.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Qrokut implements OnInit, OnDestroy {
  backButtonVisible = signal(false);
  alertVisible = signal(true);
  private incomingDocumentService = inject(IncomingDocumentService);
  readonly #toast = inject(FlexiToastService);
  private readonly router = inject(Router);
  // buffer artık component property (doğru yer)
  private buffer: string = '';
  // event handler referansı
  private keydownHandler: any;

  ngOnInit() {
    this.backButtonVisible.set(true);

    // keydown handler'ı ayrı tanımlıyoruz
    this.keydownHandler = (e: KeyboardEvent) => {
      this.handleKeydown(e);
    };
    // sadece bu component çalışırken aktif
    window.addEventListener('keydown', this.keydownHandler);
  }
  // önemli! başka componentlere geçince listener kaldırılır
  ngOnDestroy() {
    window.removeEventListener('keydown', this.keydownHandler);
  }

  onQrScanned(result: string) {
    if (result) {

    } else {
      this.#toast.showToast('Bilgi', 'Lütfen QR Kodu Okutunuz veya Belge Numarasını Girerek Enter Tuşuna Basınız.', 'warning');
    }
  }
  // QR inputunu yakalama işini yöneten method
  private handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      this.redirectEvrakKayit(this.buffer.trim());
      this.buffer = '';
    } else {
      this.buffer += e.key;
    }
  }
  
  // QR okunduğunda yapılacak işlem
  redirectEvrakKayit(result: string) {

    if (!result) {
      this.#toast.showToast(
        'Bilgi',
        'Lütfen QR Kodu Okutunuz veya Belge Numarasını Girerek Enter Tuşuna Basınız.',
        'warning'
      );
      return;
    }

    this.incomingDocumentService.GetByQrCode(result).subscribe(doc => {

      if (!doc) {
        this.#toast.showToast(
          'Belge bulunamadı',
          'Girilen QR koda ait herhangi bir belge bulunamadı.',
          'error'
        );
        return;
      }

      if (!doc.documentName) {
        this.#toast.showToast(
          "Belge henüz taranmamış",
          "Tarama işlemi tamamlandıktan sonra belge kayıt ekranına geçiş yapabilirsiniz."
        );
        return;
      }

      this.incomingDocumentService.setSelectedIncomingDocument(result);
      this.incomingDocumentService.setIncomingDocumentUpdateType("2");
      this.router.navigate(['/evrakkayit']);

    });
  }

}
