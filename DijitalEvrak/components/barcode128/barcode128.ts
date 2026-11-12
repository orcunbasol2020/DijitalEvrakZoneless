import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { code128Bars } from '../../src/utils/code128';

/** Barkodun iki yanında bırakılan sessiz boşluk (modül); okuyucunun barkodun başını bulması için gerekir. */
const QUIET_ZONE = 10;

/**
 * Code 128 barkod (SVG). Genişliği kapsayıcıya uyar, yükseklik [height] ile verilir; çubuklar keskin çizilir.
 * İçerik desteklenmeyen karakter içerirse hiçbir şey çizilmez.
 */
@Component({
  selector: 'app-barcode128',
  template: `
    @if (model(); as m) {
      <svg class="barcode128" [attr.viewBox]="'0 0 ' + m.width + ' ' + height()" [style.height.px]="height()"
        preserveAspectRatio="none" shape-rendering="crispEdges" role="img" [attr.aria-label]="'Barkod: ' + value()">
        <rect [attr.width]="m.width" [attr.height]="height()" fill="#fff" />
        @for (bar of m.bars; track $index) {
          <rect [attr.x]="bar.x + quiet" [attr.width]="bar.w" [attr.height]="height()" fill="#000" />
        }
      </svg>
    }
  `,
  styles: `.barcode128 { display: block; width: 100%; }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Barcode128 {
  readonly value = input.required<string>();
  readonly height = input(48);

  readonly quiet = QUIET_ZONE;

  readonly model = computed(() => {
    try {
      const { bars, modules } = code128Bars(this.value());
      return { bars, width: modules + 2 * QUIET_ZONE };
    } catch {
      return null;
    }
  });
}
