import { Injectable } from '@angular/core';

// pdf.js yalnızca küçük resim gerektiğinde yüklenir; worker dosyası derlemede assets/pdfjs altına kopyalanır (angular.json).
// Legacy derleme kullanılır: standart derleme çok yeni JS özellikleri (Map.getOrInsertComputed, Math.sumPrecise ...)
// istediği için kurumdaki eski tarayıcılarda çalışmaz.
const WORKER_SRC = 'assets/pdfjs/pdf.worker.min.mjs';
// Sunucu kısmi indirme (range) desteklemediği için her küçük resimde PDF'in tamamı iner;
// aynı anda en fazla bu kadar PDF indirilip çizilir
const MAX_CONCURRENT = 2;
const JPEG_QUALITY = 0.82;

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

/**
 * PDF'in ilk sayfasından küçük resim (JPEG blob URL) üretir. Sonuçlar oturum boyunca adrese göre
 * önbellekte tutulur; ızgarada sayfa değiştirip geri gelince PDF yeniden indirilmez.
 */
@Injectable({ providedIn: 'root' })
export class PdfThumbnailService {
  private pdfjs?: Promise<PdfJs>;
  private readonly cache = new Map<string, Promise<string>>();
  private readonly queue: (() => void)[] = [];
  private running = 0;

  /** width: CSS piksel cinsinden genişlik; ekran yoğunluğuna göre (en çok 2x) büyütülerek çizilir */
  thumbnail(url: string, width: number): Promise<string> {
    const key = `${url}|${width}`;
    let result = this.cache.get(key);
    if (!result) {
      result = this.schedule(() => this.render(url, width));
      // Hata önbellekte kalmasın; bir sonraki istekte yeniden denensin
      result.catch(() => this.cache.delete(key));
      this.cache.set(key, result);
    }
    return result;
  }

  private schedule<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        this.running++;
        task().then(resolve, reject).finally(() => {
          this.running--;
          this.queue.shift()?.();
        });
      };
      if (this.running < MAX_CONCURRENT) run();
      else this.queue.push(run);
    });
  }

  private loadPdfJs(): Promise<PdfJs> {
    this.pdfjs ??= import('pdfjs-dist/legacy/build/pdf.mjs').then(lib => {
      lib.GlobalWorkerOptions.workerSrc = WORKER_SRC;
      return lib;
    });
    return this.pdfjs;
  }

  private async render(url: string, width: number): Promise<string> {
    const pdfjs = await this.loadPdfJs();
    const task = pdfjs.getDocument({ url, disableAutoFetch: true });
    try {
      const pdf = await task.promise;
      const page = await pdf.getPage(1);
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const viewport = page.getViewport({ scale: (width * ratio) / page.getViewport({ scale: 1 }).width });

      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;

      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
      if (!blob) throw new Error('Küçük resim oluşturulamadı');
      return URL.createObjectURL(blob);
    } finally {
      await task.destroy();
    }
  }
}
