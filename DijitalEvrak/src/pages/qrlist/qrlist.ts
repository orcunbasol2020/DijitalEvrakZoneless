import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, OnInit, afterNextRender, computed, inject,
  signal, viewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { QRCodeComponent } from 'angularx-qrcode';
import { FlexiToastService } from 'flexi-toast';
import GenericModel from '../../../components/generic-model/generic-model';
import { Common } from '../../services/common';
import { AtlasDocumentNumberService, AtlasNumberStock, atlasErrorMessage } from '../../services/atlas-document-number';
import { Barcode128 } from '../../../components/barcode128/barcode128';
import { code128Bars } from '../../utils/code128';
import { create as createQr } from 'qrcode';

import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

pdfMake.vfs = pdfFonts.vfs;

/** Etiket kâğıdı: A4'te 4 × 16 = 64 ya da 4 × 10 = 40 etiket; kullanıcının son seçimi tarayıcıda hatırlanır. */
export type SheetKind = '64' | '40';
const SHEET_STORAGE_KEY = 'qrlist.sheet';

/**
 * Etiket kâğıdı yerleşimi (A4, mm) ve o etikete göre içerik ölçüleri. Her hücre bir etikettir; etiket ölçüsü
 * kenar boşluklarından sonra kalan alandan çıkar: (210 - 2 × marginX) / columns × (297 - 2 × marginY) / rows.
 *
 * QR etiketi: solda QR, sağında "Belge Numarası" ve numara. pdfmake QR modülünü tam punto sayısına yuvarlar
 * (21 modüllük QR'da 15 mm → 2 pt modül → 14,8 mm); daha küçük değer modülü 1 pt'ye düşürüp QR'ı yarıya indirir,
 * 3 pt modül (22,2 mm) ise 40'lık etikette yazıcının basamadığı kenar şeridine taşar.
 *
 * Code 128 barkod: en ince çubuk en fazla 0,33 mm; barkod etikette en fazla barcodeMaxWidthMm yer kaplar.
 * Evrak numarası 134 modül tutar; iki yanda kalan boşluk sessiz boşluğu (10 modül ≈ 3 mm) karşılar.
 * Numara barkodun altında harf aralıklı yazılır.
 */
interface SheetLayout {
  /** Ekranda ve yazdırma notunda görünen ad */
  name: string;
  columns: number;
  rows: number;
  marginXMm: number;
  marginYMm: number;
  qrSizeMm: number;
  qrPadXMm: number;
  qrTextGapMm: number;
  qrCaptionPt: number;
  qrNumberPt: number;
  barcodeMaxWidthMm: number;
  barcodeHeightMm: number;
  barcodeTextPt: number;
}

const SHEETS: Record<SheetKind, SheetLayout> = {
  // 64'lük kâğıt: yanlarda 4, üst/altta 6,65 mm boşluk → etiket 50,5 × 17,73 mm
  '64': {
    name: "64'lük", columns: 4, rows: 16, marginXMm: 4, marginYMm: 6.65,
    qrSizeMm: 15, qrPadXMm: 2, qrTextGapMm: 2, qrCaptionPt: 6.6, qrNumberPt: 9.9,
    barcodeMaxWidthMm: 38.5, barcodeHeightMm: 9, barcodeTextPt: 7
  },
  // 40'lık kâğıt (Tanex TW-2040 / Avery 3651): kenar boşluksuz → etiket 52,5 × 29,7 mm
  '40': {
    name: "40'lık", columns: 4, rows: 10, marginXMm: 0, marginYMm: 0,
    qrSizeMm: 15, qrPadXMm: 5, qrTextGapMm: 2.5, qrCaptionPt: 7.15, qrNumberPt: 10.45,
    barcodeMaxWidthMm: 41.5, barcodeHeightMm: 12, barcodeTextPt: 9
  }
};

const labelWidthMm = (s: SheetLayout) => (210 - 2 * s.marginXMm) / s.columns;
const labelHeightMm = (s: SheetLayout) => (297 - 2 * s.marginYMm) / s.rows;

