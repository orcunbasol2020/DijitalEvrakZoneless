import { Injectable, inject } from '@angular/core';
import { HttpService } from './http';
import { OutgoingDocumentModel } from '../models/outgoingdocument.model';

@Injectable({ providedIn: 'root' })
export class OutgoingDocumentService {

  private httpService = inject(HttpService);
  private baseUrl = 'api/OutgoingDocuments/';

  // CREATE (OutgoingDocumentTransactions'a "Taslak" kaydı da düşer)
  // Backend [FromBody] CreateOutgoingDocumentCommand bekliyor; gövde doğrudan
  // command alanlarını içermeli ("request" gibi bir sarmalayıcı OLMAMALI,
  // aksi halde tüm alanlar null/default olarak bağlanır ve kayıt boş oluşur.
  createOutgoingDocument(model: Partial<OutgoingDocumentModel>) {
    return this.httpService.post<OutgoingDocumentModel>(
      `${this.baseUrl}Create`,
      model
    );
  }

  // UPDATE (durum değişince transaction kaydı düşer, CargoPostNumber girilebilir)
  updateOutgoingDocument(model: Partial<OutgoingDocumentModel>) {
    return this.httpService.put<OutgoingDocumentModel>(
      `${this.baseUrl}Update`,
      model
    );
  }

  getById(id: string) {
    return this.httpService.get<OutgoingDocumentModel>(
      `${this.baseUrl}GetById?id=${encodeURIComponent(id)}`
    );
  }

  getByQrCode(qrCode: string) {
    return this.httpService.get<OutgoingDocumentModel>(
      `${this.baseUrl}GetByQrCode?qrCode=${encodeURIComponent(qrCode)}`
    );
  }

  // status verilmezse tüm kayıtlar, verilirse OutgoingDocumentStatus'a göre filtrelenir
  // departmentId verilirse (admin olmayan kullanıcılar için) sadece o birime ait kayıtlar döner
  getAll(status?: number, departmentId?: string) {
    const params: string[] = [];
    if (status != null) params.push(`status=${status}`);
    if (departmentId) params.push(`departmentId=${encodeURIComponent(departmentId)}`);
    const query = params.length ? `?${params.join('&')}` : '';
    return this.httpService.createResource<OutgoingDocumentModel[]>(
      `${this.baseUrl}GetAll${query}`
    );
  }

  deleteOutgoingDocument(id: string) {
    return this.httpService.delete(
      `${this.baseUrl}${encodeURIComponent(id)}`
    );
  }
}
