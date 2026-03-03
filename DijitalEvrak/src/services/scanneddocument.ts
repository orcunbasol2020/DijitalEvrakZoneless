import { Injectable, inject, signal } from '@angular/core';
import { HttpService } from './http';
import { ScannedDocumentModel } from '../models/scanneddocument.model';

@Injectable({ providedIn: 'root' })
export class ScannedDocumentService {

  private httpService = inject(HttpService);
  private baseUrl = 'api/ScannedDocuments/';

  // 📌 Seçili taranmış belge
  private selectedScannedDocumentId = signal<string | null>(null);

  setSelectedScannedDocument(id: string) {
    this.selectedScannedDocumentId.set(id);
  }

  clearSelectedScannedDocument() {
    this.selectedScannedDocumentId.set(null);
  }

  get currentScannedDocumentId(): string | null {
    return this.selectedScannedDocumentId();
  }

  // GET ALL
  getScannedDocuments() {
    return this.httpService.createResource<ScannedDocumentModel[]>(
      this.baseUrl + "GetAll"
    );
  }

  // GET BY ID
  getScannedDocumentById(id: string) {
    return this.httpService.get<ScannedDocumentModel>(
      `${this.baseUrl}GetById?id=${encodeURIComponent(id)}`
    );
  }

  // PDF URL ÜRETİCİ
  getPdfUrl(fileName: string): string {
    if (!fileName) return '';
    return `https://localhost:7056/api/ScannedDocuments/GetPdf?fileName=${encodeURIComponent(fileName)}`;
  }

  // CREATE
  createScannedDocument(model: ScannedDocumentModel) {
    return this.httpService.post<any>(
      `${this.baseUrl}Create`,
      model
    );
  }

  // DELETE
  deleteScannedDocument(id: string) {
    return this.httpService.delete(
      `${this.baseUrl}${encodeURIComponent(id)}`
    );
  }

  // UPDATE Document Number
  updateScannedDocumentNumber(id: string, documentNumber: string) {
    return this.httpService.put<any>(
      `${this.baseUrl}Update`,
      { id, documentNumber }
    );
  }
}