import { Injectable, inject } from '@angular/core';
import { HttpService } from './http';
import {
  OutgoingDocumentDistributionModel,
  OutgoingDocumentDistributionUpdateInput,
  OutgoingDocumentRecipientInput
} from '../models/outgoingdocumentdistribution.model';

// Giden evrak dağıtım listesi (alıcılar). GetById/GetAll yanıtlarında
// distributions gelmediğinden alıcılar bu servis üzerinden ayrıca çekilir.
@Injectable({ providedIn: 'root' })
export class OutgoingDocumentDistributionService {

  private httpService = inject(HttpService);
  private baseUrl = 'api/OutgoingDocumentDistributions/';

  // Bir evrak için bir veya birden fazla alıcı ekler; eklenen satırları
  // (birim/kurum adları dolu olarak) döndürür.
  create(outgoingDocumentId: string, recipients: OutgoingDocumentRecipientInput[]) {
    return this.httpService.post<OutgoingDocumentDistributionModel[]>(
      `${this.baseUrl}Create`,
      { outgoingDocumentId, recipients }
    );
  }

  update(model: OutgoingDocumentDistributionUpdateInput) {
    return this.httpService.put<OutgoingDocumentDistributionModel>(
      `${this.baseUrl}Update`,
      model
    );
  }

  getByOutgoingDocumentId(outgoingDocumentId: string) {
    return this.httpService.get<OutgoingDocumentDistributionModel[]>(
      `${this.baseUrl}GetByOutgoingDocumentId?outgoingDocumentId=${encodeURIComponent(outgoingDocumentId)}`
    );
  }

  // Soft delete; backend bu uç için POST + gövde bekliyor.
  remove(id: string) {
    return this.httpService.post<{ message: string }>(
      `${this.baseUrl}Remove`,
      { id }
    );
  }
}
