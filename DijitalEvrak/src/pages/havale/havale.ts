import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import GenericModel from '../../../components/generic-model/generic-model';

@Component({
  selector: 'app-havale',
  standalone: true,
  imports: [FormsModule, GenericModel],
  templateUrl: './havale.html'
})
export default class HavaleComponent {

  units = [
    { code: 'PRTY', name: 'PRTY - Protokol / Kutlama' },
    { code: 'HR', name: 'HR - İnsan Kaynakları' },
    { code: 'IT', name: 'IT - Bilgi İşlem' },
    { code: 'FIN', name: 'FIN - Finans' }
  ];

  selectedUnit: string | null = null;
  keywordInput = '';
  keywords: string[] = [];

  addKeyword() {
    if (!this.keywordInput.trim()) return;
    this.keywords = [...this.keywords, this.keywordInput.trim()];
    this.keywordInput = '';
  }

  removeKeyword(i: number) {
    this.keywords = this.keywords.filter((_, index) => index !== i);
  }

  saveKeywords() {
    console.log(this.selectedUnit, this.keywords);
  }

  resetForm() {
    this.selectedUnit = null;
    this.keywordInput = '';
    this.keywords = [];
  }
}
