import { Injectable, inject } from '@angular/core';
import { HttpService } from './http';
import { OutgoingDocumentAllocationModel } from '../models/outgoingdocumentallocation.model';

@Injectable({ providedIn: 'root' })
export class OutgoingDocumentAllocation {

  private httpService = inject(HttpService);

  // Backend route
  private baseUrl = 'api/OutgoingDocumentAllocations';

  // DocumentId ile allocation listeleme
  getByDocumentId(outgoingDocumentId: string) {
    return this.httpService.get<OutgoingDocumentAllocationModel[]>(
      `${this.baseUrl}/GetByDocumentId?outgoingDocumentId=${encodeURIComponent(outgoingDocumentId)}`
    );
  }

  getActiveByDocumentId(outgoingDocumentId: string) {
    return this.httpService.get<OutgoingDocumentAllocationModel>(
      `${this.baseUrl}/GetActiveByDocumentId?outgoingDocumentId=${encodeURIComponent(outgoingDocumentId)}`
    );
  }

  // Kullanıcının üzerindeki aktif allocation'larını getirir
  getActiveByUserId(userId: string) {
    return this.httpService.get<OutgoingDocumentAllocationModel[]>(
      `${this.baseUrl}/GetActiveByUserId?userId=${encodeURIComponent(userId)}`
    );
  }

  // Kullanıcının transfer sayısını getirir
  getTransferCountByUserId(userId: string) {
    return this.httpService.get<number>(
      `${this.baseUrl}/GetTransferCountByUserId?userId=${encodeURIComponent(userId)}`
    );
  }

  // Yeni outgoing document allocation oluşturma
  createAllocation(allocation: {
    outgoingDocumentId: string;
    userId: string;
    createdUserId: string;
    status: string;
    userType: number;
  }) {
    return this.httpService.post(
      `${this.baseUrl}/Create`,
      allocation
    );
  }

  // Mevcut allocation'ı günceller
  updateAllocation(allocation: Partial<OutgoingDocumentAllocationModel>) {
    return this.httpService.post(
      `${this.baseUrl}/Update`,
      allocation
    );
  }
}
