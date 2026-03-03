import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AllocationCardComponent } from '../allocation-card/allocation-card';
import { DocumentAllocationModel } from '../../../models/documentallocation.model';


@Component({
  selector: 'app-allocation-flow',
  standalone: true,
  imports: [CommonModule, AllocationCardComponent],
  templateUrl: './allocation-flow.html'
})
export class AllocationFlowComponent {
  @Input() items: DocumentAllocationModel[] = [];
}