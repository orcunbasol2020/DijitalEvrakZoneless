import { Injectable, inject, signal } from '@angular/core';
import { HttpService } from './http';
import { IncomingDocumentModel } from '../models/incoming-document/incoming-document.model';
import { IncomingDocumentPreRegisterModel } from '../models/incoming-document/incomingdocument-pregister.model';

@Injectable({ providedIn: 'root' })
export class IncomingDocumentService {

  private httpService = inject(HttpService);
  private baseUrl = 'api/IncomingDocuments/';

  // 📌 Detay ekranı için seçili incoming document
  private selectedIncomingDocumentId = signal<string | null>(null);
  setSelectedIncomingDocument(id: string) { 
    this.selectedIncomingDocumentId.set(id); 
  }
  clearSelectedIncomingDocument() { 
    this.selectedIncomingDocumentId.set(null); 
  }
  get currentIncomingDocumentId(): string | null { 
    return this.selectedIncomingDocumentId(); 
  }

    //zimmet ekranı icin setlenen documentId
  private zimmetDocumentId = signal<string | null>(null);
  setZimmetIncomingDocument(id: string) { this.zimmetDocumentId.set(id); }
  get currentZimmetDocumentId(): string | null { return this.zimmetDocumentId(); }
  clearZimmetIncomingDocument() { this.zimmetDocumentId.set(null); }

  // 📌 QR ekranından geçiş için update tipi (id mi documentId mi)
  private incomingDocumentUpdateType = signal<string | null>(null);
  setIncomingDocumentUpdateType(type: string) {
    this.incomingDocumentUpdateType.set(type);
  }
  get currentIncomingDocumentUpdateType(): string | null {
    return this.incomingDocumentUpdateType();
  }

  // ✅ GET ALL (resource)
  getIncomingDocumentsResource() {
    return this.httpService.createResource<IncomingDocumentModel[]>(
      this.baseUrl + "GetAll"
    );
  }

  // ✅ GET BY QR CODE
  GetByQrCode(qrCode: string) {
    return this.httpService.get<IncomingDocumentModel>(
      `${this.baseUrl}GetByQrCode?qrCode=${encodeURIComponent(qrCode)}`
    );
  }

  // ✅ GET BY DOCUMENT ID
  getIncomingDocumentByDocumentId(documentId: string) {
    return this.httpService.get<IncomingDocumentModel>(
      `${this.baseUrl}GetByDocumentId?documentId=${encodeURIComponent(documentId)}`
    );
  }

  // ✅ CREATE
  createIncomingDocument(model: IncomingDocumentModel) {
    return this.httpService.post<any>(
      `${this.baseUrl}Create`,
      model
    );
  }

  createIncomingDocumentPreRegister(model: IncomingDocumentPreRegisterModel) {
    return this.httpService.post<PreRegisterResponse>(
      `${this.baseUrl}PreRegister`,
      model
    );
  }

  // ✅ UPDATE
  updateIncomingDocument(model: IncomingDocumentModel) {
    return this.httpService.put<any>(
      `${this.baseUrl}Update`,
      model
    );
  }

  // ✅ OCR Filtreli liste
  getIncomingDocumentsByStatus(status: string) {
    return this.httpService.createResource<IncomingDocumentModel[]>(
      `${this.baseUrl}GetAll?Status=${encodeURIComponent(status)}`
    );
  }

  // ✅ DELETE (Soft Delete varsa backend handle edecek)
  deleteIncomingDocument(id: string) {
    return this.httpService.delete(
      `${this.baseUrl}${encodeURIComponent(id)}`
    );
  }
}

export interface PreRegisterResponse {
  created: boolean;
}
