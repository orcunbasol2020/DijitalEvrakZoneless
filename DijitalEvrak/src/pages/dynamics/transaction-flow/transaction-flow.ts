import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DocumentTransactionModel } from '../../../models/documenttransaction.model';
import { TransactionCard } from '../transaction-card/transaction-card';


@Component({
  selector: 'app-transaction-flow',
  standalone: true,
  imports: [
    CommonModule, 
    TransactionCard
  ],
  templateUrl: './transaction-flow.html'
})
export class TransactionFlow {
  @Input() items: DocumentTransactionModel[] = [];
}