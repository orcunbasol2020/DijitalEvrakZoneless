import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import GenericModel from '../../../components/generic-model/generic-model';

import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

pdfMake.vfs = pdfFonts.vfs;

/** PDF düzeni: A4, 4 sütun; her hücre ~89pt yüksekliğinde olduğundan sayfaya ~9 satır sığar. */
const PDF_COLUMNS = 4;
const PDF_ROWS_PER_PAGE = 9;
/** Ekranda gösterilecek en fazla temsili etiket sayısı; gerisi özet notuyla belirtilir. */
const PREVIEW_LIMIT = 24;

@Component({
  imports: [
    GenericModel,
    CommonModule,
    FormsModule
  ],
  templateUrl: './qrlist.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Qrlist {

  readonly counts = [1, 10, 50, 100, 200, 500, 1000];
  readonly selectedCount = signal(50);
  readonly documents = computed(() =>
    Array.from({ length: this.selectedCount() }, (_, i) => `2025/2525567/${i + 1}`)
  );

  /** Ekranda yalnızca ilk PREVIEW_LIMIT etiket çizilir; 1000 seçildiğinde sayfa kilitlenmez. */
  readonly previewDocuments = computed(() => this.documents().slice(0, PREVIEW_LIMIT));
  readonly hiddenCount = computed(() => Math.max(0, this.documents().length - PREVIEW_LIMIT));

  readonly firstDocument = computed(() => this.documents()[0]);
  readonly lastDocument = computed(() => this.documents()[this.documents().length - 1]);

  readonly estimatedPages = computed(() => {
    const rows = Math.ceil(this.documents().length / PDF_COLUMNS);
    return Math.max(1, Math.ceil(rows / PDF_ROWS_PER_PAGE));
  });

  updateDocuments(count: number) {
    this.selectedCount.set(count);
  }

  printQrList() {
    const documents = this.documents();
    const tableBody: any[] = [];
    let row: any[] = [];

    for (let i = 0; i < documents.length; i++) {
      row.push({
        stack: [
          { qr: documents[i], fit: 70, alignment: "center" },
          { text: documents[i], fontSize: 9, alignment: "center", margin: [0, 4, 0, 0] }
        ]
      });

      if (row.length === PDF_COLUMNS) {
        tableBody.push(row);
        row = [];
      }
    }

    if (row.length > 0) {
      while (row.length < PDF_COLUMNS) row.push({ text: "" });
      tableBody.push(row);
    }

    const docDefinition: TDocumentDefinitions = {
      pageSize: 'A4',
      pageMargins: [10, 10, 10, 10],
      content: [{ table: { widths: ['*', '*', '*', '*'], body: tableBody }, layout: 'noBorders' }]
    };

    pdfMake.createPdf(docDefinition).print();
  }

}
