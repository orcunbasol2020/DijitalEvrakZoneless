import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { HttpService } from './http';
import { DocumentTransactionModel } from '../models/documenttransaction.model';

// Backend adı boş gönderirse gösterilecek tür adları (TransactionTypeEnum'a sonradan eklenenler)
const TRANSACTION_TYPE_NAMES: Record<number, string> = {
  20: 'Ek Yükleme',
  21: 'Ek Silme',
};

@Injectable({ providedIn: 'root' })
export class DocumentTransaction {

  private httpService = inject(HttpService);

  // Backend route
  private baseUrl = 'api/DocumentTransactions';

  // DocumentId ile listeleme (flexi-grid için)
  getTransactionsByDocumentId(documentId: string) {
    return this.httpService.get<DocumentTransactionModel[]>(
      `${this.baseUrl}/${encodeURIComponent(documentId)}`
    ).pipe(map(list => (list ?? []).map(t => t.transactionTypeName
      ? t
      : { ...t, transactionTypeName: TRANSACTION_TYPE_NAMES[t.transactionType] ?? t.transactionTypeName })));
  }

  // Yeni transaction ekleme
  createTransaction(transaction: Partial<DocumentTransactionModel>) {
    return this.httpService.post(
      `${this.baseUrl}/Create`,
      transaction
    );
  }
}
