import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ZimmetStateService {
  private _envelopeId = signal<string | null>(null);
  private _outgoingDocumentId = signal<string | null>(null);

  setEnvelopeId(id: string) {
    this._envelopeId.set(id);
  }

  getEnvelopeId() {
    return this._envelopeId();
  }

  clear() {
    this._envelopeId.set(null);
  }

  setOutgoingDocumentId(id: string) {
    this._outgoingDocumentId.set(id);
  }

  getOutgoingDocumentId() {
    return this._outgoingDocumentId();
  }

  clearOutgoingDocumentId() {
    this._outgoingDocumentId.set(null);
  }
}
