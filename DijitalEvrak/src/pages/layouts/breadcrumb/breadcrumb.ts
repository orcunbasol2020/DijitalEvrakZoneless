import { ChangeDetectionStrategy, Component, computed, inject, ViewEncapsulation } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Common } from '../../../services/common';

export interface BreadcrumbModel {
  title: string;
  url: string;
  icon: string
}

@Component({
  selector: 'app-breadcrumb',
  imports: [RouterLink],
  template: `
  <ol class="breadcrumb">
    @for (val of data(); track val.url; let first = $first; let last = $last) {
      @if (!first) {
        <li class="breadcrumb-sep" aria-hidden="true">
          <span class="material-symbols-outlined">chevron_right</span>
        </li>
      }
      <li class="breadcrumb-item"
          [class.active]="last"
          [class.is-home]="first"
          [attr.aria-current]="last ? 'page' : null">
        @if (last) {
          <span class="breadcrumb-link breadcrumb-current" [title]="val.title">
            @if (val.icon) {
              <span class="material-symbols-outlined">{{ val.icon }}</span>
            }
            <span class="breadcrumb-text">{{ val.title }}</span>
          </span>
        } @else {
          <a [routerLink]="val.url" class="breadcrumb-link" [title]="val.title">
            @if (val.icon) {
              <span class="material-symbols-outlined">{{ val.icon }}</span>
            }
            @if (!first) {
              <span class="breadcrumb-text">{{ val.title }}</span>
            }
          </a>
        }
      </li>
    }
  </ol>
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Breadcrumb {
  readonly data = computed(() => this.#common.data());

  readonly #common = inject(Common);
}
