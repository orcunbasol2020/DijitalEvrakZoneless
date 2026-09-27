// Giden evrakların kargo / posta ile gönderimi (OutgoingDocumentShipments).
// Bir paket birden fazla dağıtım satırını (aynı kuruma giden birkaç evrak)
// kapsayabilir; bu yüzden kayıt evraka değil dağıtım satırlarına bağlanır.
// Sayısal enum değerleri backend ile birebirdir.

// OutgoingDocumentShipment.CargoCompany
export enum CargoCompanyEnum {
  Ptt = 1,
  Aras = 2,
  Yurtici = 3,
  Mng = 4,
  Surat = 5,
  Kurye = 6,
  Diger = 99
}

export const CargoCompanyLabels: Record<CargoCompanyEnum, string> = {
  [CargoCompanyEnum.Ptt]: 'PTT Kargo',
  [CargoCompanyEnum.Aras]: 'Aras Kargo',
  [CargoCompanyEnum.Yurtici]: 'Yurtiçi Kargo',
  [CargoCompanyEnum.Mng]: 'MNG Kargo',
  [CargoCompanyEnum.Surat]: 'Sürat Kargo',
  [CargoCompanyEnum.Kurye]: 'Kurye',
  [CargoCompanyEnum.Diger]: 'Diğer'
};

export const cargoCompanyOptions = Object.entries(CargoCompanyLabels).map(([value, label]) => ({
  value: Number(value) as CargoCompanyEnum,
  label
}));

// OutgoingDocumentShipment.Status
export enum ShipmentStatusEnum {
  KargoyaVerildi = 1,
  Yolda = 2,
  TeslimEdildi = 3,
  Iade = 4
}

export const ShipmentStatusLabels: Record<ShipmentStatusEnum, string> = {
  [ShipmentStatusEnum.KargoyaVerildi]: 'Kargoya Verildi',
  [ShipmentStatusEnum.Yolda]: 'Yolda',
  [ShipmentStatusEnum.TeslimEdildi]: 'Teslim Edildi',
  [ShipmentStatusEnum.Iade]: 'İade'
};

export const shipmentStatusOptions = Object.entries(ShipmentStatusLabels).map(([value, label]) => ({
  value: Number(value) as ShipmentStatusEnum,
  label
}));

// OutgoingDocumentDistribution.DeliveryMethod: alıcıya evrağın hangi yolla ulaştırıldığı.
export enum DeliveryMethodEnum {
  Elden = 1,
  Kargo = 2,
  Ebys = 3
}

export const DeliveryMethodLabels: Record<DeliveryMethodEnum, string> = {
  [DeliveryMethodEnum.Elden]: 'Elden',
  [DeliveryMethodEnum.Kargo]: 'Kargo / Posta',
  [DeliveryMethodEnum.Ebys]: 'EBYS'
};

export const deliveryMethodOptions = Object.entries(DeliveryMethodLabels).map(([value, label]) => ({
  value: Number(value) as DeliveryMethodEnum,
  label
}));

// Paketin içindeki dağıtım satırı (hangi evrak, hangi alıcı).
export interface OutgoingDocumentShipmentItemModel {
  distributionId: string;
  outgoingDocumentId: string;
  documentNumber?: string | null;
  subject?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  externalInstitutionId?: string | null;
  externalInstitutionName?: string | null;
}

// GET/POST/PUT yanıtı (OutgoingDocumentShipmentDto).
export interface OutgoingDocumentShipmentModel {
  id: string;
  cargoCompany: CargoCompanyEnum;
  cargoCompanyName: string;
  trackingNumber: string;
  sentDate: string;
  // Kargoya veren (zimmetli) kullanıcı
  sentUserId: string;
  sentUserFullName?: string | null;
  externalInstitutionId?: string | null;
  externalInstitutionName?: string | null;
  // Paket üzerindeki alıcı adı
  recipientName?: string | null;
  status: ShipmentStatusEnum;
  statusName: string;
  deliveredDate?: string | null;
  cost?: number | null;
  notes?: string | null;
  items: OutgoingDocumentShipmentItemModel[];
  createdDate: string;
  updateDate?: string | null;
}

// POST api/OutgoingDocumentShipments/Create gövdesi. Backend, seçilen dağıtım
// satırlarını pakete bağlar, ilgili evrakların aktif zimmetini "Kargoya Verildi"
// ile kapatır (sonrasında aktif zimmet sorgusu 404 döner) ve her evrağa
// "Gönderildi" işlemi yazar. Aktif zimmeti sentUserId'de olmayan bir evrak ya da
// daha önce kargolanmış bir dağıtım satırı varsa hiçbir kayıt oluşturmadan hata döner.
export interface OutgoingDocumentShipmentCreateInput {
  distributionIds: string[];
  cargoCompany: CargoCompanyEnum;
  trackingNumber: string;
  sentUserId: string;
  // Boş bırakılırsa sunucu saati kullanılır.
  sentDate?: string | null;
  // Boş bırakılırsa tüm satırlar aynı dış kuruma gidiyorsa oradan alınır.
  externalInstitutionId?: string | null;
  recipientName?: string | null;
  cost?: number | null;
  notes?: string | null;
  // Zarf kargoya veriliyorsa zarfın id'si. Backend zarfın durumunu aynı işlemde
  // "Kargoya Verildi" (5) yapar; frontend ayrıca UpdateStatus çağırmaz.
  // Zarf zaten kargoya verilmişse istek hata döner.
  envelopeId?: string | null;
}

// PUT api/OutgoingDocumentShipments/Update gövdesi; yalnızca dolu alanlar
// güncellenir. Durum "Teslim Edildi" olursa dağıtım satırlarının teslim tarihi de
// dolar ve evraklara "Teslim Edildi" (İade için "İade") işlemi yazılır.
export interface OutgoingDocumentShipmentUpdateInput {
  id: string;
  cargoCompany?: CargoCompanyEnum | null;
  trackingNumber?: string | null;
  status?: ShipmentStatusEnum | null;
  deliveredDate?: string | null;
  recipientName?: string | null;
  cost?: number | null;
  notes?: string | null;
  updatedUserId?: string | null;
}
