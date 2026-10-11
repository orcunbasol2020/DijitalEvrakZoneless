import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, input, signal } from '@angular/core';
import { PdfThumbnailService } from '../../services/pdf-thumbnail';

const THUMB_WIDTH = 220;

/**
 * Taranmış evrakın ilk sayfası. Ekrana girdiğinde (IntersectionObserver) çizilir;
 * görünmeyen kartlar için PDF indirilmez.
 */
@Component({
  selector: 'app-scan-thumb',
  template: `
    @switch (state()) {
      @case ('ready') { <img [src]="src()" alt="" draggable="false"> }
      @case ('error') {
        <span class="sd-thumb-state is-error" title="Önizleme oluşturulamadı">
          <span class="material-symbols-outlined">broken_image</span>
        </span>
      }
      @default { <span class="sd-thumb-state is-loading"></span> }
    }
  `,
  host: { class: 'sd-thumb-img' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScanThumb {
  readonly url = input.required<string>();

  private readonly thumbnails = inject(PdfThumbnailService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly state = signal<'idle' | 'ready' | 'error'>('idle');
  readonly src = signal('');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const observer = new IntersectionObserver(entries => {
        if (!entries.some(e => e.isIntersecting)) return;
        observer.disconnect();
        this.load();
      }, { rootMargin: '200px' });
      observer.observe(this.host.nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  private load(): void {
    this.thumbnails.thumbnail(this.url(), THUMB_WIDTH).then(
      src => {
        this.src.set(src);
        this.state.set('ready');
      },
      err => {
        console.error('Evrak önizlemesi oluşturulamadı:', err);
        this.state.set('error');
      }
    );
  }
}
