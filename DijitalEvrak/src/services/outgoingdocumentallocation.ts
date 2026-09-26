import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { HttpService } from './http';
import { OutgoingDocumentAllocationModel } from '../models/outgoingdocumentallocation.model';
import { AllocationStatusEnum } from '../models/allocationstatus.model';

export interface OutgoingAllocationRequest {
  outgoingDocumentId: string;
  userId: string;
  createdUserId: string;
  status: AllocationStatusEnum;
  userType: number;
}

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
  // status: AllocationStatusEnum (1 Ön Kayıt, 2 Devir, 3 Teslim Edildi, 4 Arşiv, 5 Teslim Alındı);
  // backend bugüne kadar string olarak kabul ettiği için tel üzerinde string gönderilir.
  createAllocation(allocation: OutgoingAllocationRequest) {
    return this.httpService.post(
      `${this.baseUrl}/Create`,
      { ...allocation, status: String(allocation.status) }
    );
  }

  // Mevcut allocation'ı günceller
  // (status Create ile aynı sözleşme gereği string olarak da gönderilebilir).
  updateAllocation(
    allocation: Partial<Omit<OutgoingDocumentAllocationModel, 'status'>> & { status?: AllocationStatusEnum | string }
  ) {
    return this.httpService.post(
      `${this.baseUrl}/Update`,
      allocation
    );
  }

  // Evrak üzerindeki aktif zimmet kayıtlarını isActive=false yapar.
  // Eski kayıtlar silinmez; geçmiş (kimden kime, ne zaman) izlenebilir kalır.
  async deactivateActiveAllocations(outgoingDocumentId: string): Promise<number> {
    const existing = await firstValueFrom(this.getByDocumentId(outgoingDocumentId)) ?? [];
    const active = existing.filter(a => a.isActive && !a.isDeleted);

    for (const allocation of active) {
      await firstValueFrom(
        this.updateAllocation({
          ...allocation,
          isActive: false,
          // Create ile aynı sözleşme: status tel üzerinde string gider.
          status: String(allocation.status)
        })
      );
    }

    return active.length;
  }

  // Zimmet devri: önce evrakın mevcut aktif zimmetleri pasife çekilir,
  // ardından seçilen kişi için yeni (aktif) zimmet kaydı oluşturulur.
  async reallocate(allocation: OutgoingAllocationRequest): Promise<void> {
    await this.deactivateActiveAllocations(allocation.outgoingDocumentId);
    await firstValueFrom(this.createAllocation(allocation));
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
