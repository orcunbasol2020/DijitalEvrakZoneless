import { Injectable, inject } from '@angular/core';
import { HttpService } from './http';

export interface ExternalUserModel {
  id: string;
  name: string;
  surname: string;
  email: string;
  identityNo: string;
  userType: number;
  externalInstitutionId?: string | null;
  isActive: boolean;
  isDeleted: boolean;
  createdDate?: string;
  updateDate?: string;
}

export const initialExternalUser: ExternalUserModel = {
  id: '',
  name: '',
  surname: '',
  email: '',
  identityNo: '',
  userType: 1,
  externalInstitutionId: null,
  isActive: true,
  isDeleted: false
};

@Injectable({ providedIn: 'root' })
export class ExternalUserService {

  private httpService = inject(HttpService);
  // backend path ile birebir eşleşiyor
  private baseUrl = 'api/ExternalUsers/';

  getExternalUsers() {
    return this.httpService.get<ExternalUserModel[]>(`${this.baseUrl}GetAll`);
  }

  getExternalUserById(id: string) {
    return this.httpService.get<ExternalUserModel>(
      `${this.baseUrl}GetById?id=${encodeURIComponent(id)}`
    );
  }

  create(body: Partial<ExternalUserModel>) {
    return this.httpService.post(`${this.baseUrl}Create`, body);
  }

  update(body: Partial<ExternalUserModel> & { id: string }) {
    return this.httpService.post(`${this.baseUrl}Update`, body);
  }

  delete(id: string) {
    return this.httpService.post(`${this.baseUrl}Delete`, { id });
  }
}
