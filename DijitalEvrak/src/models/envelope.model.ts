export interface EnvelopeModel {
  id: string;
  envelopeNo: string;
  createdByUserId: string;
  externalInstitutionId?: string;
  externalInstitutionName?: string
  departmentId?: string;
  unitName?: string;
  address?: string;
  documentCount:number;
  createdDate?: string;
  status?: number;
}