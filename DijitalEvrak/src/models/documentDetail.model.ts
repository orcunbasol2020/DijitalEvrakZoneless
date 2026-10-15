import { DepartmentId, ExternalInstitutionId } from './ids';
export interface DocumentDetailModel {
  id: string;
  qrCode: string;
  orginalNo: string;
  subject: string;
  externalInstitutionId: ExternalInstitutionId | null;
  // Kurum adı (ComAgency); cevapta doldurulur, ad için kurum listesi çekilmez
  externalInstitutionName?: string | null;
  departmentId: DepartmentId | null;
  documentDate: string;
  notes: string;
  documentName: string;
  documentTypeId : number;
}
