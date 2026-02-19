import { AfterViewInit, ChangeDetectionStrategy, Component, inject, input, OnChanges, SimpleChanges, ViewEncapsulation } from '@angular/core';
import { BreadcrumbModel } from '../../src/pages/layouts/breadcrumb/breadcrumb';
import { Common } from '../../src/services/common';

@Component({
  selector: 'app-generic',
  imports: [],
  template: `
    <title>Dijital Evrak | {{pageTitle()}}</title>
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class GenericModel implements OnChanges{
  readonly pageTitle = input.required<string>();
  readonly breadcrumbs = input.required<BreadcrumbModel[]>();

  readonly #common = inject(Common);

  ngOnChanges(changes: SimpleChanges): void {
    this.#common.set(this.breadcrumbs());
  }
}
