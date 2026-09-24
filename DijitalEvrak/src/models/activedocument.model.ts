import { AllocationStatusEnum } from './allocationstatus.model';

// GET api/DocumentAllocations/GetActiveDocumentsByUserId yanıtı:
// kullanıcının üzerinde aktif zimmetli gelen + giden evraklar, zimmet tarihine göre yeniden eskiye.

// Evrağın yönü; documentId buna göre IncomingDocument (1) ya da OutgoingDocument (2) tablosuna aittir.
export enum DocumentDirectionEnum {
  Gelen = 1,
  Giden = 2
}

export const DocumentDirectionLabels: Record<DocumentDirectionEnum, string> = {
  [DocumentDirectionEnum.Gelen]: 'Gelen Evrak',
  [DocumentDirectionEnum.Giden]: 'Giden Evrak'
};

// Zimmetin yapıldığı sistem
export enum AllocationSourceEnum {
  EvrakTakip = 1,
  Atlas = 2
}

export const AllocationSourceLabels: Record<AllocationSourceEnum, string> = {
  [AllocationSourceEnum.EvrakTakip]: 'Evrak Takip',
  [AllocationSourceEnum.Atlas]: 'Atlas'
};

export interface ActiveDocumentModel {
  allocationId: string;
  documentId: string;
  documentDirection: DocumentDirectionEnum;
  qrCode?: string | null;
  documentNo?: string | null;        // Gelen: orijinal no, giden: orijinal belge numarası
  documentName?: string | null;      // Giden evrakta konu (Subject)
  documentDate?: string | null;
  fromName?: string | null;          // Gelen: dış kurum, giden: birim
  toName?: string | null;            // Gelen: birim, giden: dış kurum
  status: AllocationStatusEnum;
  source: AllocationSourceEnum;
  allocatedDate: string;             // UTC
}

export interface ActiveDocumentsResponse {
  items: ActiveDocumentModel[];
  totalCount: number;
  page: number;
  pageSize: number;
}
