import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import GenericModel from '../../../components/generic-model/generic-model';

import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

pdfMake.vfs = pdfFonts.vfs;

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

  counts = [1, 10, 50, 100, 200, 500, 1000];
  selectedCount = 50;
  documents: string[] = [];

  constructor() {
    this.updateDocuments(this.selectedCount);
  }

  updateDocuments(count: number) {
    this.selectedCount = count;
    this.documents = Array.from({ length: count }, (_, i) => `2025/2525567/${i + 1}`);
  }

  printQrList() {

    const tableBody: any[] = [];
    let row: any[] = [];

    for (let i = 0; i < this.documents.length; i++) {
      row.push({
        stack: [
          { qr: this.documents[i], fit: 70, alignment: "center" },
          { text: this.documents[i], fontSize: 9, alignment: "center", margin: [0, 4, 0, 0] }
        ]
      });

      if (row.length === 4) {
        tableBody.push(row);
        row = [];
      }
    }

    if (row.length > 0) {
      while (row.length < 4) row.push({ text: "" });
      tableBody.push(row);
    }

    const docDefinition: TDocumentDefinitions = {
      pageSize: 'A4',
      pageMargins: [10, 10, 10, 10],
      content: [{ table: { widths: ['*','*','*','*'], body: tableBody }, layout: 'noBorders' }]
    };

    pdfMake.createPdf(docDefinition).print();
  }

}