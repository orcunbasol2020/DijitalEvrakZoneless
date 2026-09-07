import { HttpClient, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, ViewEncapsulation } from '@angular/core';
import { FlexiGridModule } from 'flexi-grid';
import { RouterLink } from '@angular/router';
import { FlexiToastService } from 'flexi-toast';
import { FormsModule } from '@angular/forms';
import GenericModel from '../../../components/generic-model/generic-model';

export interface UserModel{
  id?: string;
  name: string;
  surname: string;
  email: string;
  userName: string;
  departmentId: string;
  departmentName: string;
  departmentShortName: string;
  isActive: boolean;
  isDeleted: boolean;
  createDate: string;
  updateDate: string;
}

export const initialUser:UserModel = {
  name: "",
  surname: "",
  email: "",
  userName: "",
  departmentId: "",
  departmentName: "",
  departmentShortName: "",
  isActive: true,
  isDeleted: false,
  createDate: "",
  updateDate: "",
}

@Component({
  imports: [
    GenericModel,
    FlexiGridModule,
    RouterLink,
    FormsModule
  ],
  templateUrl: './users.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Users {
  readonly result = httpResource<UserModel[]>(() => "api/Users/GetAll");
  readonly data = computed(() => this.result.value() ?? []);
  readonly loading = computed(() => this.result.isLoading());
  showFilters = false;
  readonly #toast = inject(FlexiToastService);
  readonly #http = inject(HttpClient);

  delete(id: string){
    this.#toast.showSwal("Sil","Kullanıcı silmek istiyor musunuz?","Sil",() => {
      this.#http.delete(`api/users/${id}`).subscribe(()=> {
        this.result.reload();
      })
    })
  }

  changeIsAdmin(data:UserModel){
    this.#http.put(`api/users/${data.id}`,data).subscribe(() => {
      this.result.reload();
    });
  }
}
