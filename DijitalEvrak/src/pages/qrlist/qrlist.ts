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

import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

pdfMake.vfs = pdfFonts.vfs;

/**
 * Etiket yerleşimi (A4, mm): Tanex TW-2040 / Avery 3651 — 52,5 × 29,7 mm, 4 × 10 = 40 etiket, kenar boşluksuz.
 * Her hücre bir etikettir; içerik hücrede dikey ve yatay ortalanır. Etiket kâğıdı değişirse yalnızca bu
 * değerler ayarlanır: LABEL_HEIGHT_MM * PDF_ROWS_PER_PAGE + 2 * PAGE_MARGIN_Y_MM ≤ 297.
 * Kâğıt kenara kadar etiket olduğundan yazıcının basamadığı ~4,2 mm'lik kenar şeridine içerik düşmemeli:
 * en üst / en alt satırda içerik ile kâğıt kenarı arası = (LABEL_HEIGHT_MM - içerik yüksekliği) / 2 ≈ 4,3 mm.
 */
const PDF_COLUMNS = 4;
const PDF_ROWS_PER_PAGE = 10;
const PAGE_MARGIN_X_MM = 0;
const PAGE_MARGIN_Y_MM = 0;
const LABEL_HEIGHT_MM = 29.7;
const QR_SIZE_MM = 16;
/**
 * Code 128 barkod: en ince çubuk en fazla 0,33 mm; barkod etikette en fazla BARCODE_MAX_WIDTH_MM yer kaplar.
 * Evrak numarası 134 modül tutar → ~0,31 mm çubuk, 41,5 mm genişlik. İki yanda kalan 5,5 mm hem sessiz
 * boşluğu (10 modül ≈ 3,1 mm) hem de kenar sütunlarda yazıcının basamadığı şeridi karşılar.
 */
const BARCODE_MAX_WIDTH_MM = 41.5;
const BARCODE_MAX_MODULE_MM = 0.33;
const BARCODE_HEIGHT_MM = 12;
const LABEL_TEXT_SIZE_PT = 9;
const LABEL_TEXT_GAP_MM = 1.2;
const mm = (v: number) => v * 72 / 25.4;
/**
 * Satır yükseklikleri toplamı sayfa yüksekliğine tam eşit; kayan nokta yuvarlaması toplamı aşarsa pdfmake son
 * satırı sonraki sayfaya iter. Her satırdan alınan bu pay 10 satırda ~0,04 mm eder, hizayı bozmaz.
 */
const ROW_HEIGHT_SLACK_PT = 0.01;
/** Backend Reserve isteğinde count 1–100 arasında olmalı. */
const MIN_COUNT = 1;
const MAX_COUNT = 100;

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

interface QrLabel {
  no: string;
  cancelled: boolean;
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

  /** Bir A4 sayfadaki etiket sayısı (TW-2040: 4 sütun × 10 satır = 40) */
  readonly columns = PDF_COLUMNS;
  readonly rowsPerPage = PDF_ROWS_PER_PAGE;
  readonly labelsPerPage = PDF_COLUMNS * PDF_ROWS_PER_PAGE;

  /**
   * Miktar adet ya da tam sayfa olarak girilir; sayfa × sayfadaki etiket istenir. Backend sınırı (100) yüzünden
   * tek seferde en fazla floor(100 / 40) = 2 sayfa alınabilir.
   */
  readonly unit = signal<'adet' | 'sayfa'>('adet');
  readonly maxPages = Math.max(1, Math.floor(MAX_COUNT / this.labelsPerPage));
  readonly minAmount = MIN_COUNT;
  readonly maxAmount = computed(() => this.unit() === 'sayfa' ? this.maxPages : MAX_COUNT);

  /** Girilen miktar (birime göre adet ya da sayfa); numaralar yalnızca "Numara Al" ile istenir. */
  readonly amount = signal(1);
  /** İstenecek etiket adedi */
  readonly requestedCount = computed(() => {
    const n = Number(this.amount());
    return this.unit() === 'sayfa' ? n * this.labelsPerPage : n;
  });
  readonly reserving = signal(false);

