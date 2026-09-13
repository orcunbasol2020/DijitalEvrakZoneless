import { Component, Input, OnInit, OnChanges, SimpleChanges, HostListener } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-simple-autocomplete',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
template: `
  <div class="position-relative">

    <input 
      type="text"
      class="form-control"
      [value]="displayValue"
      [placeholder]="placeholder"
      (input)="onInput($event)"
      (focus)="open()"
      (keydown)="onKeyDown($event)"
    >

    <ul *ngIf="show"
        class="list-group position-absolute w-100 zindex-dropdown dropdown-anim">

      <ng-container *ngIf="filteredOptions.length > 0; else noResult">

        <li 
          class="list-group-item list-group-item-action"
          *ngFor="let option of filteredOptions; let i = index"
          [class.active-item]="i === activeIndex"
          (mousedown)="select(option)"
          (mouseenter)="activeIndex = i">

          {{ option.name }}
        </li>

      </ng-container>

      <ng-template #noResult>
        <li class="list-group-item no-result">
          Sonuç bulunamadı
        </li>
      </ng-template>

    </ul>

  </div>
`,
  styles: [`
    .zindex-dropdown { 
      z-index: 1000; 
      max-height: 220px;
      overflow-y: auto;
      border-radius: 10px;
      box-shadow: 0 8px 25px rgba(0,0,0,0.08);
    }

    .dropdown-anim {
      animation: fadeSlideDown 0.18s ease-out;
      transform-origin: top;
    }

    @keyframes fadeSlideDown {
      from {
        opacity: 0;
        transform: translateY(-6px) scaleY(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scaleY(1);
      }
    }

    .list-group-item {
      transition: all 0.12s ease;
    }

    .list-group-item:hover {
      background: #f5f7fa;
      transform: scale(1.02);
    }

    .active-item {
      background: #e9f2ff !important;
      font-weight: 500;
    }
  `]
})
export class SimpleAutocompleteComponent implements OnInit, OnChanges {

  @Input() options: { id: number | string, name: string }[] = [];
  @Input() control!: FormControl;
  @Input() placeholder: string = '';

  filteredOptions: { id: number | string, name: string }[] = [];
  show = false;
  activeIndex = -1;

  /** Metin kutusunda gösterilen, henüz seçime dönüşmemiş olabilecek arama metni. */
  private searchText: string | null = null;

  ngOnInit() {
    this.filteredOptions = this.options;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['options']) {
      this.filteredOptions = this.options;
    }
  }

  get displayValue(): string {
    if (this.searchText !== null) {
      return this.searchText;
    }
    const value = this.control?.value;
    return typeof value === 'string'
      ? value
      : value?.name ?? '';
  }

  open() {
    this.show = true;
    this.searchText = '';
    this.filteredOptions = this.options;
  }

  onInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    // control.value her zaman ya null ya da seçilmiş bir { id, name } nesnesi olmalı;
    // burada henüz bir seçim yapılmadığından ham metni control'e yazmıyoruz.
    this.searchText = value;
    this.filter(value);
    this.show = true;
    this.activeIndex = -1;
  }

  private filter(value: any) {
    if (!value) {
      this.filteredOptions = this.options;
      return;
    }

    const search = value.toLowerCase();

    this.filteredOptions = this.options.filter(o =>
      o.name.toLowerCase().includes(search)
    );
  }

  onKeyDown(event: KeyboardEvent) {

    if (!this.show) return;

    switch (event.key) {

      case 'ArrowDown':
        event.preventDefault();
        this.activeIndex =
          this.activeIndex < this.filteredOptions.length - 1
            ? this.activeIndex + 1
            : 0;
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.activeIndex =
          this.activeIndex > 0
            ? this.activeIndex - 1
            : this.filteredOptions.length - 1;
        break;

      case 'Enter':
        event.preventDefault();
        if (this.activeIndex >= 0) {
          this.select(this.filteredOptions[this.activeIndex]);
        } else if (this.filteredOptions.length === 1) {
          this.select(this.filteredOptions[0]);
        }
        break;

      case 'Escape':
        this.show = false;
        this.searchText = null;
        break;
    }
  }

  select(option: any) {
    this.control.setValue(option);
    this.searchText = null;
    this.show = false;
    this.activeIndex = -1;
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.position-relative')) {
      this.close();
    }
  }

  private close() {
    this.show = false;
    // Yazılan metin geçerli bir seçime dönüşmediyse, control.value'yu bozmadan
    // son geçerli seçime (varsa) geri dön.
    this.searchText = null;
  }

}
