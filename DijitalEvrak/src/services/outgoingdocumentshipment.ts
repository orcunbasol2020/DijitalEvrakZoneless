import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { HttpService } from './http';
import { SKIP_ERROR_TOAST } from '../interceptors/error-interceptor';
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
  private http = inject(HttpClient);
  private baseUrl = 'api/OutgoingDocumentShipments/';

  // Kargo Takip listesi. departmentId verilirse yalnızca o birimin evraklarını içeren
  // paketler döner. Uç nokta backend'de henüz yoksa 404 gelir; ekran bunu kendisi
  // gösterdiği için genel hata toast'ı atlanır.
  getAll(departmentId?: string) {
    const query = departmentId ? `?departmentId=${encodeURIComponent(departmentId)}` : '';
    return this.http.get<OutgoingDocumentShipmentModel[]>(`${this.baseUrl}GetAll${query}`, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true)
    });
  }

  // Takip numarasıyla arama; bulunamayan numara (404) ekranda "bulunamadı" olarak gösterilir.
  findByTrackingNumber(trackingNumber: string) {
    return this.http.get<OutgoingDocumentShipmentModel>(
      `${this.baseUrl}GetByTrackingNumber?trackingNumber=${encodeURIComponent(trackingNumber)}`,
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) }
    );
  }

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
