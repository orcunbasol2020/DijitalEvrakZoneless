import { Injectable, inject, signal } from '@angular/core';
import { HttpService } from './http';
import { DocumentModel } from '../models/document/document.model';

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private httpService = inject(HttpService);
  private baseUrl = 'api/Documents/';

  //document id ile detay ekranina gidis
  private selectedDocumentId = signal<string | null>(null);
  setSelectedDocument(id: string) { this.selectedDocumentId.set(id); }
  clearSelectedDocument() { this.selectedDocumentId.set(null); }
  get currentDocumentId(): string | null { return this.selectedDocumentId(); }

  //zimmet ekranı icin setlenen documentId
  private zimmetDocumentId = signal<string | null>(null);
  setZimmetDocument(id: string) { this.zimmetDocumentId.set(id); }
  get currentZimmetDocumentId(): string | null { return this.zimmetDocumentId(); }
  clearZimmetDocument() { this.zimmetDocumentId.set(null); }

  //update islemi documentNumber uzerinden mi yoksa documentId uzerinden mi yapılacak (qr ekranindan gecis icin)
  private documentUpdateType = signal<string | null>(null);
  setDocumentUpdateType(id: string) { this.documentUpdateType.set(id); }
  get currentDocumentUpdateType(): string | null { return this.documentUpdateType(); }

  // ✔ Resource çağrıları artık createResource ile yapılmalı
  getDocumentsResource() {
    return this.httpService.createResource<DocumentModel>(this.baseUrl + "GetAll");
  }

  getDocumentByIdResource(id: string) {
    return this.httpService.createResource<DocumentModel>(
      `${this.baseUrl}?id=${encodeURIComponent(id)}`
    );
  }

  getDocumentById(id: string) {
    return this.httpService.get<DocumentModel>(`${this.baseUrl + "GetById"}?id=${encodeURIComponent(id)}`);
  }

  getDocumentByNumber(documentNumber: string) {
    return this.httpService.get<DocumentModel>(`${this.baseUrl + "GetByNumber"}?documentNumber=${encodeURIComponent(documentNumber)}`);
  }

  saveDocument(doc: DocumentModel) {
    return this.httpService.post<DocumentModel>(this.baseUrl, doc);
  }

  updateDocument(id: string, doc: DocumentModel) {
    return this.httpService.put<DocumentModel>(`${this.baseUrl}/${id}`, doc);
  }

  deleteDocument(id: string) {
    return this.httpService.delete(`${this.baseUrl}/${id}`);
  }

  // ✔ OCR FİLTRELİ resource
  getDocumentsResourceByOcr(status: string) {
    return this.httpService.createResource<DocumentModel[]>(
      `${this.baseUrl}GetAll?ocrStatus=${encodeURIComponent(status)}`
    );
  }
}
