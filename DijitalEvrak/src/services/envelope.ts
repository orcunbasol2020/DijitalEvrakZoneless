import { Injectable, inject, signal } from '@angular/core';
import { HttpService } from './http';
import { firstValueFrom } from 'rxjs';
import { EnvelopeModel, EnvelopeStatus } from '../models/envelope.model';

@Injectable({ providedIn: 'root' })
export class EnvelopeService {

  private httpService = inject(HttpService);
  private baseUrl = 'api/Envelopes/';

  // Seçili zarf
  private selectedEnvelopeId = signal<string | null>(null);

  setSelectedEnvelope(id: string) {
    this.selectedEnvelopeId.set(id);
  }

  clearSelectedEnvelope() {
    this.selectedEnvelopeId.set(null);
  }

  get currentEnvelopeId(): string | null {
    return this.selectedEnvelopeId();
  }


async getEnvelopeByNo(envelopeNo: string): Promise<EnvelopeModel | null> {
  try {
    const obs$ = this.httpService.get<EnvelopeModel>(
      `${this.baseUrl}GetByNo?envelopeNo=${encodeURIComponent(envelopeNo)}`
    );

    const result = await firstValueFrom(obs$);
    return result ?? null;

  } catch (error) {
    // Hata olsa bile null döndür
    console.warn(`Envelope not found for No ${envelopeNo}`);
    return null;
  }
}

  // GET ALL (Observable → Promise)
  async getEnvelopes(): Promise<EnvelopeModel[]> {
    try {
      const envelopes$ = this.httpService.get<EnvelopeModel[]>(
        this.baseUrl + "GetAll"
      );
      const envelopes = await firstValueFrom(envelopes$);
      return envelopes ?? [];
    } catch (error) {
      console.error("Envelopes load error:", error);
      return [];
    }
  }

  // GET BY ID
  getEnvelopeById(id: string) {
    return this.httpService.get<EnvelopeModel>(
      `${this.baseUrl}GetById?id=${encodeURIComponent(id)}`
    );
  }

  // CREATE
  createEnvelope(model: Partial<EnvelopeModel>) {
    return this.httpService.post<EnvelopeModel>(
      `${this.baseUrl}Create`,
      model
    );
  }

  // UPDATE: zarf etiketindeki alıcı (unitName), adres ve alıcı kurumu günceller
  // (POST api/Envelopes/Update). Null gelen alan değişmez, boş metin gelirse alan
  // temizlenir. externalInstitutionId verilirse zarfın hedefi o kurum olur ve
  // kurum içi hedef (targetDepartmentId) backend'de temizlenir.
  // Ticket ekranı ve Kargoya Ver sekmesi kullanır.
  updateEnvelope(
    model: Pick<EnvelopeModel, 'id'> & Partial<Pick<EnvelopeModel, 'unitName' | 'address' | 'externalInstitutionId'>>
  ) {
    return this.httpService.post<{ message: string }>(
      `${this.baseUrl}Update`,
      {
        id: model.id,
        unitName: model.unitName ?? null,
        address: model.address ?? null,
        externalInstitutionId: model.externalInstitutionId ?? null
      }
    );
  }

  // UPDATE STATUS: zarfın durumunu değiştirir (Yeni -> Evrak Birimde -> Teslim Edildi).
  // Zarf içindeki evraklar teslim alınıp / zimmetlenip / teslim edilince çağrılır.
  updateEnvelopeStatus(id: string, status: EnvelopeStatus) {
    return this.httpService.post<void>(
      `${this.baseUrl}UpdateStatus`,
      { id, status }
    );
  }

  // DELETE
  deleteEnvelope(id: string) {
    return this.httpService.delete(
      `${this.baseUrl}${encodeURIComponent(id)}`
    );
  }

}