import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

@Component({
  imports: [],
  templateUrl: './countries.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Countries {

}
