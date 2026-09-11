import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { AtlasZimmetModel } from '../models/atlas-zimmet.model';

@Injectable({ providedIn: 'root' })
export class AtlasZimmetService {

  // Atlas EBYS entegrasyon API'si hazır olana kadar örnek veri döner.
  // Entegrasyon tamamlandığında gövde `httpService.get<AtlasZimmetModel[]>(...)` çağrısına dönüştürülecek;
  // Zimmetlerim ekranı bu servisin dönüş tipine bağlı olduğu için başka bir değişiklik gerekmeyecek.
  getMyZimmetler(userId: string): Observable<AtlasZimmetModel[]> {
    const mock: AtlasZimmetModel[] = [
      {
        id: 'atlas-demo-1',
        qrCode: '2026-000123',
        documentName: 'Atlas Örnek Evrak 1',
        documentDate: new Date().toISOString()
      },
      {
        id: 'atlas-demo-2',
        qrCode: '2026-000124',
        documentName: 'Atlas Örnek Evrak 2',
        documentDate: new Date().toISOString()
      }
    ];

    return of(mock);
  }
}
