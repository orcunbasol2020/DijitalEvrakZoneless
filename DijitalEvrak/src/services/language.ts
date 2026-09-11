import { Injectable, inject } from '@angular/core';
import { HttpService } from './http';

export interface LanguageModel {
  id?: string;
  name: string;
  ocrSupport: boolean;
  isActive: boolean;
  isDeleted?: boolean;
  createdDate?: string;
  updateDate?: string;
}

export const initialLanguage: LanguageModel = {
  name: '',
  ocrSupport: false,
  isActive: true
};

@Injectable({ providedIn: 'root' })
export class Language {

  private httpService = inject(HttpService);

  // ✔ Backend route ile uyumlu
  private baseUrl = 'api/Languages';

  // ✔ Resource ile liste alma
  getLanguagesResource() {
    return this.httpService.createResource<LanguageModel>(
      `${this.baseUrl}/GetAll`
    );
  }

  // ✔ Observable ile liste alma
  getLanguages() {
    return this.httpService.get<LanguageModel[]>(
      `${this.baseUrl}/GetAll`
    );
  }

  getLanguageById(id: string) {
    return this.httpService.get<LanguageModel>(
      `${this.baseUrl}/GetById?id=${encodeURIComponent(id)}`
    );
  }

  create(body: Pick<LanguageModel, 'name' | 'ocrSupport' | 'isActive'>) {
    return this.httpService.post(`${this.baseUrl}/Create`, body);
  }

  update(body: Partial<LanguageModel> & { id: string }) {
    return this.httpService.post(`${this.baseUrl}/Update`, body);
  }

  delete(id: string) {
    return this.httpService.post(`${this.baseUrl}/Delete`, { id });
  }
}
