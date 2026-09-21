import { Injectable, inject, signal } from '@angular/core';
import { HttpService } from './http';
import { firstValueFrom } from 'rxjs';
import { EnvelopeDocumentModel } from '../models/envelopedocument.model';

@Injectable({ providedIn: 'root' })
export class EnvelopeDocumentService {

  private httpService = inject(HttpService);
  private baseUrl = 'api/EnvelopeDocuments/';

  // Seçili zarf evrakı
  private selectedEnvelopeDocumentId = signal<string | null>(null);

  setSelectedEnvelopeDocument(id: string) {
    this.selectedEnvelopeDocumentId.set(id);
  }

  clearSelectedEnvelopeDocument() {
    this.selectedEnvelopeDocumentId.set(null);
  }

  get currentEnvelopeDocumentId(): string | null {
    return this.selectedEnvelopeDocumentId();
  }

  // GET ALL (Observable → Promise)
  async getEnvelopeDocuments(): Promise<EnvelopeDocumentModel[]> {
    try {
      const docs$ = this.httpService.get<EnvelopeDocumentModel[]>(
        this.baseUrl + "GetAll"
      );
      const docs = await firstValueFrom(docs$);
      return docs ?? [];
    } catch (error) {
      console.error("Envelope documents load error:", error);
      return [];
    }
  }

  async getEnvelopeDocumentsByEnvelopeId(envelopeId: string): Promise<EnvelopeDocumentModel[]> {
    try {
      const docs$ = this.httpService.get<EnvelopeDocumentModel[]>(
        `${this.baseUrl}GetByEnvelopeId?envelopeId=${encodeURIComponent(envelopeId)}`
      );
      return await firstValueFrom(docs$) ?? [];
    } catch (error) {
      console.error(`Envelope documents load error for EnvelopeId ${envelopeId}:`, error);
      return [];
    }
  }
  // GET BY ID
  getEnvelopeDocumentById(id: string) {
    return this.httpService.get<EnvelopeDocumentModel>(
      `${this.baseUrl}GetById?id=${encodeURIComponent(id)}`
    );
  }

  // CREATE
  createEnvelopeDocument(model: EnvelopeDocumentModel) {
    return this.httpService.post<any>(
      `${this.baseUrl}Create`,
      model
    );
  }

  // REMOVE (soft delete)
  removeEnvelopeDocument(id: string) {
    return this.httpService.post<any>(
      `${this.baseUrl}Remove`,
      { id }
    );
  }

}