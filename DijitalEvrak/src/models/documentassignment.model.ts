export interface DocumentAssignmentModel {
  id: string;           // Assignment ID (Guid)
  documentId: string;   // Evrak ID (Guid)
  userId?: string;      // Kullanıcı ID (nullable)
  lock?: boolean;       // Kilit durumu (nullable)
  isActive?: boolean;   // Aktif mi (nullable)
  createdDate: string;  // Oluşturulma tarihi (ISO string)
}