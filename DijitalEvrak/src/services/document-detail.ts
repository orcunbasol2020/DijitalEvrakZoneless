import { Injectable, inject, signal } from '@angular/core';
import { HttpService } from './http'; // yeni generic HttpService
import { DocumentDetailModel } from '../models/documentDetail.model';

@Injectable({ providedIn: 'root' })
export class DocumentDetail {
  private httpService = inject(HttpService);
  private baseUrl = 'api/getDocumentList';

  // Seçili belge ID'si için signal
  private selectedDocumentId = signal<string | null>(null);
  setSelectedDocument(id: string) { this.selectedDocumentId.set(id); }
  clearSelectedDocument() { this.selectedDocumentId.set(null); }
  get currentDocumentId(): string | null { return this.selectedDocumentId(); }

  // ✔ Resource çağrıları artık createResource ile yapılmalı
  getDocumentsResource() {
    return this.httpService.createResource<DocumentDetailModel>(this.baseUrl);
  }

  getDocumentByIdResource(id: string) {
    return this.httpService.createResource<DocumentDetailModel>(
      `${this.baseUrl}?id=${encodeURIComponent(id)}`
    );
  }

  getDocumentById(id: string) {
    return this.httpService.get<DocumentDetailModel[]>(`${this.baseUrl}?id=${encodeURIComponent(id)}`);
  }

  // CRUD işlemleri (Observable ile)
  saveDocument(doc: DocumentDetailModel) {
    return this.httpService.post<DocumentDetailModel>(this.baseUrl, doc);
  }

  updateDocument(id: string, doc: DocumentDetailModel) {
    return this.httpService.put<DocumentDetailModel>(`${this.baseUrl}/${id}`, doc);
  }

  deleteDocument(id: string) {
    return this.httpService.delete(`${this.baseUrl}/${id}`);
  }
}
