import { Injectable, inject } from '@angular/core';
import { HttpService } from './http';
import { OutgoingDocumentAllocationModel } from '../models/outgoingdocumentallocation.model';
import { AllocationStatusEnum } from '../models/allocationstatus.model';

@Injectable({ providedIn: 'root' })
export class OutgoingDocumentAllocation {

  private httpService = inject(HttpService);

  // Backend route
  private baseUrl = 'api/OutgoingDocumentAllocations';

  // DocumentId ile allocation listeleme
  getByDocumentId(outgoingDocumentId: string) {
    return this.httpService.get<OutgoingDocumentAllocationModel[]>(
      `${this.baseUrl}/GetByDocumentId?outgoingDocumentId=${encodeURIComponent(outgoingDocumentId)}`
    );
  }

  getActiveByDocumentId(outgoingDocumentId: string) {
    return this.httpService.get<OutgoingDocumentAllocationModel>(
      `${this.baseUrl}/GetActiveByDocumentId?outgoingDocumentId=${encodeURIComponent(outgoingDocumentId)}`
    );
  }

  // Kullanıcının üzerindeki aktif allocation'larını getirir
  getActiveByUserId(userId: string) {
    return this.httpService.get<OutgoingDocumentAllocationModel[]>(
      `${this.baseUrl}/GetActiveByUserId?userId=${encodeURIComponent(userId)}`
    );
  }

  // Kullanıcının transfer sayısını getirir
  getTransferCountByUserId(userId: string) {
    return this.httpService.get<number>(
      `${this.baseUrl}/GetTransferCountByUserId?userId=${encodeURIComponent(userId)}`
    );
  }

  // Yeni outgoing document allocation oluşturma
  // status: AllocationStatusEnum (1 İlk Kayıt, 2 Devir, 3 Teslim, 4 Arşiv);
  // backend bugüne kadar string olarak kabul ettiği için tel üzerinde string gönderilir.
  createAllocation(allocation: {
    outgoingDocumentId: string;
    userId: string;
    createdUserId: string;
    status: AllocationStatusEnum;
    userType: number;
  }) {
    return this.httpService.post(
      `${this.baseUrl}/Create`,
      { ...allocation, status: String(allocation.status) }
    );
  }

  // Mevcut allocation'ı günceller
  updateAllocation(allocation: Partial<OutgoingDocumentAllocationModel>) {
    return this.httpService.post(
      `${this.baseUrl}/Update`,
      allocation
    );
  }

  // Zimmeti tamamlanmış bir evrağın taranmış, ıslak imzalı halini yükler
  uploadWetSignedDocument(outgoingDocumentId: string, file: File, uploadedUserId?: string) {
    const formData = new FormData();
    formData.append('outgoingDocumentId', outgoingDocumentId);
    formData.append('file', file, file.name);
    if (uploadedUserId) {
      formData.append('uploadedUserId', uploadedUserId);
    }

    return this.httpService.post<{ message: string }>(
      `${this.baseUrl}/UploadWetSignedDocument`,
      formData
    );
  }

  // Islak imzalı belgeyi indirmek için backend URL'i (anchor/window.open ile kullanılır)
  getWetSignedDownloadUrl(allocationId: string): string {
    return `https://localhost:7056/${this.baseUrl}/DownloadWetSignedDocument?allocationId=${encodeURIComponent(allocationId)}`;
  }
}
