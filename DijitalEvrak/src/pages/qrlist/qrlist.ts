import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { QRCodeComponent } from 'angularx-qrcode';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import GenericModel from '../../../components/generic-model/generic-model';
import { PrintPreview } from '../printpreview/printpreview';

import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

pdfMake.vfs = pdfFonts.vfs;

@Component({
  imports: [
    GenericModel,
    QRCodeComponent,
    CommonModule,
    FormsModule,
    PrintPreview
  ],
  templateUrl: './qrlist.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Qrlist {

  selectedCount = 50;
  counts = [1, 10, 50, 100, 200, 1000];

  previewOpen = false;
  previewData: string[] = [];
  previewIsQrList = false;

  documents = Array.from({ length: 50 }, (_, i) => `2025/2525567/${i + 1}`);

  constructor() {
    this.updateDocuments(this.selectedCount);
  }

  // 🚀 PDF ÜRET + YAZDIRMA EKRANINI DİREK AÇ
  async printQrList() {
    const tableBody: any[] = [];
    let row: any[] = [];

    for (let i = 0; i < this.documents.length; i++) {
      const base64 = this.getQrBase64(i);

      row.push({
        stack: [
          { image: base64, width: 70, alignment: "center" },
          {
            text: this.documents[i],
            fontSize: 9,
            margin: [0, 4, 0, 0],
            alignment: "center"
          }
        ]
      });

      if (row.length === 4) {
        tableBody.push(row);
        row = [];
      }
    }

    if (row.length > 0) {
      while (row.length < 4) {
        row.push({ text: "" });
      }
      tableBody.push(row);
    }

    const docDefinition: TDocumentDefinitions = {
      pageSize: 'A4',
      pageMargins: [10, 10, 10, 10],
      content: [
        {
          table: {
            widths: ['*', '*', '*', '*'],
            body: tableBody
          },
          layout: 'noBorders'
        }
      ]
    };

    // 🎯 PDF İNDİRMEK YERİNE → DİREKT PRINT EKRANINI AÇ
    pdfMake.createPdf(docDefinition).print();
  }

  updateDocuments(count: number) {
    this.documents = Array.from({ length: count }, (_, i) => `2025/2525567${i + 1}`);
  }

  testClick() {
    console.log('Button clicked!');
  }

  // QR'tan Base64 alma
  getQrBase64(index: number): string {
    const canvases = document.querySelectorAll('#qr-container canvas');
    const canvas = canvases[index] as HTMLCanvasElement;

    if (!canvas) return '';
    return canvas.toDataURL('image/png');
  }

}
