import { ChangeDetectionStrategy, Component, inject, OnInit, signal, ViewEncapsulation } from '@angular/core';
import GenericModel from '../../../components/generic-model/generic-model';
import { QRCodeComponent } from 'angularx-qrcode';
import { Router } from '@angular/router';
import { IncomingDocumentService } from '../../services/incomingdocument';
import { CommonModule } from '@angular/common';
import { DocumentTransactionModel } from '../../models/documenttransaction.model';
import { TransactionFlow } from '../dynamics/transaction-flow/transaction-flow';
import { DocumentTransaction } from '../../services/documenttransaction';
import { Common } from '../../services/common';
import { FlexiToastService } from 'flexi-toast';
import { SecurityDegreeLabels, SecurityDegreeBadgeClass } from '../../models/securitydegree.model';
import { actionRequiredLabel, actionRequiredBadgeClass } from '../../models/actionrequired.model';

@Component({
  imports: [
    GenericModel,
    CommonModule,
    QRCodeComponent,
    TransactionFlow
  ],
  templateUrl: './surecler.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Surecler implements OnInit {
  doc = signal<string | null>(null);
  id!: string | null;
  ocrVisible = signal(true);
  transactions = signal<DocumentTransactionModel[]>([]);
  documentDetail = signal<any | null>(null);
  readonly #toast = inject(FlexiToastService);
  readonly #common = inject(Common);

  private documentService = inject(IncomingDocumentService);
  private router = inject(Router);
  private documentTransactionService = inject(DocumentTransaction);
  securityDegreeMap: Record<number, string> = SecurityDegreeLabels;
  securityDegreeStyle: Record<number, string> = SecurityDegreeBadgeClass;
  readonly actionRequiredLabel = actionRequiredLabel;
  readonly actionRequiredBadgeClass = actionRequiredBadgeClass;

  ngOnInit(): void {
    this.id = this.documentService.currentIncomingDocumentId;

    if (!this.id) {
      this.router.navigate(['/scanlist']);
      return;
    }

    this.loadTransactions(this.id)
    this.getDocument(this.id);

    //console.log(this.doc);
  }

  loadTransactions(docId: string) {
    this.documentTransactionService.getTransactionsByDocumentId(docId).subscribe({
      next: (res) => {
        this.transactions.set([...res].reverse().filter(t => t.transactionType !== 3));
      },
      error: (err) => console.error(err)
    });
  }

  getir(id: string) {
    this.documentService.getIncomingDocumentByDocumentId(id).subscribe(docs => {
      if (!docs) return;
      this.doc.set(docs?.qrCode ?? null);

    })
  }

    private getDocument(documentNumber: string) {



    if (!documentNumber) {
      this.#toast.showToast('Uyarı', 'Geçersiz QR', 'warning');
      return;
    }

    this.documentService.getIncomingDocumentByDocumentId(documentNumber)
      .subscribe(doc => {

        if (!doc?.id) {
          this.#toast.showToast('Hata', 'Evrak bulunamadı', 'error');
          return;
        }

        this.documentDetail.set(doc); // dokuman detaylari eklendi

      });
  }

}
