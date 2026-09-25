import { Injectable, inject, signal } from '@angular/core';
import { HttpService } from './http';
import { IncomingDocumentModel } from '../models/incoming-document/incoming-document.model';
import { IncomingDocumentPreRegisterModel } from '../models/incoming-document/incomingdocument-pregister.model';
import { IncomingDocumentTodayStats } from '../models/dashboard/IncomingDocumentTodayStats.model';
import { firstValueFrom } from 'rxjs';
import { IncomingDocumentLast30DaysStats } from '../models/dashboard/IncomingDocument30DaysStats.model';
import { IncomingDocumentPendingScanStats } from '../models/dashboard/IncomingDocumentPendingScanStats.model';
import { IncomingDocumentOcrQueueStats } from '../models/dashboard/IncomingDocumentOcrQueueStats.model';

@Injectable({ providedIn: 'root' })
export class IncomingDocumentService {

  private httpService = inject(HttpService);
  private baseUrl = 'api/IncomingDocuments/';

  // 📌 Detay ekranı için seçili incoming document
  private selectedIncomingDocumentId = signal<string | null>(null);
  setSelectedIncomingDocument(id: string) {
    this.selectedIncomingDocumentId.set(id);
  }
  clearSelectedIncomingDocument() {
    this.selectedIncomingDocumentId.set(null);
  }
  get currentIncomingDocumentId(): string | null {
    return this.selectedIncomingDocumentId();
  }

  //zimmet ekranı icin setlenen documentId
  private zimmetDocumentId = signal<string | null>(null);
  setZimmetIncomingDocument(id: string) { this.zimmetDocumentId.set(id); }
  get currentZimmetDocumentId(): string | null { return this.zimmetDocumentId(); }
  clearZimmetIncomingDocument() { this.zimmetDocumentId.set(null); }

  // QR ekranından geçiş için update tipi (id mi documentId mi)
  private incomingDocumentUpdateType = signal<string | null>(null);
  private incomingDocumentSearchType = signal<string | null>(null);


  setIncomingDocumentUpdateType(type: string) {
    this.incomingDocumentUpdateType.set(type);
  }
  get currentIncomingDocumentUpdateType(): string | null {
    return this.incomingDocumentUpdateType();
  }
  setIncomingDocumentSearchType(type: string) {
    this.incomingDocumentSearchType.set(type);
  }
  get currentIncomingDocumentSearchType(): string | null {
    return this.incomingDocumentSearchType();
  }

  // GET ALL (resource)
  getAllIncomingDocuments(departmentId?: string) {
    const query = departmentId ? `?departmentId=${encodeURIComponent(departmentId)}` : '';
    return this.httpService.get<IncomingDocumentModel[]>(
      this.baseUrl + "GetAll" + query
    );
  }

  // GET BY QR CODE
  GetByQrCode(qrCode: string) {
    return this.httpService.get<IncomingDocumentModel>(
      `${this.baseUrl}GetByQrCode?qrCode=${encodeURIComponent(qrCode)}`
    );
  }

  // GET BY DOCUMENT ID
  getIncomingDocumentByDocumentId(documentId: string) {
    return this.httpService.get<IncomingDocumentModel>(
      `${this.baseUrl}GetById?id=${encodeURIComponent(documentId)}`
    );
  }

  // CREATE
  createIncomingDocument(model: IncomingDocumentModel) {
    return this.httpService.post<any>(
      `${this.baseUrl}Create`,
      model
    );
  }

  createIncomingDocumentPreRegister(model: IncomingDocumentPreRegisterModel) {
    return this.httpService.post<PreRegisterResponse>(
      `${this.baseUrl}PreRegister`,
      model
    );
  }

  // UPDATE
  updateIncomingDocument(model: IncomingDocumentModel) {
    return this.httpService.put<any>(
      `${this.baseUrl}Update`,
      model
    );
  }

  // BELGE YÜKLE: tarayıcı hattı dışında, henüz taranmamış ön kayıt evrakına
  // dosya yükler (multipart/form-data). Evrak id ile birlikte qrCode ve yükleyen
  // kullanıcı da gönderilir; backend hangisini bekliyorsa onu kullanır.
  uploadFile(documentId: string, file: File, options?: { qrCode?: string; userId?: string }) {
    const formData = new FormData();
    formData.append('id', documentId);
    if (options?.qrCode) formData.append('qrCode', options.qrCode);
    if (options?.userId) formData.append('userId', options.userId);
    formData.append('file', file, file.name);

    return this.httpService.post<any>(
      `${this.baseUrl}UploadFile`,
      formData
    );
  }