const BARCODE_MAX_MODULE_MM = 0.33;
const BARCODE_TEXT_SPACING_PT = 1.6;
const BARCODE_TEXT_GAP_MM = 0.8;
/** pdfmake (Roboto) satır yüksekliği yazı boyunun yaklaşık bu katı */
const LINE_HEIGHT = 1.17;
const mm = (v: number) => v * 72 / 25.4;
/** pdfmake'in qrSizeMm (15 mm) için bastığı QR'ın gerçek ölçüsü: 21 modül × 2 pt ≈ 14,8 mm */
const QR_BASE_MM = 21 * 2 * 25.4 / 72;
/** Baskıda QR bu ölçeğe küçültülür */
const QR_SCALE = 0.9;
/**
 * QR'ı vektör dikdörtgenlerle çizer. pdfmake'in kendi `qr` düğümü modülü tam punto sayısına yuvarladığından
 * ara ölçüler (ör. %90) basılamıyor; burada modül kesirli olabilir. Hata düzeltme düzeyi pdfmake'teki gibi 'L'.
 */
function qrRects(text: string, size: number): any[] {
  const { modules } = createQr(text, { errorCorrectionLevel: 'L' });
  const n = modules.size;
  const module = size / n;
  const rects: any[] = [];
  // Satırdaki ardışık koyu modüller tek dikdörtgen olur; kesirli ölçüde modüller arasında ince çizgi kalmaz
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (!modules.get(row, col)) continue;
      const start = col;
      while (col + 1 < n && modules.get(row, col + 1)) col++;
      rects.push({ type: 'rect', x: start * module, y: row * module, w: (col - start + 1) * module, h: module, color: '#000' });
    }
  }
  return rects;
}
/**
 * Satır yükseklikleri toplamı kullanılabilir yüksekliğe tam eşit; kayan nokta yuvarlaması toplamı aşarsa pdfmake son
 * satırı sonraki sayfaya iter. Her satırdan alınan bu pay 16 satırda ~0,06 mm eder, hizayı bozmaz.
 */
const ROW_HEIGHT_SLACK_PT = 0.01;
/**
 * Baskıda sütun başına içerik kaydırması (pt; CSS px = 0,75 pt): 3. sütun 8 px, 4. sütun 16 px sağa. Izgara yerinde
 * kalır, yalnızca etiketin içeriği kayar.
 */
const COLUMN_SHIFT_PT = [0, 0, 8 * 0.75, 16 * 0.75];
/** Baskıda satır başına aşağı kaydırma (mm): üstten n. satırın içeriği (n - 1) × bu kadar aşağı kayar */
const ROW_STEP_MM = 0.1;
/**
 * Baskıda alt satırlarda ek aşağı kaydırma (mm): ROW_EXTRA_FROM. satır (1'den sayılır) ve altındaki satırlar, ROW_STEP_MM'ye
 * ek olarak sabit ROW_EXTRA_MM kadar daha aşağı kayar.
 */
const ROW_EXTRA_FROM = 9;
const ROW_EXTRA_MM = 0.1;
/**
 * Baskıda artan ek aşağı kaydırma (mm): ROW_RAMP_FROM. satırdan itibaren her satır, diğer kaydırmalara ek olarak
 * bir öncekinden ROW_RAMP_STEP_MM daha kayar (8. satır +0,1, 9. satır +0,2, 10. satır +0,3 ...).
 */
const ROW_RAMP_FROM = 8;
const ROW_RAMP_STEP_MM = 0.1;
/** Baskıda en üstteki ROW_TOP_COUNT satırın içeriği, ROW_STEP_MM kaydırmasına ek olarak ROW_TOP_UP_MM yukarı alınır */
const ROW_TOP_COUNT = 3;
const ROW_TOP_UP_MM = 0.6;
/**
 * Baskıda en alttaki ROW_BOTTOM_COUNT satır ek olarak aşağı alınır: en alttan yukarı doğru
 * ROW_BOTTOM_COUNT × ROW_BOTTOM_STEP_MM, ..., 1 × ROW_BOTTOM_STEP_MM (en alt 0,6, üstü 0,4, onun üstü 0,2 mm).
 */
const ROW_BOTTOM_COUNT = 3;
const ROW_BOTTOM_STEP_MM = 0.2;
/** Backend Reserve isteğinde count 1–100 arasında olmalı; daha büyük istek 100'lük parçalara bölünür. */
const MIN_COUNT = 1;
const RESERVE_CHUNK = 100;
/** Tek seferde en fazla bu kadar tam sayfa (64'lükte 320, 40'lıkta 200 etiket) */
const MAX_PAGES = 5;

