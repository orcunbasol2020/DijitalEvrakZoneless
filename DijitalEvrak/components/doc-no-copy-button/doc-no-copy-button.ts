import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, signal } from '@angular/core';
import { Clipboard } from '@angular/cdk/clipboard';
import { FlexiToastService } from 'flexi-toast';

/**
 * Evrak Bilgileri başlığındaki evrak ikonu: tıklanınca evrak no panoya kopyalanır,
 * ikon kısa süre onay işaretine döner. Görünüm çağıran ekranın ei-head-icon sınıfından gelir.
 */
@Component({
  selector: 'app-doc-no-copy-button',
  template: `
    <button type="button" class="ei-head-icon ei-copy-btn" [class.is-copied]="copied()"
      [disabled]="!value()" (click)="copy()"
      [title]="copied() ? 'Kopyalandı' : 'Evrak numarasını kopyala'"
      [attr.aria-label]="copied() ? 'Kopyalandı' : 'Evrak numarasını kopyala'">
      <span class="material-symbols-outlined">{{ copied() ? 'check' : 'description' }}</span>
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DocNoCopyButton {
  readonly value = input<string | null | undefined>();

  readonly copied = signal(false);
  readonly #clipboard = inject(Clipboard);
  readonly #toast = inject(FlexiToastService);
  #timer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.#timer));
  }

  copy(): void {
    const text = this.value()?.trim();
    if (!text) return;
    // CDK Clipboard güvenli bağlam (https) gerektirmez; http ile açılan ortamlarda da çalışır
    if (!this.#clipboard.copy(text)) {
      this.#toast.showToast('Hata', 'Evrak numarası kopyalanamadı.', 'error');
      return;
    }
    this.copied.set(true);
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.copied.set(false), 1500);
  }
}
