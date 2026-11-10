import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { FlexiToastService } from 'flexi-toast';
import { DocumentAllocation } from '../../src/services/documentallocation';
import { Common } from '../../src/services/common';

/**
 * Gelen evrakta "Teslim Al": evrakın aktif zimmeti kendisinde olan kullanıcı evrakı teslim alır
 * (zimmet Teslim Alındı, evrak Teslim Edildi olur). Teslim geri alınamadığından ilk tıklama
 * düğmeyi onay durumuna geçirir, ikinci tıklama işlemi yapar; onay birkaç saniye içinde verilmezse
 * düğme eski hâline döner. Görünüm çağıran ekranın zl-act sınıfından gelir.
 */
@Component({
  selector: 'app-receive-button',
  template: `
    <button type="button" class="zl-act receive-btn" [class.is-confirm]="confirming()"
      [disabled]="busy()" (click)="onClick($event)"
      [title]="confirming() ? 'Teslim almayı onaylamak için tekrar tıklayın' : 'Teslim Al'"
      [attr.aria-label]="confirming() ? 'Teslim almayı onayla' : 'Teslim Al'">
      @if (busy()) {
        <span class="spinner-border spinner-border-sm"></span>
      } @else {
        <span class="material-symbols-outlined">{{ confirming() ? 'check' : 'inventory' }}</span>
        @if (confirming()) {
          <span class="receive-btn-text">Onayla</span>
        }
      }
    </button>
  `,
  styles: `
    .receive-btn.is-confirm {
      width: auto;
      gap: 4px;
      padding: 0 10px;
      background: #dcfce7;
      border-color: #86efac;
      color: #166534;
    }
    :host-context([data-theme="dark"]) .receive-btn.is-confirm {
      background: rgba(34, 197, 94, 0.18);
      border-color: rgba(134, 239, 172, 0.5);
      color: #86efac;
    }
    .receive-btn-text {
      font-size: 12px;
      font-weight: 600;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReceiveButton {
  readonly documentId = input.required<string>();
  /** Teslim başarıyla alındığında; çağıran ekran listesini tazeler */
  readonly received = output<string>();

  readonly #allocations = inject(DocumentAllocation);
  readonly #toast = inject(FlexiToastService);
  readonly #common = inject(Common);
  readonly #userId = computed(() => this.#common.user()?.id);
  readonly confirming = signal(false);
  readonly busy = signal(false);
  #timer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.#timer));
  }

  onClick(event: Event): void {
    // Satıra tıklama (detay açma vb.) tetiklenmesin
    event.stopPropagation();
    if (this.busy()) return;

    if (!this.confirming()) {
      this.confirming.set(true);
      clearTimeout(this.#timer);
      this.#timer = setTimeout(() => this.confirming.set(false), 4000);
      return;
    }

    clearTimeout(this.#timer);
    this.confirming.set(false);
    const userId = this.#userId();
    if (!userId) {
      this.#toast.showToast('Hata', 'Kullanıcı bulunamadı', 'error');
      return;
    }

    this.busy.set(true);
    this.#allocations.receive(this.documentId(), userId).subscribe({
      next: (error) => {
        this.busy.set(false);
        if (error) {
          this.#toast.showToast('Teslim alınamadı', error, 'warning');
          return;
        }
        this.#toast.showToast('Başarılı', 'Evrak teslim alındı.', 'success');
        this.received.emit(this.documentId());
      },
      error: (err) => {
        console.error('Teslim alınamadı:', err);
        this.busy.set(false);
      }
    });
  }
}
