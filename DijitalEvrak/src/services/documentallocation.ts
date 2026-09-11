import { Injectable, inject } from '@angular/core';
import { HttpService } from './http';
import { DocumentAllocationModel } from '../models/documentallocation.model';

@Injectable({ providedIn: 'root' })
export class DocumentAllocation {

  private httpService = inject(HttpService);

  // Backend route
  private baseUrl = 'api/DocumentAllocations';

  // DocumentId ile aktif zimmet kontrol / listeleme
  getByDocumentId(documentId: string) {
    return this.httpService.get<DocumentAllocationModel[]>(
      `${this.baseUrl}/GetByDocumentId?incomingDocumentId=${encodeURIComponent(documentId)}`
    );
  }

  getActiveByDocumentId(documentId: string) {
    return this.httpService.get<DocumentAllocationModel>(
      `${this.baseUrl}/GetActiveByDocumentId?incomingDocumentId=${encodeURIComponent(documentId)}`
    );
  }

  // Kullanıcının üzerindeki aktif zimmetlerini getirir (Zimmetlerim ekranı)
  getActiveByUserId(userId: string) {
    return this.httpService.get<DocumentAllocationModel[]>(
      `${this.baseUrl}/GetActiveByUserId?userId=${encodeURIComponent(userId)}`
    );
  }

  // Kullanıcının başkasına devrettiği (zimmet devri yaptığı) evrak sayısı
  getTransferCountByUserId(userId: string) {
    return this.httpService.get<number>(
      `${this.baseUrl}/GetTransferCountByUserId?userId=${encodeURIComponent(userId)}`
    );
  }

  // Yeni zimmet oluşturma
  // userType: zimmetlenen kişinin tipi - 1 = iç sistem kullanıcısı (Users), 2 = dış kurum kullanıcısı (ExternalUsers)
  createAllocation(allocation: {
    incomingDocumentId: string;
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
}