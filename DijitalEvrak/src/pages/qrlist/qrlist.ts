import { ChangeDetectionStrategy, Component, OnInit, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { QRCodeComponent } from 'angularx-qrcode';
import { FlexiToastService } from 'flexi-toast';
import GenericModel from '../../../components/generic-model/generic-model';
import { Common } from '../../services/common';
import { AtlasDocumentNumberService, AtlasNumberStock, atlasErrorMessage } from '../../services/atlas-document-number';

import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

pdfMake.vfs = pdfFonts.vfs;

/**
 * Etiket yerleşimi (A4, mm). Her hücre sabit ölçülü bir etikettir; içerik hücrede dikey ve yatay
 * ortalanır, böylece satırlar arası boşluk içerikten bağımsız ve eşit olur. Etiket kâğıdı
 * değişirse yalnızca bu değerler ayarlanır: LABEL_HEIGHT_MM * PDF_ROWS_PER_PAGE + 2 * PAGE_MARGIN_Y_MM ≤ 297.
 */
const PDF_COLUMNS = 4;
const PDF_ROWS_PER_PAGE = 8;
const PAGE_MARGIN_X_MM = 10;
const PAGE_MARGIN_Y_MM = 8;
const LABEL_HEIGHT_MM = 35;
const QR_SIZE_MM = 24;
const LABEL_TEXT_SIZE_PT = 9;
const LABEL_TEXT_GAP_MM = 1.5;
const mm = (v: number) => v * 72 / 25.4;
/** Backend Reserve isteğinde count 1–100 arasında olmalı. */
const MIN_COUNT = 1;
const MAX_COUNT = 100;

interface QrLabel {
  no: string;
  cancelled: boolean;
}

@Component({
  imports: [
    GenericModel,
    CommonModule,
    FormsModule,
    QRCodeComponent
  ],
  templateUrl: './qrlist.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Qrlist implements OnInit {

  readonly #numbers = inject(AtlasDocumentNumberService);
  readonly #common = inject(Common);
  readonly #toast = inject(FlexiToastService);

  readonly minCount = MIN_COUNT;
  readonly maxCount = MAX_COUNT;

  /** Kaç etiket basılacak; numaralar yalnızca "Numara Al" ile istenir, sayfa açılışında istenmez. */
  readonly count = signal(1);
  readonly reserving = signal(false);

  /** Backend'in ayırdığı numaralar; QR içeriği numaranın kendisidir ("/" dahil). */
  readonly labels = signal<QrLabel[]>([]);
  /** Ayrılan numaralar yazdırıldı mı; yazdırılmadan yeni numara alınırsa öncekiler sahipsiz kalır. */
  readonly printed = signal(false);
  /** Havuzda istenenden az numara varsa backend'in açıklaması. */
  readonly notice = signal<string | null>(null);

  readonly stock = signal<AtlasNumberStock | null>(null);
  readonly stockLow = computed(() => {
    const s = this.stock();
    return !!s && s.available < s.minStock;
  });

  /** İptal isteği süren numara; istek bitene kadar o kartın çarpısı pasif kalır. */
  readonly cancellingNo = signal<string | null>(null);

  readonly activeLabels = computed(() => this.labels().filter(x => !x.cancelled));
  readonly cancelledCount = computed(() => this.labels().length - this.activeLabels().length);

  readonly estimatedPages = computed(() => {
    const rows = Math.ceil(this.activeLabels().length / PDF_COLUMNS);
    return Math.max(1, Math.ceil(rows / PDF_ROWS_PER_PAGE));
  });

  ngOnInit() {
    this.loadStock();
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

    const count = Number(this.count());
    if (!Number.isInteger(count) || count < MIN_COUNT || count > MAX_COUNT) {
      this.#toast.showToast('Uyarı', `Etiket adedi ${MIN_COUNT} ile ${MAX_COUNT} arasında olmalı.`, 'warning');
      return;
    }

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
        this.notice.set(data.length < count ? (res?.message || null) : null);
        this.reserving.set(false);
        this.loadStock();
      },
      error: err => {
        this.#toast.showToast('Hata', atlasErrorMessage(err, 'Numara alınamadı.'), 'error');
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

    const labelHeight = mm(LABEL_HEIGHT_MM);
    const qrSize = mm(QR_SIZE_MM);
    const textGap = mm(LABEL_TEXT_GAP_MM);
    // pdfmake hücre içeriğini dikey ortalamaz; üst boşluk elle hesaplanır.
    const contentHeight = qrSize + textGap + LABEL_TEXT_SIZE_PT * 1.2;
    const topOffset = Math.max(0, (labelHeight - contentHeight) / 2);

    const cell = (no: string): any => ({
      stack: [
        { qr: no, fit: qrSize, alignment: 'center' },
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
