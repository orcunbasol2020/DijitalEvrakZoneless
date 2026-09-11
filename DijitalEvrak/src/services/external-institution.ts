import { Injectable, inject } from '@angular/core';
import { HttpService } from './http';

export interface ExternalInstitutionModel {
  id: string;
  name: string;
  type: number;
  address?: string;
  parentId?: string | null;
  isDeleted?: boolean;
  createdDate?: string;
  updateDate?: string;
}

export const initialExternalInstitution: ExternalInstitutionModel = {
  id: '',
  name: '',
  type: 1,
  address: '',
  parentId: null
};

@Injectable({ providedIn: 'root' })
export class ExternalInstitution {

  private httpService = inject(HttpService);
  // backend path ile birebir eşleşiyor
  private baseUrl = 'api/ExternalInstitutions/';

  // ✔ Observable ile liste alma
  getExternalInstitutions() {
     return this.httpService.get<ExternalInstitutionModel[]>(
    `${this.baseUrl}GetAll`
  );
  }


  getExternalInstitutionById(id: string) {
    return this.httpService.get<ExternalInstitutionModel>(
      `${this.baseUrl}GetById?id=${encodeURIComponent(id)}`
    );
  }

  create(body: { name: string; type: number; address?: string; parentId?: string | null }) {
    return this.httpService.post(`${this.baseUrl}Create`, body);
  }

  update(body: Partial<ExternalInstitutionModel> & { id: string }) {
    return this.httpService.post(`${this.baseUrl}Update`, body);
  }

  delete(id: string) {
    return this.httpService.post(`${this.baseUrl}Delete`, { id });
  }
}
