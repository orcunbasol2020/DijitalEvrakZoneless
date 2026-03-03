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

  // Yeni zimmet oluşturma
  createAllocation(allocation: {
    incomingDocumentId: string;
    userId: string;
    createdUserId: string;
    status: string;
  }) {
    return this.httpService.post(
      `${this.baseUrl}/Create`,
      allocation
    );
  }
}