  /** Backend'in ayırdığı numaralar; QR içeriği numaranın kendisidir ("/" dahil). */
  readonly labels = signal<QrLabel[]>([]);
  /** Ayrılan numaralar yazdırıldı mı; yazdırılmadan yeni numara alınırsa öncekiler sahipsiz kalır. */
  readonly printed = signal(false);
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
    for (let i = 0; i < nos.length; i += this.labelsPerPage) pages.push(nos.slice(i, i + this.labelsPerPage));
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
    const next = unit === 'sayfa' ? Math.round(amount / this.labelsPerPage) : amount * this.labelsPerPage;
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

    this.reserving.set(true);
    this.#numbers.reserve(userId, count).subscribe({
      next: res => {
        const data = res?.data ?? [];
        this.labels.set(data.map(no => ({ no, cancelled: false })));
        this.printed.set(false);
        this.notice.set(data.length < count && res?.message ? { message: res.message, error: false } : null);
        this.reserving.set(false);
        this.loadStock();
      },
      error: err => {
        const message = atlasErrorMessage(err, 'Numara alınamadı.');
        this.notice.set({ message, error: true });
        this.#toast.showToast('Hata', message, 'error');
        this.reserving.set(false);
        this.loadStock();
      }
    });
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

    const labelHeight = mm(LABEL_HEIGHT_MM) - ROW_HEIGHT_SLACK_PT;
    const labelWidth = (mm(210) - 2 * mm(PAGE_MARGIN_X_MM)) / PDF_COLUMNS;
    const textGap = mm(LABEL_TEXT_GAP_MM);
    const barcode = this.format() === 'barkod';
    // Görsel yüksekliği: QR kare, barkod sabit yükseklikte
    const graphicHeight = barcode ? mm(BARCODE_HEIGHT_MM) : mm(QR_SIZE_MM);
    // pdfmake hücre içeriğini dikey ortalamaz; üst boşluk elle hesaplanır.
    const contentHeight = graphicHeight + textGap + LABEL_TEXT_SIZE_PT * 1.2;
    const topOffset = Math.max(0, (labelHeight - contentHeight) / 2);

    const graphic = (no: string): any => {
      if (!barcode) return { qr: no, fit: graphicHeight, alignment: 'center' };
      // Barkod vektör dikdörtgenlerle çizilir; canvas hizalanmadığı için sol boşlukla ortalanır
      const { bars, modules } = code128Bars(no);
      const module = Math.min(mm(BARCODE_MAX_MODULE_MM), mm(BARCODE_MAX_WIDTH_MM) / modules);
      return {
        canvas: bars.map(b => ({ type: 'rect', x: b.x * module, y: 0, w: b.w * module, h: graphicHeight, color: '#000' })),
        margin: [Math.max(0, (labelWidth - modules * module) / 2), 0, 0, 0]
      };
    };

    const cell = (no: string): any => ({
      stack: [
        graphic(no),
        { text: no, fontSize: LABEL_TEXT_SIZE_PT, bold: true, alignment: 'center', margin: [0, textGap, 0, 0] }
      ],
      margin: [0, topOffset, 0, 0]
    });

    const rows: any[][] = [];
    for (let i = 0; i < documents.length; i += PDF_COLUMNS) {
      const row = documents.slice(i, i + PDF_COLUMNS).map(cell);
      while (row.length < PDF_COLUMNS) row.push({ text: '' });
      rows.push(row);
    }

    // Her sayfa ayrı tablo: satır yükseklikleri sabit olduğundan sayfa sonu etiket sınırına denk gelir,
    // yuvarlama farkı yüzünden bir satırın sonraki sayfaya kayması önlenir.
    const content: any[] = [];
    for (let i = 0; i < rows.length; i += PDF_ROWS_PER_PAGE) {
      const pageRows = rows.slice(i, i + PDF_ROWS_PER_PAGE);
      content.push({
        table: {
          widths: Array(PDF_COLUMNS).fill('*'),
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

    const marginX = mm(PAGE_MARGIN_X_MM);
    const marginY = mm(PAGE_MARGIN_Y_MM);
    const docDefinition: TDocumentDefinitions = {
      pageSize: 'A4',
      pageMargins: [marginX, marginY, marginX, marginY],
      content
    };

    pdfMake.createPdf(docDefinition).print();
    this.printed.set(true);
  }

}
