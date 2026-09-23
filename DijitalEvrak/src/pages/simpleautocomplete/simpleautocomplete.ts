import { Component, Input, OnInit, OnChanges, OnDestroy, SimpleChanges, ElementRef, ChangeDetectorRef, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-simple-autocomplete',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
template: `
  <div class="position-relative">

    <input
      type="text"
      class="form-control"
      [class.autocomplete-loading]="loading"
      [value]="displayValue"
      [placeholder]="loading ? loadingText : placeholder"
      [disabled]="loading || disabled"
      (input)="onInput($event)"
      (focus)="open()"
      (keydown)="onKeyDown($event)"
    >

    <span *ngIf="loading" class="autocomplete-spinner spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>

    <ul *ngIf="show && !loading && !disabled"
        class="list-group position-absolute w-100 zindex-dropdown dropdown-anim">

      <ng-container *ngIf="filteredOptions.length > 0; else noResult">

        <li
          class="list-group-item list-group-item-action"
          *ngFor="let option of filteredOptions; let i = index"
          [class.active-item]="i === activeIndex"
          [class.autocomplete-item-child]="(option.level || 0) > 0"
          [style.padding-left.px]="option.level ? 14 + option.level * 18 : null"
          (mousedown)="select(option)"
          (mouseenter)="activeIndex = i">

          <span *ngIf="option.level" class="autocomplete-tree-marker">└</span>
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
      cursor: pointer;
    }

    .list-group-item.no-result {
      cursor: default;
    }

    .list-group-item:hover {
      background: #f5f7fa;
      transform: scale(1.02);
    }

    .active-item {
      background: #e9f2ff !important;
      font-weight: 500;
    }

    .autocomplete-item-child {
      color: #5a6472;
      font-size: 0.92em;
    }

    .autocomplete-tree-marker {
      display: inline-block;
      margin-right: 4px;
      color: #9aa4b2;
    }

    /* Seçenekler henüz yüklenirken kutu pasif görünür, sağında küçük bir spinner döner. */
    .form-control.autocomplete-loading {
      padding-right: 2.25rem;
      background-color: #f8fafc;
      color: #94a3b8;
    }

    .autocomplete-spinner {
      position: absolute;
      right: 0.75rem;
      top: 50%;
      margin-top: -0.5rem;
      width: 1rem;
      height: 1rem;
      color: #64748b;
      pointer-events: none;
    }
  `]
})
export class SimpleAutocompleteComponent implements OnInit, OnChanges, OnDestroy {

  @Input() options: { id: number | string, name: string, level?: number }[] = [];
  @Input() control!: FormControl;
  @Input() placeholder: string = '';
  /** 0 ise odaklanınca tüm liste açılır; >0 ise liste ancak bu kadar karakter yazılınca görünür
   *  (büyük listeler — ör. tüm kullanıcılar — için "yazınca gelsin" davranışı). */
  @Input() minChars = 0;
  /** Seçenek listesi (veya ilk değer) henüz sunucudan gelmediyse true: kutu pasifleşir,
   *  placeholder yerine loadingText gösterilir ve sağda spinner döner. */
  @Input() loading = false;
  @Input() loadingText = 'Yükleniyor...';
  @Input() disabled = false;

  filteredOptions: { id: number | string, name: string, level?: number }[] = [];
  show = false;
  activeIndex = -1;

  /** Metin kutusunda gösterilen, henüz seçime dönüşmemiş olabilecek arama metni. */
  private searchText: string | null = null;

  /** stopPropagation() kullanan popup/modal kapsayıcıları içindeyken bile dışa tıklamayı
   *  yakalayabilmek için document'e bubble yerine capture aşamasında dinleyici ekliyoruz. */
  private readonly documentClickListener = (event: MouseEvent) => this.onClickOutside(event);

  // Proje zoneless (provideZonelessChangeDetection) çalıştığından, aşağıdaki
  // document.addEventListener ile eklenen dış tık dinleyicisi Angular'ın event
  // binding'leri dışında kaldığı için değişiklik algılamayı tetiklemez; "show"
  // false olsa bile görünüm güncellenmeden dropdown açık kalırdı. markForCheck()
  // ile bu dinleyicideki değişikliği manuel olarak bildiriyoruz.
  private readonly cdr = inject(ChangeDetectorRef);

  constructor(private elementRef: ElementRef<HTMLElement>) {}

  private controlSub?: Subscription;

  ngOnInit() {
    this.filteredOptions = this.options;
    document.addEventListener('click', this.documentClickListener, true);

    // Üst bileşen control.setValue() ile programatik değer yazdığında (ör. güncelleme
    // ekranında kayıt yüklenince) zoneless ortamda görünümün yenilenmesi garanti
    // değildir; valueChanges üzerinden görünümü açıkça işaretliyoruz.
    this.controlSub = this.control?.valueChanges.subscribe(() => this.cdr.markForCheck());
  }

  ngOnDestroy() {
    document.removeEventListener('click', this.documentClickListener, true);
    this.controlSub?.unsubscribe();
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
    this.show = this.minChars === 0;
    this.searchText = '';
    this.filteredOptions = this.options;
  }

  onInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    // control.value her zaman ya null ya da seçilmiş bir { id, name } nesnesi olmalı;
    // burada henüz bir seçim yapılmadığından ham metni control'e yazmıyoruz.
    this.searchText = value;
    this.filter(value);
    this.show = value.trim().length >= this.minChars;
    this.activeIndex = -1;
  }

  private filter(value: any) {
    if (!value) {
      this.filteredOptions = this.options;
      return;
    }

    // Varsayılan (locale'siz) toLowerCase(), Türkçe "İ" harfini tek bir "i" yerine
    // "i" + görünmez birleştirici nokta (U+0307) olarak küçültür; bu da kullanıcı
    // düz "i" yazdığında "İ" ile başlayan kayıtların eşleşmemesine yol açar.
    // 'tr' locale'i "İ" -> "i" dönüşümünü tek karakterde yaptığından iki taraf
    // tutarlı hale gelir.
    const search = value.toLocaleLowerCase('tr');

    this.filteredOptions = this.options.filter(o =>
      o.name.toLocaleLowerCase('tr').includes(search)
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

  onClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!this.elementRef.nativeElement.contains(target)) {
      this.close();
    }
  }

  private close() {
    this.show = false;
    // Yazılan metin geçerli bir seçime dönüşmediyse, control.value'yu bozmadan
    // son geçerli seçime (varsa) geri dön.
    this.searchText = null;
    this.cdr.markForCheck();
  }

}
