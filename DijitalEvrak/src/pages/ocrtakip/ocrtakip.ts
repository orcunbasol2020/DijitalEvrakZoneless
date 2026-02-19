import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import GenericModel from '../../../components/generic-model/generic-model';

@Component({
  imports: [
    GenericModel
  ],
  templateUrl: './ocrtakip.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Ocrtakip {

}
