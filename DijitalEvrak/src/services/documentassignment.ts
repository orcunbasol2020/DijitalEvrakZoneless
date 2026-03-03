import { Injectable, inject } from '@angular/core';
import { HttpService } from './http';
import { DocumentAssignmentModel } from '../models/documentassignment.model';

@Injectable({ providedIn: 'root' })
export class DocumentAssignmentService {

  private httpService = inject(HttpService);

  // Backend route
  private baseUrl = 'api/DocumentAssignments';

  /**
   * DocumentId ile atama listesini getirir
   */
  getByDocumentId(documentId: string) {
    return this.httpService.get<DocumentAssignmentModel[]>(
      `${this.baseUrl}/GetByDocumentId?documentId=${encodeURIComponent(documentId)}`
    );
  }

  /**
   * Yeni document assignment oluşturur
   */
  createAssignment(data: {
    documentId: string;
    userId: string;
  }) {
    return this.httpService.post(
      `${this.baseUrl}/Create`,
      data
    );
  }
}