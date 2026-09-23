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

  // Dilekçe alındı belgesi modu: PDF, QR listesi ve zarf etiketi dışındaki tek içerik.
  get isPetition(): boolean {
    return !this.pdfBlobUrl && !this.isQrList && !this.isLabel;
  }

  // Dilekçe şablonunda yazdırma alanının id'si "print-area-dilekce"dir;
  // diğer şablonlar "print-area" kullanır.
  private getPrintArea(): HTMLElement | null {
    return document.getElementById('print-area') ?? document.getElementById('print-area-dilekce');
  }

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
    const element = this.getPrintArea();
    if (!element) return;

    const opt: any = {
      margin: 0,
      filename: 'dilekce-alindi-belgesi.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // Ekrandaki küçültme (zoom) html2canvas çıktısını bozar; PDF üretimi
    // süresince kaldırılıp ardından geri alınır.
    const scaleWrap = element.closest<HTMLElement>('.petition-scale');
    if (scaleWrap) scaleWrap.style.zoom = '1';
    const restoreScale = () => { if (scaleWrap) scaleWrap.style.zoom = ''; };

    html2pdf()
      .from(element)
      .set(opt)
      .outputPdf('blob')
      .then((pdfBlob: Blob) => {
        restoreScale();
        const blobUrl = URL.createObjectURL(pdfBlob);

        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = blobUrl;

        document.body.appendChild(iframe);

        iframe.onload = () => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        };
      })
      .catch((err: unknown) => {
        restoreScale();
        console.error('PDF üretilemedi:', err);
      });
  }

  generatePdf() {
    const element = this.getPrintArea();
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
    const printContents = this.getPrintArea()?.innerHTML;
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
