import { Component, Input, Output, EventEmitter, OnInit, OnChanges, OnDestroy, SimpleChanges, ElementRef, ChangeDetectorRef, ViewChild, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-simple-autocomplete',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, OverlayModule],
template: `
  <div class="position-relative" cdkOverlayOrigin #origin="cdkOverlayOrigin">

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

    <span *ngIf="loading || searching" class="autocomplete-spinner spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>

  </div>

  <!-- Liste sayfanın üst katmanında (CDK overlay) açılır: kaydırılan form gövdesini uzatıp
       ikinci bir scroll bar çıkarmaz; altta yer yoksa kutunun üstünde açılır. -->
  <ng-template cdkConnectedOverlay
    [cdkConnectedOverlayOrigin]="origin"
    [cdkConnectedOverlayOpen]="show && !loading && !disabled"
    [cdkConnectedOverlayPositions]="positions"
    [cdkConnectedOverlayWidth]="panelWidth"
    [cdkConnectedOverlayMinHeight]="140"
    [cdkConnectedOverlayViewportMargin]="8"
    [cdkConnectedOverlayFlexibleDimensions]="true"
    [cdkConnectedOverlayGrowAfterOpen]="true"
    cdkConnectedOverlayPanelClass="sac-pane"
    (detach)="onDetach()">

    <ul class="list-group w-100 sac-list dropdown-anim" (mousedown)="$event.preventDefault()">

      <ng-container *ngIf="filteredOptions.length > 0; else noResult">

        <li
          class="list-group-item list-group-item-action"
          *ngFor="let option of filteredOptions; let i = index"
          [class.active-item]="i === activeIndex"
          [class.autocomplete-item-child]="(option.indent || 0) > 0"
          [style.padding-left.px]="option.indent ? 14 + option.indent * 18 : null"
          (mousedown)="select(option)"
          (mouseenter)="activeIndex = i">

          <span *ngIf="option.indent" class="autocomplete-tree-marker">└</span>
          {{ option.name }}
          <small *ngIf="option.hint" class="autocomplete-hint" [title]="option.hint">{{ option.hint }}</small>
        </li>

      </ng-container>

      <ng-template #noResult>
        <li class="list-group-item no-result">
          {{ searching ? 'Aranıyor...' : 'Sonuç bulunamadı' }}
        </li>
      </ng-template>

    </ul>

  </ng-template>
`,
  styles: [`
    /* Overlay paneli boş alana göre kısalır (.sac-pane, styles.css); kaydırma yalnızca listededir */
    .sac-list {
      flex: 0 1 auto;
      min-height: 0;
      max-height: 280px;
      overflow-y: auto;
      overscroll-behavior: contain;
      margin: 2px 0;
      border-radius: 10px;
      box-shadow: 0 8px 25px rgba(0,0,0,0.12);
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
      transition: background-color 0.12s ease;
      cursor: pointer;
    }

    .list-group-item.no-result {
      cursor: default;
    }

    .list-group-item:hover {
      background: #f5f7fa;
    }

    .active-item {
      background: #e9f2ff !important;
      font-weight: 500;
    }

    .autocomplete-item-child {
      color: #5a6472;
      font-size: 0.92em;
    }

    .autocomplete-hint {
      display: block;
      font-size: 0.8em;
      color: #64748b;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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

  /** indent: ağaç gösteriminde girinti seviyesi (birimlerin makam "level" alanıyla karışmasın diye ayrı ad) */
  /** hint: adın altında küçük ikincil metin (ör. unvan); yalnızca gösterim, aramaya katılmaz */
  @Input() options: { id: number | string, name: string, indent?: number, hint?: string | null }[] = [];
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
  /** Uzak arama: liste sunucuda aranır (ör. ~160.000 kurum). Yazılan metin (search) ile bildirilir,
   *  options sunucudan gelen sonuçlardır; bileşen ayrıca süzmez. minChars ile birlikte kullanılır. */
  @Input() remote = false;
  /** Uzak aramada istek sürerken true: kutu açık kalır, sağda spinner döner */
  @Input() searching = false;
  @Output() search = new EventEmitter<string>();

  filteredOptions: { id: number | string, name: string, indent?: number, hint?: string | null }[] = [];
  show = false;
  activeIndex = -1;

  /** Önce kutunun altı, sığmazsa üstü */
  readonly positions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top' },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom' },
  ];
  /** Liste kutuyla aynı genişlikte açılır; açılışta ölçülür */
  panelWidth = 0;

  @ViewChild(CdkConnectedOverlay) private connectedOverlay?: CdkConnectedOverlay;
  @ViewChild(CdkOverlayOrigin) private overlayOrigin?: CdkOverlayOrigin;

  /** Metin kutusunda gösterilen, henüz seçime dönüşmemiş olabilecek arama metni. */
  private searchText: string | null = null;

  /** stopPropagation() kullanan popup/modal kapsayıcıları içindeyken bile dışa tıklamayı
   *  yakalayabilmek için document'e bubble yerine capture aşamasında dinleyici ekliyoruz. */
  private readonly documentClickListener = (event: MouseEvent) => this.onClickOutside(event);

  /** Liste body'deki katmanda olduğundan, kutunun bulunduğu kaydırılan alan (ör. form gövdesi)
   *  kayınca konumu yenilenir; listenin kendi kaydırması yok sayılır. */
  private readonly scrollListener = (event: Event) => {
    if (!this.show) return;
    const pane = this.overlayPane;
    if (pane && event.target instanceof Node && pane.contains(event.target)) return;
    this.connectedOverlay?.overlayRef?.updatePosition();
  };

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
    document.addEventListener('scroll', this.scrollListener, true);

    // Üst bileşen control.setValue() ile programatik değer yazdığında (ör. güncelleme
    // ekranında kayıt yüklenince) zoneless ortamda görünümün yenilenmesi garanti
    // değildir; valueChanges üzerinden görünümü açıkça işaretliyoruz.
    this.controlSub = this.control?.valueChanges.subscribe(() => this.cdr.markForCheck());
  }

  ngOnDestroy() {
    document.removeEventListener('click', this.documentClickListener, true);
    document.removeEventListener('scroll', this.scrollListener, true);
    this.controlSub?.unsubscribe();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['options']) {
      // Uzak aramada sonuçlar yazılan metne göre gelir; yerelde yazılan metinle yeniden süzülür
      this.filteredOptions = this.remote || this.searchText === null ? this.options : this.localFilter(this.searchText);
      // Sonuç sayısı değişince liste yüksekliği değişir; altta/üstte yer yeniden hesaplanır
      this.refreshPosition();
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
    this.measureWidth();
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
    this.measureWidth();
    this.show = value.trim().length >= this.minChars;
    this.activeIndex = -1;
    this.refreshPosition();
  }

  private get overlayPane(): HTMLElement | undefined {
    return this.connectedOverlay?.overlayRef?.overlayElement;
  }

  private measureWidth() {
    const box = this.overlayOrigin?.elementRef.nativeElement as HTMLElement | undefined;
    this.panelWidth = box?.getBoundingClientRect().width ?? 0;
  }

  private refreshPosition() {
    requestAnimationFrame(() => this.connectedOverlay?.overlayRef?.updatePosition());
  }

  /** Klavyeyle seçilen satır listenin görünen alanında kalsın */
  private scrollActiveIntoView() {
    requestAnimationFrame(() => this.overlayPane?.querySelector('.active-item')?.scrollIntoView({ block: 'nearest' }));
  }

  /** CDK listeyi kendisi kapattığında (ör. Escape) iç durum da kapanır */
  onDetach() {
    if (this.show) {
      this.show = false;
      this.searchText = null;
      this.cdr.markForCheck();
    }
  }

  private filter(value: any) {
    if (this.remote) {
      this.search.emit(value ?? '');
      this.filteredOptions = this.options;
      return;
    }
    this.filteredOptions = this.localFilter(value);
  }

  private localFilter(value: any) {
    if (!value) {
      return this.options;
    }

    // Varsayılan (locale'siz) toLowerCase(), Türkçe "İ" harfini tek bir "i" yerine
    // "i" + görünmez birleştirici nokta (U+0307) olarak küçültür; bu da kullanıcı
    // düz "i" yazdığında "İ" ile başlayan kayıtların eşleşmemesine yol açar.
    // 'tr' locale'i "İ" -> "i" dönüşümünü tek karakterde yaptığından iki taraf
    // tutarlı hale gelir.
    const search = value.toLocaleLowerCase('tr');

    return this.options.filter(o =>
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
        this.scrollActiveIntoView();
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.activeIndex =
          this.activeIndex > 0
            ? this.activeIndex - 1
            : this.filteredOptions.length - 1;
        this.scrollActiveIntoView();
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
    // Liste body'deki katmanda; içine (ör. kaydırma çubuğuna) tıklamak dış tık sayılmaz
    if (!this.elementRef.nativeElement.contains(target) && !this.overlayPane?.contains(target)) {
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
