import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, resource, signal, ViewEncapsulation } from '@angular/core';
import GenericModel from '../../../../components/generic-model/generic-model';
import { lastValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { initialUser, UserModel } from '../users';
import { ActivatedRoute, Router } from '@angular/router';
import { FlexiToastService } from 'flexi-toast';
import { FormsModule, NgForm } from '@angular/forms';
import { BreadcrumbModel } from '../../layouts/breadcrumb/breadcrumb';

@Component({
  imports: [
    GenericModel,
    FormsModule
  ],
  templateUrl: './create.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Create {
  readonly id = signal<string | undefined>(undefined);

  readonly result = resource({
    params: () => this.id(),
    loader: async () => {
      var res = await lastValueFrom(this.#http.get<UserModel>(`api/users/${this.id()}`));
      this.breadcrumbs.update(prev => [...prev,
      { title: res.userName, url: `/users/edit/${this.id()}`, icon: 'edit' },]);
      return res;
    }
  });

  readonly data = linkedSignal(() => this.result.value() ?? { ...initialUser });
  readonly #http = inject(HttpClient);
  readonly #activated = inject(ActivatedRoute);
  readonly cardTitle = computed(() => this.id() ? 'Kullanıcı Güncelle' : 'Kullanıcı Ekle');
  readonly title = computed(() => this.id() ? 'Kullanıcı Güncelle' : 'Kullanıcı Ekle');
  readonly btnName = computed(() => this.id() ? 'Güncelle' : 'Kaydet');
  readonly #router = inject(Router);
  readonly #toast = inject(FlexiToastService);
  readonly breadcrumbs = signal<BreadcrumbModel[]>([
    { title: 'Kullanıcılar', url: '/users', icon: 'group' },
  ]);

  constructor() {
    this.#activated.params.subscribe(res => {
      if (res['id']) {
        this.id.set(res['id']);
      } else {
        this.breadcrumbs.update(prev => [...prev,
        { title: 'Ekle', url: '/users/create', icon: 'add' },])
      }
    });
  }

  save(form: NgForm) {
    if (!form.valid) return;

    this.data.update((prev) =>
      ({ ...prev, fullName: `${prev.name} ${prev.surname}` }));

    if (!this.id()) {
      this.#http.post("api/users", this.data()).subscribe(res => {
        this.#toast.showToast("Başarılı", "Kullanıcı başarıyla kaydedildi");
        this.#router.navigateByUrl("/users");
      });
    } else {
      this.#http.put(`api/users/${this.id()}`, this.data()).subscribe(res => {
        this.#toast.showToast("Başarılı", "Kullanıcı başarıyla güncellendi");
        this.#router.navigateByUrl("/users");
      });
    }
  }

}