  // OCR Filtreli liste
  getIncomingDocumentsByStatus(status: string, departmentId?: string) {
    const departmentQuery = departmentId ? `&departmentId=${encodeURIComponent(departmentId)}` : '';
    return this.httpService.createResource<IncomingDocumentModel[]>(
      `${this.baseUrl}GetAll?Status=${encodeURIComponent(status)}${departmentQuery}`
    );
  }
  // GET BY STATUS: DocumentStatusEnum değerine göre (1 Ön Kayıt, 2 Güncelleme, 3 Teslim,
  // 4 Eşleştirme, 5 Ocr, 6 Yayınla). departmentId ve createdUserId isteğe bağlı süzgeçlerdir.
  getIncomingDocumentsByStatusCode(status: number, options?: { departmentId?: string; createdUserId?: string }) {
    const params = [`status=${status}`];
    if (options?.departmentId) params.push(`departmentId=${encodeURIComponent(options.departmentId)}`);
    if (options?.createdUserId) params.push(`createdUserId=${encodeURIComponent(options.createdUserId)}`);
    return this.httpService.get<IncomingDocumentModel[]>(
      `${this.baseUrl}GetByStatus?${params.join('&')}`
    );
  }
  getIncomingDocumentsByDirection(documentDirection: string) {
    return this.httpService.createResource<IncomingDocumentModel[]>(
      `${this.baseUrl}GetByDirection?documentDirection=${encodeURIComponent(documentDirection)}`
    );
  }
  deleteIncomingDocument(id: string) {
    return this.httpService.delete(
      `${this.baseUrl}${encodeURIComponent(id)}`
    );
  }

  // PDF URL ÜRETİCİ
  getPdfUrl(fileName: string): string {
    if (!fileName) return '';
    return `https://localhost:7056/api/ScannedDocuments/GetPdf?fileName=${encodeURIComponent(fileName)}`;
  }

  getPendingCount(userId: string) {
    return this.httpService.get<number>(
      `${this.baseUrl}GetPendingCount?userId=${encodeURIComponent(userId)}`
    );
  }

  // Bugün gelen evraklar
  private todayStatsSignal = signal<IncomingDocumentTodayStats | null>(null);

  get todayStats() {
    return this.todayStatsSignal();
  }

  async loadTodayStats(): Promise<IncomingDocumentTodayStats | null> {
    try {
      const stats$ = this.httpService.get<IncomingDocumentTodayStats>(
        this.baseUrl + 'GetTodayStats'
      );
      const stats = await firstValueFrom(stats$);
      this.todayStatsSignal.set(stats);
      return stats;
    } catch (error) {
      console.error('Incoming document stats load error:', error);
      return null;
    }
  }

  private last30DaysStatsSignal = signal<IncomingDocumentLast30DaysStats | null>(null);

  get last30DaysStats() {
    return this.last30DaysStatsSignal();
  }

  async loadLast30DaysStats(): Promise<IncomingDocumentLast30DaysStats | null> {
    try {
      const stats$ = this.httpService.get<IncomingDocumentLast30DaysStats>(
        this.baseUrl + 'GetLast30DaysStats'
      );
      const stats = await firstValueFrom(stats$);
      this.last30DaysStatsSignal.set(stats);
      return stats;
    } catch (error) {
      console.error('Incoming document last 30 days stats load error:', error);
      return null;
    }
  }


  private pendingScanStatsSignal = signal<IncomingDocumentPendingScanStats | null>(null);

  get pendingScanStats() {
    return this.pendingScanStatsSignal();
  }

  async loadPendingScanStats(): Promise<IncomingDocumentPendingScanStats | null> {
    try {
      const stats$ = this.httpService.get<IncomingDocumentPendingScanStats>(
        this.baseUrl + 'GetPendingScanStats'
      );
      const stats = await firstValueFrom(stats$);
      this.pendingScanStatsSignal.set(stats);
      return stats;
    } catch (error) {
      console.error('Pending scan stats load error:', error);
      return null;
    }
  }

  private ocrQueueStatsSignal = signal<IncomingDocumentOcrQueueStats | null>(null);

  get ocrQueueStats() {
    return this.ocrQueueStatsSignal();
  }

  async loadOcrQueueStats(): Promise<IncomingDocumentOcrQueueStats | null> {
    try {
      const stats$ = this.httpService.get<IncomingDocumentOcrQueueStats>(
        this.baseUrl + 'GetOcrQueueStats'
      );
      const stats = await firstValueFrom(stats$);
      this.ocrQueueStatsSignal.set(stats);
      return stats;
    } catch (error) {
      console.error('OCR queue stats load error:', error);
      return null;
    }
  }

}

export interface PreRegisterResponse {
  id: string;
}
