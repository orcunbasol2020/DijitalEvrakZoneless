import { Pipe, PipeTransform } from '@angular/core';
import { NavigationModel } from '../navigation';

@Pipe({
  name: 'searchMenu'
})
export class SearchMenuPipe implements PipeTransform {

  transform(value: NavigationModel[], search: string): NavigationModel[] {
    return value.filter(p => p.title?.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  }

}
