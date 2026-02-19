import { Injectable, signal } from '@angular/core';
import { BreadcrumbModel } from '../pages/layouts/breadcrumb/breadcrumb';
import { UserModel } from '../pages/users/users';

@Injectable({
  providedIn: 'root'
})
export class Common {
  readonly data = signal<BreadcrumbModel[]>([]);
  readonly user = signal<UserModel | undefined>(undefined);

  set(data:BreadcrumbModel[]){
    const val: BreadcrumbModel = {
      title: "Kontrol Paneli",
      icon: "home",
      url: "/"
    }
    this.data.set([val, ...data]);
  }
}
