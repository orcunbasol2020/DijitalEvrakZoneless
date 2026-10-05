import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { HttpService } from './http';
import { DocumentAllocationModel } from '../models/documentallocation.model';
import { AllocationStatusEnum } from '../models/allocationstatus.model';
import { ActiveDocumentsResponse, DocumentDirectionEnum } from '../models/activedocument.model';
import { MessageResponse } from '../models/allocationrequest.model';

export interface CreateAllocationPendingData {
  requestId: string;
  isPendingApproval: boolean;
}

export type CreateAllocationOutcome =
  | { kind: 'allocated' }
  | { kind: 'pending' }
  | { kind: 'failed'; reason: string };

@Injectable({ providedIn: 'root' })
export class DocumentAllocation {

  private httpService = inject(HttpService);

  // Backend route
  private baseUrl = 'api/DocumentAllocations';

  // DocumentId ile aktif zimmet kontrol / listeleme
  getByDocumentId(documentId: string) {
    return this.httpService.get<DocumentAllocationModel[]>(
      `${this.baseUrl}/GetByDocumentId?incomingDocumentId=${encodeURIComponent(documentId)}`
    );
  }

  getActiveByDocumentId(documentId: string) {
    return this.httpService.get<DocumentAllocationModel>(
      `${this.baseUrl}/GetActiveByDocumentId?incomingDocumentId=${encodeURIComponent(documentId)}`
    );
  }

  // Kullanıcının üzerindeki aktif zimmetlerini getirir (Zimmetlerim ekranı)
  getActiveByUserId(userId: string) {
    return this.httpService.get<DocumentAllocationModel[]>(
      `${this.baseUrl}/GetActiveByUserId?userId=${encodeURIComponent(userId)}`
    );
  }

  // Kullanıcının üzerinde aktif zimmetli gelen + giden evrakları tek listede getirir
  // (Zimmetlerim ekranı). documentDirection verilmezse ikisi birlikte döner;
  // pageSize verilmezse tüm kayıtlar tek seferde gelir (üst sınır 200/sayfa).
  getActiveDocumentsByUserId(
    userId: string,
    options: { documentDirection?: DocumentDirectionEnum; page?: number; pageSize?: number } = {}
  ) {
    const params = new URLSearchParams({ userId });
    if (options.documentDirection) params.set('documentDirection', String(options.documentDirection));
    if (options.page) params.set('page', String(options.page));
    if (options.pageSize) params.set('pageSize', String(options.pageSize));

    return this.httpService.get<ActiveDocumentsResponse>(
      `${this.baseUrl}/GetActiveDocumentsByUserId?${params.toString()}`
    );
  }

  // Kullanıcıya verilmiş tüm zimmetleri getirir (Zimmetlerim > Teslim Aldıklarım); sonradan
  // devredilenler de listede kalır (isActive=false). Parametreler ve sıralama
  // GetActiveDocumentsByUserId ile aynıdır.
  getReceivedDocumentsByUserId(
    userId: string,
    options: { documentDirection?: DocumentDirectionEnum; page?: number; pageSize?: number } = {}
  ) {
    const params = new URLSearchParams({ userId });
    if (options.documentDirection) params.set('documentDirection', String(options.documentDirection));
    if (options.page) params.set('page', String(options.page));
    if (options.pageSize) params.set('pageSize', String(options.pageSize));

    return this.httpService.get<ActiveDocumentsResponse>(
      `${this.baseUrl}/GetReceivedDocumentsByUserId?${params.toString()}`
    );
  }

  // Kullanıcının başkasına devrettiği (zimmet devri yaptığı) evrak sayısı
  getTransferCountByUserId(userId: string) {
    return this.httpService.get<number>(
      `${this.baseUrl}/GetTransferCountByUserId?userId=${encodeURIComponent(userId)}`
    );
  }

  // Yeni zimmet oluşturma
  // userType: zimmetlenen kişinin tipi - 1 = iç sistem kullanıcısı (Users), 2 = dış kurum kullanıcısı (ExternalUsers)
  // status: AllocationStatusEnum (1 Ön Kayıt, 2 Devir, 3 Teslim Edildi, 4 Arşiv, 5 Teslim Alındı);
  // backend bugüne kadar string olarak kabul ettiği için tel üzerinde string gönderilir.
  // Kurum içi başka kullanıcıya Devir / Teslim'de zimmet açılmaz, alıcının onayına talep
  // gider; sonucu classifyCreateResponse ile okuyun.
  createAllocation(allocation: {
    incomingDocumentId: string;
    userId: string;
    createdUserId: string;
    status: AllocationStatusEnum;
    userType: number;
  }) {
    return this.httpService.post<MessageResponse<CreateAllocationPendingData | unknown>>(
      `${this.baseUrl}/Create`,
      { ...allocation, status: String(allocation.status) }
    );
  }

  // Create hata durumlarında da HTTP 200 döner ve henüz sonuç kodu taşımaz:
  // onaya gönderilen talep data.isPendingApproval ile, doğrudan zimmet backend'in
  // başarı mesajıyla ayırt edilir; kalan her yanıt hata sayılır ve mesajı gösterilir.
  static classifyCreateResponse(
    res: MessageResponse<CreateAllocationPendingData | unknown> | null | undefined
  ): CreateAllocationOutcome {
    const data = res?.data as CreateAllocationPendingData | null | undefined;
    if (data?.isPendingApproval) return { kind: 'pending' };
    if (res?.message === DocumentAllocation.CREATE_SUCCESS_MESSAGE) return { kind: 'allocated' };
    return { kind: 'failed', reason: res?.message || 'Zimmet kaydedilemedi' };
  }

  private static readonly CREATE_SUCCESS_MESSAGE = 'Evrak başarıyla zimmetlendi';

  // Zimmeti verilen kullanıcıya Devir (2) olarak geçirir. Backend gelen evrakta yeni
  // zimmet açılınca eskisini pasife çeker. Zimmet zaten bu kullanıcıdaysa yeni kayıt
  // açılmaz ve false döner; aktif zimmet sorgulanamazsa yine de devir kaydı açılır.
  transferToUser(incomingDocumentId: string, userId: string): Observable<boolean> {
    return this.getActiveByDocumentId(incomingDocumentId).pipe(
      catchError(() => of(null)),
      switchMap(active => {
        const alreadyMine = !!active?.userId && active.userId.toLowerCase() === userId.toLowerCase();
        if (alreadyMine) return of(false);
        return this.createAllocation({
          incomingDocumentId,
          userId,
          createdUserId: userId,
          status: AllocationStatusEnum.Devir,
          userType: 1
        }).pipe(map(() => true));
      })
    );
  }
}