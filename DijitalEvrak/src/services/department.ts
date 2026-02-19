import { Injectable, inject } from '@angular/core';
import { HttpService } from './http';

export interface DepartmentModel {
  id: string;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class Department {

  private httpService = inject(HttpService);

  // ✔ Backend route ile uyumlu
  private baseUrl = 'api/Departments';

  // ✔ Resource ile liste alma
  getDepartmentsResource() {
    return this.httpService.createResource<DepartmentModel>(
      `${this.baseUrl}/GetAll`
    );
  }

  // ✔ Observable ile liste alma
  getDepartments() {
    return this.httpService.get<DepartmentModel[]>(
      `${this.baseUrl}/GetAll`
    );
  }

  // ✔ ID ile getirme (ileride lazım olabilir)
  getDepartmentById(id: string) {
    return this.httpService.get<DepartmentModel>(
      `${this.baseUrl}/${encodeURIComponent(id)}`
    );
  }
}
