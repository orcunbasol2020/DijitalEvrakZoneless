import { Injectable, inject } from '@angular/core';
import { HttpService } from './http';
import { DepartmentId } from '../models/ids';

/** ComDepartment.DepartmentTypeId */
export const DepartmentType = {
  Merkez: 30006,
  Buyukelcilik: 30001,
  Baskonsolosluk: 30002,
  DaimiTemsilcilik: 30003,
  TicaretOfisi: 30004,
  FahriKonsolosluk: 30005,
} as const;

// Birimler kaynak sistemden (ComDepartment) gelir, salt okunurdur; kimlikleri sayıdır.
export interface DepartmentModel {
  id: DepartmentId;
  name: string;
  // Kısa ad (ör. liste sütunlarında yer kazanmak için); boş olabilir.
  shortName?: string | null;
  parentId?: DepartmentId | null;
  /** DepartmentType değerlerinden biri; merkez birimler 30006 */
  type?: number | null;
  /**
   * Makam seviyesi: 1 Bakan, 2 Bakan Yardımcılığı / Özel Kalem / Sözcülük, 3 Müsteşar Yrd. / Müşavirlik,
   * 4 Genel Müdürlük, 5 Genel Müdür Yardımcılığı, 6 Daire Başkanlığı, 7+ alt birimler; bazılarında boş
   */
  level?: number | null;
  /** Aynı seviyede makam sırası; çoğunda boş */
  sortOrder?: number | null;
}

/** "Bakan" birimi: Bakan Yardımcılıkları ve makam birimleri bunun altındadır (ağacın tepesi) */
export const MINISTER_DEPARTMENT_ID = 11082872;

/**
 * Makam sırası: level, sortOrder (boşlar sonda), ad. GetAll zaten bu sırayla döner; ağaçta aynı üst birimin
 * altındakiler de bu sırayla dizilir.
 */
export function compareDepartments(a: DepartmentModel, b: DepartmentModel): number {
  const nullsLast = (x?: number | null, y?: number | null) =>
    (x ?? Number.MAX_SAFE_INTEGER) - (y ?? Number.MAX_SAFE_INTEGER);
  return nullsLast(a.level, b.level) || nullsLast(a.sortOrder, b.sortOrder) || a.name.localeCompare(b.name, 'tr');
}

@Injectable({ providedIn: 'root' })
export class Department {

  private httpService = inject(HttpService);

  // ✔ Backend route ile uyumlu
  private baseUrl = 'api/Departments';

  /**
   * Varsayılan olarak yalnızca merkez birimler (~600). includeMissions: yurt dışı temsilciliklerimiz de
   * (büyükelçilik, başkonsolosluk ...); kullanıcıların yarısından fazlası temsilciliklerdedir.
   */
  getDepartments(includeMissions = false) {
    return this.httpService.get<DepartmentModel[]>(
      `${this.baseUrl}/GetAll${includeMissions ? '?includeMissions=true' : ''}`
    );
  }
}
