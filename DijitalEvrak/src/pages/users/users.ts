import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, ViewEncapsulation } from '@angular/core';
import { FlexiGridModule } from 'flexi-grid';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import GenericModel from '../../../components/generic-model/generic-model';
import { UserService } from '../../services/user';

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
  password?: string;
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
    FormsModule,
    NgClass
  ],
  templateUrl: './users.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Users {
  readonly result = httpResource<UserModel[]>(() => "api/Users/GetAll");
  readonly data = computed(() => this.result.value() ?? []);
  readonly loading = computed(() => this.result.isLoading());
  readonly activeCount = computed(() => this.data().filter(u => u.isActive).length);
  showFilters = false;
  readonly #userService = inject(UserService);

  private readonly departmentBadgeClasses: Record<string, string> = {
    'BK': 'badge-soft-info',
    'BE': 'badge-soft-warning',
  };

  getDepartmentBadgeClass(shortName: string): string {
    return this.departmentBadgeClasses[shortName] ?? 'badge-soft-secondary';
  }

  changeIsAdmin(data:UserModel){
    this.#userService.update(data as Partial<UserModel> & { id: string }).subscribe(() => {
      this.result.reload();
    });
  }

  changeIsActive(data:UserModel){
    this.#userService.update(data as Partial<UserModel> & { id: string }).subscribe(() => {
      this.result.reload();
    });
  }
}
