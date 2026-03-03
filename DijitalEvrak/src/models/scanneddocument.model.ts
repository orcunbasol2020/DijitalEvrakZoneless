export interface ScannedDocumentModel {
  id: string;
  fileName: string;
  originalPath: string;
  newPath: string;
  isDeleted: boolean;
  createdDate: string;  
  updateDate?: string; 
}