import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ZimmetStateService {
  private _envelopeId = signal<string | null>(null);

  setEnvelopeId(id: string) {
    this._envelopeId.set(id);
  }

  getEnvelopeId() {
    return this._envelopeId();
  }

  clear() {
    this._envelopeId.set(null);
  }
}
