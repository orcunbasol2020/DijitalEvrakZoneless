import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, inject, input, model, signal } from '@angular/core';

export interface MultiOption {
  value: string;
  label: string;
}

/**
 * Aramalı çoklu seçim (Detaylı Sorgu): uzun listeler (birim, kurum, dil, kayıt yapan) için.
 * Seçim boşsa süzgeç uygulanmaz. Stiller reports.css'te (rp-ms-*).
 */
@Component({
  selector: 'report-multiselect',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="rp-ms-trigger" [class.has-value]="selected().length" (click)="toggle()"
      [attr.aria-expanded]="open()">
      <span class="rp-ms-text">
        @if (!selected().length) {
          <span class="rp-ms-placeholder">{{ placeholder() }}</span>
        } @else if (selected().length === 1) {
          {{ labelOf(selected()[0]) }}
        } @else {
          {{ selected().length }} seçili
        }
      </span>
      @if (selected().length) {
        <span class="material-symbols-outlined rp-ms-clear" title="Seçimi temizle" (click)="clear($event)">close</span>
      }
      <span class="material-symbols-outlined rp-ms-caret">expand_more</span>
    </button>

    @if (open()) {
      <div class="rp-ms-panel">
        <div class="rp-ms-search">
          <span class="material-symbols-outlined">search</span>
          <input type="text" placeholder="Ara..." [value]="query()" (input)="query.set($any($event.target).value)" />
        </div>
        <div class="rp-ms-list">
          @for (o of filtered(); track o.value) {
            <label class="rp-ms-item">
              <input type="checkbox" [checked]="isSelected(o.value)" (change)="pick(o.value)" />
              <span>{{ o.label }}</span>
            </label>
          } @empty {
            <div class="rp-ms-empty">Eşleşen kayıt yok</div>
          }
        </div>
      </div>
    }
  `,
  host: { class: 'rp-ms', '[class.is-open]': 'open()' },
})
export class ReportMultiselect {
  readonly options = input<MultiOption[]>([]);
  readonly placeholder = input('Tümü');
  readonly selected = model<string[]>([]);

  private readonly el = inject(ElementRef<HTMLElement>);
  readonly open = signal(false);
  readonly query = signal('');

  readonly filtered = computed(() => {
    const q = this.query().trim().toLocaleLowerCase('tr');
    const list = this.options();
    return q ? list.filter(o => o.label.toLocaleLowerCase('tr').includes(q)) : list;
  });

  toggle(): void {
    this.open.update(v => !v);
    if (!this.open()) this.query.set('');
  }

  isSelected(value: string): boolean {
    return this.selected().includes(value);
  }

  pick(value: string): void {
    this.selected.update(list => list.includes(value) ? list.filter(v => v !== value) : [...list, value]);
  }

  clear(event: Event): void {
    event.stopPropagation();
    this.selected.set([]);
  }

  labelOf(value: string): string {
    return this.options().find(o => o.value === value)?.label ?? value;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.el.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
      this.query.set('');
    }
  }
}
