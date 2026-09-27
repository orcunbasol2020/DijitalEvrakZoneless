import { Injectable, inject } from '@angular/core';
import { HttpService } from './http';
import {
  OutgoingDocumentShipmentCreateInput,
  OutgoingDocumentShipmentModel,
  OutgoingDocumentShipmentUpdateInput
} from '../models/shipment.model';

// Giden evrak kargo / posta gönderimleri (OutgoingDocumentShipments).
// Kargo kaydı evraka değil dağıtım satırlarına bağlanır; zimmet kapatma ve
// işlem geçmişi yazımı backend tarafında Create içinde yapılır.
@Injectable({ providedIn: 'root' })
export class OutgoingDocumentShipmentService {

  private httpService = inject(HttpService);
  private baseUrl = 'api/OutgoingDocumentShipments/';

  // Seçilen dağıtım satırlarını tek paket olarak kargoya verir. Aktif zimmeti
  // sentUserId'de olmayan bir evrak varsa backend hiçbir kayıt oluşturmadan
  // hata döner; hata mesajı response gövdesinde gelir.
  create(model: OutgoingDocumentShipmentCreateInput) {
    return this.httpService.post<OutgoingDocumentShipmentModel>(
      `${this.baseUrl}Create`,
      model
    );
  }

  // Yalnızca dolu gelen alanlar güncellenir (durum, teslim tarihi, ücret, not...).
  update(model: OutgoingDocumentShipmentUpdateInput) {
    return this.httpService.put<OutgoingDocumentShipmentModel>(
      `${this.baseUrl}Update`,
      model
    );
  }

  getById(id: string) {
    return this.httpService.get<OutgoingDocumentShipmentModel>(
      `${this.baseUrl}GetById?id=${encodeURIComponent(id)}`
    );
  }

  // Bir evrağın dahil olduğu tüm paketler (evrak birden fazla alıcıya kargolanmış olabilir).
  getByOutgoingDocumentId(outgoingDocumentId: string) {
    return this.httpService.get<OutgoingDocumentShipmentModel[]>(
      `${this.baseUrl}GetByOutgoingDocumentId?outgoingDocumentId=${encodeURIComponent(outgoingDocumentId)}`
    );
  }

  // Bulunamazsa 404 döner.
  getByTrackingNumber(trackingNumber: string) {
    return this.httpService.get<OutgoingDocumentShipmentModel>(
      `${this.baseUrl}GetByTrackingNumber?trackingNumber=${encodeURIComponent(trackingNumber)}`
    );
  }
}
