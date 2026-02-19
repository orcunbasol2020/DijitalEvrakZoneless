import { Injectable, inject } from '@angular/core';
import { HttpService } from './http';

export interface ExternalInstitutionModel {
  id: string;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class ExternalInstitution {

  private httpService = inject(HttpService);
  // backend path ile birebir eşleşiyor
  private baseUrl = 'api/ExternalInstitutions/GetAll';

  // ✔ Observable ile liste alma
  getExternalInstitutions() {
    return this.httpService.get<ExternalInstitutionModel[]>(this.baseUrl);
  }

  // ✔ ID ile getirme (ileride gerekirse)
  getExternalInstitutionById(id: string) {
    return this.httpService.get<ExternalInstitutionModel>(
      `api/ExternalInstitutions/${encodeURIComponent(id)}`
    );
  }
}
