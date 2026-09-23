import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ZimmetStateService {
  private _envelopeId = signal<string | null>(null);
  private _outgoingDocumentId = signal<string | null>(null);
  // Teslim Bilgisi (gidenzimmet) ekranındaki "Geri" butonunun döneceği rota.
  // Boşsa Zarflar listesine dönülür.
  private _returnUrl = signal<string | null>(null);

  setEnvelopeId(id: string, returnUrl: string | null = null) {
    this._envelopeId.set(id);
    this._returnUrl.set(returnUrl);
  }

  getEnvelopeId() {
    return this._envelopeId();
  }

  getReturnUrl() {
    return this._returnUrl();
  }

  clear() {
    this._envelopeId.set(null);
    this._returnUrl.set(null);
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
