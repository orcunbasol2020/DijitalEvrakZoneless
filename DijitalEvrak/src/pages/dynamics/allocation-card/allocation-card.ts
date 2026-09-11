import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DocumentAllocationModel } from '../../../models/documentallocation.model';

@Component({
  selector: 'app-allocation-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './allocation-card.html'
})
export class AllocationCardComponent {
  @Input() item!: DocumentAllocationModel;
  @Input() loading: boolean = false;

  get source(): 'EvrakTakip' | 'Atlas' {
    return this.item.source ?? 'EvrakTakip';
  }
}