/** Etiket biçimi: QR kod ya da Code 128 barkod; kullanıcının son seçimi tarayıcıda hatırlanır. */
export type LabelFormat = 'qr' | 'barkod';
const FORMAT_STORAGE_KEY = 'qrlist.format';

function readFormat(): LabelFormat {
  try {
    return localStorage.getItem(FORMAT_STORAGE_KEY) === 'barkod' ? 'barkod' : 'qr';
  } catch {
    return 'qr';
  }
}

function readSheet(): SheetKind {
  try {
    return localStorage.getItem(SHEET_STORAGE_KEY) === '40' ? '40' : '64';
  } catch {
    return '64';
  }
}

interface QrLabel {
  no: string;
  cancelled: boolean;
}

/**
 * Son alınan liste tarayıcıda saklanır; sayfadan çıkılsa da "Son listeyi aç" ile geri getirilip yeniden basılabilir.
 * Yalnızca bu tarayıcıda görünür; numaranın bu arada evrakta kullanılıp kullanılmadığını bilmez.
 */
interface LastList {
  /** Numaraların alındığı an (ISO) */
  at: string;
  labels: QrLabel[];
  printed: boolean;
}
const LAST_LIST_STORAGE_KEY = 'qrlist.lastList';

function readLastList(): LastList | null {
  try {
    const raw = localStorage.getItem(LAST_LIST_STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as LastList;
    const ok = typeof v?.at === 'string' && Array.isArray(v.labels) && v.labels.length > 0
      && v.labels.every(x => typeof x?.no === 'string');
    return ok ? { at: v.at, labels: v.labels.map(x => ({ no: x.no, cancelled: !!x.cancelled })), printed: !!v.printed } : null;
  } catch {
    return null;
  }
}

@Component({
  imports: [
    GenericModel,
    CommonModule,
    FormsModule,
    QRCodeComponent,
    Barcode128
  ],
  templateUrl: './qrlist.html',
  styleUrl: './qrlist.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Qrlist implements OnInit {

  readonly #numbers = inject(AtlasDocumentNumberService);
  readonly #common = inject(Common);
  readonly #toast = inject(FlexiToastService);

  /** Etiket biçimi: QR ya da barkod; ekrandaki önizleme ve yazdırma buna göre */
  readonly format = signal<LabelFormat>(readFormat());

  setFormat(format: LabelFormat) {
    this.format.set(format);
    try {
      localStorage.setItem(FORMAT_STORAGE_KEY, format);
    } catch {
      // Tarayıcı depolaması kapalıysa seçim yalnızca bu oturumda geçerli
    }
  }

  /** Etiket kâğıdı: 64'lük ya da 40'lık; önizleme, sayfa hesabı ve yazdırma buna göre */
  readonly sheetKind = signal<SheetKind>(readSheet());
  readonly layout = computed(() => SHEETS[this.sheetKind()]);

  setSheet(kind: SheetKind) {
    if (kind === this.sheetKind()) return;
    this.sheetKind.set(kind);
    try {
      localStorage.setItem(SHEET_STORAGE_KEY, kind);
    } catch {
      // Tarayıcı depolaması kapalıysa seçim yalnızca bu oturumda geçerli
    }
    // Adet birimindeki miktar yeni kâğıdın sınırına çekilir (64'lükte en fazla 320, 40'lıkta 200 etiket)
    this.amount.set(Math.min(Math.max(Number(this.amount()) || 1, this.minAmount), this.maxAmount()));
  }

  /** Bir A4 sayfadaki etiket sayısı (4 × 16 = 64 ya da 4 × 10 = 40) */
  readonly columns = computed(() => this.layout().columns);
  readonly labelsPerPage = computed(() => this.layout().columns * this.layout().rows);
  /** Önizlemede etiket oranı (genişlik / yükseklik) */
  readonly labelRatio = computed(() => labelWidthMm(this.layout()) / labelHeightMm(this.layout()));
  /** Önizlemede QR yüksekliği, etiket yüksekliğine oranla (baskıdaki gibi) */
  readonly qrHeight = computed(() => `${Math.round(this.layout().qrSizeMm / labelHeightMm(this.layout()) * 100)}%`);
  /** Yazdırma notunda etiket ölçüsü, ör. "50,5 × 17,7" */
  readonly labelSizeText = computed(() => {
    const f = (v: number) => (Math.round(v * 10) / 10).toString().replace('.', ',');
    return `${f(labelWidthMm(this.layout()))} × ${f(labelHeightMm(this.layout()))}`;
  });

  /**
   * Miktar adet ya da tam sayfa olarak girilir; sayfa × sayfadaki etiket istenir. Tek seferde en fazla MAX_PAGES
   * sayfa; adet sınırı da o kadar sayfanın etiketi.
   */
  readonly unit = signal<'adet' | 'sayfa'>('sayfa');
  readonly maxPages = MAX_PAGES;
  readonly minAmount = MIN_COUNT;
  readonly maxAmount = computed(() => this.unit() === 'sayfa' ? MAX_PAGES : MAX_PAGES * this.labelsPerPage());

  /** Girilen miktar (birime göre adet ya da sayfa); numaralar yalnızca "Numara Al" ile istenir. */
  readonly amount = signal(1);
  /** Kutuya elle yazılırken boş ya da geçersiz değer gelebilir; − / + düğmeleri bununla çalışır */
  readonly amountNumber = computed(() => Number(this.amount()) || 0);

  /** − / + düğmeleri: miktarı bir artırır ya da azaltır, sınırların dışına çıkmaz */
  stepAmount(delta: number) {
    const next = Math.round(this.amountNumber()) + delta;
    this.amount.set(Math.min(Math.max(next, this.minAmount), this.maxAmount()));
  }
  /** İstenecek etiket adedi */
  readonly requestedCount = computed(() => {
    const n = Number(this.amount());
    return this.unit() === 'sayfa' ? n * this.labelsPerPage() : n;
  });
  readonly reserving = signal(false);

  /** Backend'in ayırdığı numaralar; QR içeriği numaranın kendisidir ("/" dahil). */
  readonly labels = signal<QrLabel[]>([]);
  /** Ayrılan numaralar yazdırıldı mı; yazdırılmadan yeni numara alınırsa öncekiler sahipsiz kalır. */
  readonly printed = signal(false);
  /** Ekrandaki listenin alındığı an; tarayıcıda saklanan son listeye yazılır */
  #reservedAt: string | null = null;
  /** Tarayıcıda saklanan son liste; ekranda liste yokken "Son listeyi aç" ile geri getirilir */
  readonly lastList = signal<LastList | null>(readLastList());
  readonly lastListActive = computed(() => this.lastList()?.labels.filter(x => !x.cancelled).length ?? 0);
  /** Ekrandaki liste zaten son liste mi; öyleyse "Son Liste" düğmesi pasif */
  readonly showingLastList = computed(() => this.labels().length > 0 && this.labels() === this.lastList()?.labels);

  /** Ekrandaki liste son liste olarak saklanır (numara alınınca, iptal edilince, yazdırılınca) */
  #saveLastList() {
    if (!this.#reservedAt || this.labels().length === 0) return;
    const list: LastList = { at: this.#reservedAt, labels: this.labels(), printed: this.printed() };
    this.lastList.set(list);
    try {
      localStorage.setItem(LAST_LIST_STORAGE_KEY, JSON.stringify(list));
    } catch {
      // Tarayıcı depolaması kapalıysa son liste yalnızca bu oturumda kalır
    }
  }

  /** Yazdırılmamış numara varken menüden başka sayfaya geçilirse sorulur (route canDeactivate) */
  canDeactivate(): boolean {
    if (!this.printReady()) return true;
    return confirm('Ayrılan numaralar yazdırılmadı. Sayfadan çıkmak istiyor musunuz?\n\nListeye daha sonra "Son Liste" ile ulaşabilirsiniz.');
  }

  /** Sekme kapatılır ya da sayfa yenilenirse tarayıcının kendi uyarısı çıkar (metin özelleştirilemez) */
  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    if (this.printReady()) {
      event.preventDefault();
      event.returnValue = true;
    }
  }

  /** Saklanan son listeyi ekrana getirir; yazdırılıp yazdırılmadığı da korunur */
  openLastList() {
    const list = this.lastList();
    if (!list || this.reserving()) return;
    this.#reservedAt = list.at;
    this.labels.set(list.labels);
    this.printed.set(list.printed);
    this.notice.set(null);
  }
  /**
   * Havuzda istenenden az numara varsa ya da hiç alınamadıysa backend'in açıklaması. Kapanmadan kalır:
   * Barkod Servisi hatasında metnin sonunda servis sorumlusuna iletilecek takip kodu olabilir.
   */
  readonly notice = signal<{ message: string; error: boolean } | null>(null);

  readonly stock = signal<AtlasNumberStock | null>(null);
  readonly stockLow = computed(() => {
    const s = this.stock();
    return !!s && s.available < s.minStock;
  });

  /** İptal isteği süren numara; istek bitene kadar o kartın çarpısı pasif kalır. */
  readonly cancellingNo = signal<string | null>(null);

  readonly activeLabels = computed(() => this.labels().filter(x => !x.cancelled));
  readonly cancelledCount = computed(() => this.labels().length - this.activeLabels().length);

  /** Önizleme yaprakları: basılacak (iptal edilmemiş) numaralar, baskıdaki sırayla sayfa sayfa. */
  readonly sheets = computed(() => {
    const nos = this.activeLabels().map(x => x.no);
    const pages: string[][] = [];
    for (let i = 0; i < nos.length; i += this.labelsPerPage()) pages.push(nos.slice(i, i + this.labelsPerPage()));
    return pages;
  });

  /** Basılmamış etiket var: ana işlem Yazdır; yoksa Numara Al. */
  readonly printReady = computed(() => this.activeLabels().length > 0 && !this.printed());

  /**
   * Kart ekranın altına (sabit alt bilgi çubuğunun üstüne) kadar uzar: yazdırma notu hep ekranın altında durur,
   * etiketler sığmazsa yalnızca etiket alanı kayar. Yükseklik ekranda ölçülür, pencere boyu değişince yenilenir.
   */
  protected readonly cardRef = viewChild<ElementRef<HTMLElement>>('card');
  readonly cardHeight = signal<number | null>(null);

  constructor() {
    afterNextRender(() => this.fitCard());
  }

  @HostListener('window:resize')
  fitCard() {
    const card = this.cardRef()?.nativeElement;
    if (!card) return;
    const top = card.getBoundingClientRect().top + window.scrollY;
    const footer = document.querySelector('.fixed-footer')?.getBoundingClientRect().height ?? 0;
    const GAP_PX = 12;
    const MIN_PX = 420;
    this.cardHeight.set(Math.max(MIN_PX, Math.floor(window.innerHeight - top - footer - GAP_PX)));
  }

  ngOnInit() {
    this.loadStock();
  }

  /** Birim değişince miktar yeni birime çevrilir (ör. 80 adet → 2 sayfa, 2 sayfa → 80 adet). */
  setUnit(unit: 'adet' | 'sayfa') {
    if (unit === this.unit()) return;
    const amount = Number(this.amount()) || 1;
    const next = unit === 'sayfa' ? Math.round(amount / this.labelsPerPage()) : amount * this.labelsPerPage();
    this.unit.set(unit);
    this.amount.set(Math.min(Math.max(next, this.minAmount), this.maxAmount()));
  }

  loadStock() {
    // Havuz durumu isteğe bağlı bilgi; alınamazsa alan gizli kalır.
    this.#numbers.getStock().subscribe({
      next: s => this.stock.set(s ?? null),
      error: () => this.stock.set(null)
    });
  }

  reserve() {
    if (this.reserving()) return;

    const userId = this.#common.user()?.id;
    if (!userId) {
      this.#toast.showToast('Hata', 'Kullanıcı bilgisi bulunamadı.', 'error');
      return;
    }

    const amount = Number(this.amount());
    if (!Number.isInteger(amount) || amount < this.minAmount || amount > this.maxAmount()) {
      const what = this.unit() === 'sayfa' ? 'Sayfa sayısı' : 'Etiket adedi';
      this.#toast.showToast('Uyarı', `${what} ${this.minAmount} ile ${this.maxAmount()} arasında olmalı.`, 'warning');
      return;
    }
    const count = this.requestedCount();

    if (this.activeLabels().length > 0 && !this.printed()) {
      this.#toast.showToast('Uyarı', 'Önce ayrılan numaraları yazdırın ya da iptal edin.', 'warning');
      return;
    }

    // Backend tek istekte en fazla 100 numara verir: istek parçalara bölünüp sırayla gönderilir. Bir parça tam
    // karşılanmazsa (havuz ve Barkod Servisi yetmedi) sonrakiler istenmez.
    this.reserving.set(true);
    const received: string[] = [];
    const requestChunk = () => {
      const want = Math.min(RESERVE_CHUNK, count - received.length);
      this.#numbers.reserve(userId, want).subscribe({
        next: res => {
          const data = res?.data ?? [];
          received.push(...data);
          if (data.length === want && received.length < count) {
            requestChunk();
            return;
          }
          const short = received.length < count;
          this.#finishReserve(received, short && res?.message
            ? { message: count > RESERVE_CHUNK ? `${count} numara istendi, ${received.length} numara alınabildi. ${res.message}` : res.message, error: false }
            : null);
        },
        error: err => {
          // Önceki parçalarda alınan numaralar ayrılmış durumda; kaybolmasın diye ekrana gelir
          const message = atlasErrorMessage(err, 'Numara alınamadı.');
          this.#finishReserve(received, {
            message: received.length ? `${count} numara istendi, ${received.length} numara alınabildi. ${message}` : message,
            error: true
          });
          this.#toast.showToast('Hata', message, 'error');
        }
      });
    };
    requestChunk();
  }

  #finishReserve(numbers: string[], notice: { message: string; error: boolean } | null) {
    if (numbers.length) {
      this.labels.set(numbers.map(no => ({ no, cancelled: false })));
      this.printed.set(false);
      this.#reservedAt = new Date().toISOString();
      this.#saveLastList();
    }
    this.notice.set(notice);
    this.reserving.set(false);
    this.loadStock();
  }

  /** Hatalı basılan etiketin numarası onay ve sebep sorulmadan iptal edilir. */
  cancel(no: string) {
    if (this.cancellingNo()) return;

    const userId = this.#common.user()?.id;
    if (!userId) {
      this.#toast.showToast('Hata', 'Kullanıcı bilgisi bulunamadı.', 'error');
      return;
    }

    this.cancellingNo.set(no);
    this.#numbers.cancel(no, userId).subscribe({
      next: () => {
        // Sonuç kartta görünür; ayrıca toast gösterilmez.
        this.labels.update(list => list.map(x => x.no === no ? { ...x, cancelled: true } : x));
        this.#saveLastList();
        this.cancellingNo.set(null);
        this.loadStock();
      },
      error: err => {
        this.#toast.showToast('Hata', atlasErrorMessage(err, 'Numara iptal edilemedi.'), 'error');
        this.cancellingNo.set(null);
      }
    });
  }

  printQrList() {
    const documents = this.activeLabels().map(x => x.no);
    if (documents.length === 0) return;

    const s = this.layout();
    const labelHeight = mm(labelHeightMm(s)) - ROW_HEIGHT_SLACK_PT;
    const labelWidth = mm(labelWidthMm(s));
    // pdfmake hücre içeriğini dikey ortalamaz; üst boşluklar elle hesaplanır.
    const middle = (height: number) => Math.max(0, (labelHeight - height) / 2);

    // QR: solda kare kod, sağında iki satır yazı; yazı bloğu QR'a göre dikey ortalanır. Yazı sütunu içeriği kadar
    // geniş ('auto'), böylece başlık numaranın genişliğine göre ortalanır.
    const qrCell = (no: string, shift: number): any => {
      const qrSize = mm(s.qrSizeMm);
      const drawSize = mm(QR_BASE_MM * QR_SCALE);
      const captionGap = mm(0.6);
      const textHeight = s.qrCaptionPt * LINE_HEIGHT + captionGap + s.qrNumberPt * LINE_HEIGHT;
      return {
        columns: [
          {
            width: qrSize,
            canvas: qrRects(no, drawSize),
            // Küçülen QR eski QR alanında (QR_BASE_MM) ortalı kalır; yazı yerinden oynamaz
            margin: [(mm(QR_BASE_MM) - drawSize) / 2, (mm(QR_BASE_MM) - drawSize) / 2, 0, 0]
          },
          {
            width: 'auto',
            stack: [
              { text: 'Belge Numarası', fontSize: s.qrCaptionPt, bold: true, color: '#444', characterSpacing: 0.4, alignment: 'center' },
              { text: no, fontSize: s.qrNumberPt, bold: true, margin: [0, captionGap, 0, 0] }
            ],
            // Sağdaki boş alanda ortalı dursun diye yazı bloğu ~1,2 mm (ekranda ~4-5 px) sağa alınır
            margin: [mm(1.2), Math.max(0, (qrSize - textHeight) / 2), 0, 0]
          }
        ],
        columnGap: mm(s.qrTextGapMm),
        margin: [mm(s.qrPadXMm) + shift, middle(qrSize), Math.max(0, mm(s.qrPadXMm) - shift), 0]
      };
    };

    // Barkod: üstte çubuklar, altında harf aralıklı numara
    const barcodeCell = (no: string, shift: number): any => {
      const height = mm(s.barcodeHeightMm);
      const textGap = mm(BARCODE_TEXT_GAP_MM);
      // Barkod vektör dikdörtgenlerle çizilir; canvas hizalanmadığı için sol boşlukla ortalanır
      const { bars, modules } = code128Bars(no);
      const module = Math.min(mm(BARCODE_MAX_MODULE_MM), mm(s.barcodeMaxWidthMm) / modules);
      return {
        stack: [
          {
            canvas: bars.map(b => ({ type: 'rect', x: b.x * module, y: 0, w: b.w * module, h: height, color: '#000' })),
            margin: [Math.max(0, (labelWidth - modules * module) / 2) + shift, 0, 0, 0]
          },
          {
            // Ortalanan metin sol boşluğun yarısı kadar kayar; 2 × shift ile çubuklarla aynı miktarda kayar
            text: no, fontSize: s.barcodeTextPt, characterSpacing: BARCODE_TEXT_SPACING_PT,
            alignment: 'center', margin: [2 * shift, textGap, 0, 0]
          }
        ],
        margin: [0, middle(height + textGap + s.barcodeTextPt * LINE_HEIGHT), 0, 0]
      };
    };

    const cell = this.format() === 'barkod' ? barcodeCell : qrCell;

    const rows: any[][] = [];
    for (let i = 0; i < documents.length; i += s.columns) {
      // Sayfadaki satır sırası: her satırın içeriği bir üsttekinden ROW_STEP_MM daha aşağı (ilk satır yerinde).
      // relativePosition satır yüksekliğini değiştirmez; ızgara ve sayfa sonu yerinde kalır.
      const r = (i / s.columns) % s.rows;
      const dy = mm(ROW_STEP_MM) * r + (r >= ROW_EXTRA_FROM - 1 ? mm(ROW_EXTRA_MM) : 0)
        + mm(ROW_RAMP_STEP_MM) * Math.max(0, r - (ROW_RAMP_FROM - 2))
        - (r < ROW_TOP_COUNT ? mm(ROW_TOP_UP_MM) : 0)
        + mm(ROW_BOTTOM_STEP_MM) * Math.max(0, r - (s.rows - 1 - ROW_BOTTOM_COUNT));
      const row: any[] = documents.slice(i, i + s.columns)
        .map((no, col) => ({ stack: [cell(no, COLUMN_SHIFT_PT[col] ?? 0)], relativePosition: { x: 0, y: dy } }));
      while (row.length < s.columns) row.push({ text: '' });
      rows.push(row);
    }

    // Her sayfa ayrı tablo: satır yükseklikleri sabit olduğundan sayfa sonu etiket sınırına denk gelir,
    // yuvarlama farkı yüzünden bir satırın sonraki sayfaya kayması önlenir.
    const content: any[] = [];
    for (let i = 0; i < rows.length; i += s.rows) {
      const pageRows = rows.slice(i, i + s.rows);
      content.push({
        table: {
          widths: Array(s.columns).fill('*'),
          heights: pageRows.map(() => labelHeight),
          dontBreakRows: true,
          body: pageRows
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingLeft: () => 0,
          paddingRight: () => 0,
          paddingTop: () => 0,
          paddingBottom: () => 0
        },
        ...(i > 0 ? { pageBreak: 'before' } : {})
      });
    }

    const marginX = mm(s.marginXMm);
    const marginY = mm(s.marginYMm);
    const docDefinition: TDocumentDefinitions = {
      pageSize: 'A4',
      pageMargins: [marginX, marginY, marginX, marginY],
      content
    };

    pdfMake.createPdf(docDefinition).print();
    this.printed.set(true);
    this.#saveLastList();
  }

}
