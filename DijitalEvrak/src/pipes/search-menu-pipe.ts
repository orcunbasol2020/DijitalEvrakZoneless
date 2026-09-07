import { Pipe, PipeTransform } from '@angular/core';
import { NavigationModel } from '../navigation';

@Pipe({
  name: 'searchMenu'
})
export class SearchMenuPipe implements PipeTransform {

  transform(value: NavigationModel[], search: string): NavigationModel[] {

    if (!search) return value;

    const s = search.toLocaleLowerCase();

    return value.filter(p =>
      p.title?.toLocaleLowerCase().includes(s) ||
      p.category?.toLocaleLowerCase().includes(s)
    );
  }
}