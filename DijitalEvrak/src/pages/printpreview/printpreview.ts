import { Component, Input, Output, EventEmitter, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import PrintPetition from '../print-petition/print-petition';
import html2pdf from "html2pdf.js";
import Printqrlist from '../printqrlist/printqrlist';
import { PrintEnvelopeLabel } from '../print-envelope-label/print-envelope-label';

@Component({
  selector: 'print-preview',
  standalone: true,
  imports: [
    CommonModule,
    PrintPetition,
    Printqrlist,
    PrintEnvelopeLabel
  ],
  templateUrl: './printpreview.html',
  styleUrls: ['./printpreview.css'],
  encapsulation: ViewEncapsulation.None
})
export class PrintPreview {
  @Input() isLabel = false;
  @Input() data: any;
  @Output() closed = new EventEmitter<void>();
  @Input() isQrList = false;

  @Input() pdfBlobUrl: string | null = null;

  printPdf() {
    if (this.pdfBlobUrl) {
      // Eğer QR PDF modundaysa HTML print çalışmamalı
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = this.pdfBlobUrl;
      document.body.appendChild(iframe);

      iframe.onload = () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      };
      return;
    }

    // --- HTML print mode (Eski dilekçe yapısı) ---
    const element = document.getElementById('print-area');
    if (!element) return;

    const opt: any = {
      margin: 0,
      filename: 'dilekce-alindi-belgesi.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf()
      .from(element)
      .set(opt)
      .outputPdf('blob')
      .then((pdfBlob: Blob) => {
        const blobUrl = URL.createObjectURL(pdfBlob);

        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = blobUrl;

        document.body.appendChild(iframe);

        iframe.onload = () => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        };
      });
  }

  generatePdf() {
    const element = document.getElementById('print-area');
    if (!element) {
      console.error("print-area bulunamadı");
      return;
    }

    const opt: any = {
      margin: 0,
      filename: 'dilekce-alindi-belgesi.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
  }

  print() {
    if (this.pdfBlobUrl) {
      // QR PDF mode → HTML print yerine PDF print
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = this.pdfBlobUrl;

      document.body.appendChild(iframe);

      iframe.onload = () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      };

      return;
    }

    // --- HTML print mode ---
    const printContents = document.querySelector('#print-area')?.innerHTML;
    if (!printContents) return;

    const popupWin = window.open('', '_blank', 'width=800,height=600');
    popupWin!.document.open();

    popupWin!.document.write(`
      <html>
        <head>
          <title>Dilekçe Alındı Belgesi</title>
          <style>
            @page { size: A4; margin: 10mm; }
            body { font-family: Arial, sans-serif; padding: 0; margin: 0; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          ${printContents}
        </body>
      </html>
    `);

    popupWin!.document.close();
  }

  close() {
    this.closed.emit();
  }
}
