import { Injectable, inject } from '@angular/core';
import { HttpService } from './http';

export interface ExternalInstitutionModel {
  id: string;
  name: string;
  type: number;
}

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
}
