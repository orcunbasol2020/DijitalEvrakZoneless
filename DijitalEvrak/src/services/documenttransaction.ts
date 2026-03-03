import { Injectable, inject } from '@angular/core';
import { HttpService } from './http';
import { DocumentTransactionModel } from '../models/documenttransaction.model';


@Injectable({ providedIn: 'root' })
export class DocumentTransaction {

  private httpService = inject(HttpService);

  // Backend route
  private baseUrl = 'api/DocumentTransactions';

  // DocumentId ile listeleme (flexi-grid için)
  getTransactionsByDocumentId(documentId: string) {
    return this.httpService.get<DocumentTransactionModel[]>(
      `${this.baseUrl}/${encodeURIComponent(documentId)}`
    );
  }

  // Yeni transaction ekleme
  createTransaction(transaction: Partial<DocumentTransactionModel>) {
    return this.httpService.post(
      `${this.baseUrl}/Create`,
      transaction
    );
  }
}
