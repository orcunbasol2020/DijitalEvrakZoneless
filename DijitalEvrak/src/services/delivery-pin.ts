import { Injectable, inject } from '@angular/core';
import { HttpService } from './http';
import { DeliveryPinStatus, MessageResponse } from '../models/allocationrequest.model';

// Kişisel teslim PIN'i (api/DeliveryPins): kişi kendi oturumunda belirler, evrak biriminde zimmeti
// memurun ekranında yerinde onaylarken girer. Kullanıcı yalnızca token'dan alınır; PIN hiçbir yanıtta dönmez.
@Injectable({ providedIn: 'root' })
export class DeliveryPinService {
  private readonly http = inject(HttpService);
  private readonly baseUrl = 'api/DeliveryPins';

  getStatus() {
    return this.http.get<DeliveryPinStatus>(`${this.baseUrl}/Status`);
  }

  // Kurala uymuyorsa data.saved false döner, nedeni message'ta
  set(pin: string) {
    return this.http.post<MessageResponse<{ saved: boolean }>>(`${this.baseUrl}/Set`, { pin });
  }
}
