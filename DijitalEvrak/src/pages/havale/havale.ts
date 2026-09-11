import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import GenericModel from '../../../components/generic-model/generic-model';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-havale',
  standalone: true,
  imports: [FormsModule, GenericModel, CommonModule],
  templateUrl: './havale.html'
})
export default class HavaleComponent {

  availableKeywords: string[] = [
    '29 Ekim kutlama mesajları',
    'Yeni proje evrakları',
    'Personel izin talepleri',
    'Toplantı notları',
    'Kurye evrakları'
  ];
  // Başlangıçta sağdaki listede örnek olsun diye:
keywords: string[] = [
  'Rapor evrakları',
  'Fatura evrakları'
];

  keywordInput: string = '';
  selectedUnit: string | null = null;

  units = [
    { code: 'PRTY', name: 'PRTY - Protokol / Kutlama' },
    { code: 'HR', name: 'HR - İnsan Kaynakları' },
    { code: 'IT', name: 'IT - Bilgi İşlem' },
    { code: 'FIN', name: 'FIN - Finans' }
  ];

  getSelectedUnitName(): string {
    return this.units.find(u => u.code === this.selectedUnit)?.name ?? '';
  }

  addKeyword() {
    if (!this.keywordInput.trim()) return;
    if (!this.keywords.includes(this.keywordInput.trim())) {
      this.keywords = [...this.keywords, this.keywordInput.trim()];
    }
    this.keywordInput = '';
  }

  removeKeyword(i: number) {
    this.keywords = this.keywords.filter((_, index) => index !== i);
  }

  saveKeywords() {
    console.log('Seçilen birim:', this.selectedUnit);
    console.log('Kaydedilen kelimeler:', this.keywords);
  }

  resetForm() {
    this.selectedUnit = null;
    this.keywordInput = '';
    this.keywords = [];
  }

  // Sol listedeki kelimeleri ekleme
  addKeywordFromList(kw: string) {
    if (!this.keywords.includes(kw)) {
      this.keywords = [...this.keywords, kw];
    }
  }
}