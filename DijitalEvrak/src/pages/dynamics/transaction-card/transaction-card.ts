import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DocumentTransactionModel } from '../../../models/documenttransaction.model';

@Component({
  selector: 'app-transaction-card',
  standalone: true,
  imports: [
    CommonModule
  ],
  templateUrl: './transaction-card.html'
})
export class TransactionCard {
  @Input() item!: DocumentTransactionModel;
  @Input() loading: boolean = false;
}