import { CargoCompanyEnum, DeliveryMethodEnum, ShipmentStatusEnum } from './shipment.model';

// Giden evrağın dağıtım (alıcı) listesi. Bir evrak birden fazla iç birime
// ve/veya dış kuruma gidebilir; her satır tek bir alıcıyı temsil eder.
// İç birim için departmentId, dış kurum için externalInstitutionId dolu olur
// (backend doğrulaması ikisinden yalnızca birinin dolu olmasını ister).
// Not: Bu alan adı, OutgoingDocument üzerindeki eski "externalInstitutonId"
// alanının aksine doğru yazımla (externalInstitutionId) gelir.
export interface OutgoingDocumentDistributionModel {
  id: string;
  outgoingDocumentId: string;
  departmentId?: string | null;
  departmentName?: string | null;
  externalInstitutionId?: string | null;
  externalInstitutionName?: string | null;
  // true: Gereği, false: Bilgi
  actionRequired?: boolean | null;
  // Alıcıya ulaştırma yolu (DeliveryMethodEnum: Elden / Kargo / EBYS).
  // Kargoya verildiğinde backend bunu Kargo yapar.
  deliveryMethod?: DeliveryMethodEnum | null;
  // Alıcıya gönderim tarihi
  sentDate?: string | null;
  // Alıcıya teslim tarihi
  deliveryDate?: string | null;
  // Satır bir kargo paketine bağlandıysa paketin id'si ve özet bilgileri
  // (OutgoingDocumentShipments). Kargolanmış satır yeniden kargoya verilemez.
  shipmentId?: string | null;
  cargoCompany?: CargoCompanyEnum | null;
  trackingNumber?: string | null;
  shipmentStatus?: ShipmentStatusEnum | null;
  notes?: string | null;
  createdDate: string;
  updateDate?: string | null;
}

// POST api/OutgoingDocumentDistributions/Create gövdesindeki tek alıcı.
export interface OutgoingDocumentRecipientInput {
  departmentId?: string | null;
  externalInstitutionId?: string | null;
  actionRequired?: boolean | null;
  sentDate?: string | null;
  deliveryDate?: string | null;
  deliveryMethod?: DeliveryMethodEnum | null;
  notes?: string | null;
}

// PUT api/OutgoingDocumentDistributions/Update gövdesi. Backend yalnızca dolu
// gelen alanları günceller; alıcı (birim/kurum) sonradan değiştirilemez,
// bunun için satır silinip yeniden eklenir.
export interface OutgoingDocumentDistributionUpdateInput {
  id: string;
  actionRequired?: boolean | null;
  sentDate?: string | null;
  deliveryDate?: string | null;
  deliveryMethod?: DeliveryMethodEnum | null;
  notes?: string | null;
}

// Alıcının ekranda gösterilecek adı; DTO'daki ad boşsa verilen id -> ad
// eşlemelerinden çözülür.
export function distributionRecipientName(
  d: OutgoingDocumentDistributionModel,
  departmentNames?: Record<string, string>,
  institutionNames?: Record<string, string>
): string {
  if (d.externalInstitutionId) {
    return d.externalInstitutionName || institutionNames?.[d.externalInstitutionId] || '-';
  }
  if (d.departmentId) {
    return d.departmentName || departmentNames?.[d.departmentId] || '-';
  }
  return '-';
}
