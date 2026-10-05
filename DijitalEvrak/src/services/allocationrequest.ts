import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { HttpService } from './http';
import {
  AllocationRequestActionResult,
  AllocationRequestModel,
  MessageResponse
} from '../models/allocationrequest.model';

// Gelen evrak zimmet onay talepleri (api/DocumentAllocationRequests).
// Kullanıcının onayını bekleyen talepler burada tek yerde tutulur; zil menüsü,
// sol menü rozeti, girişteki hatırlatma popup'ı ve Zimmet Onayları ekranı aynı
// listeyi okur. Sunucu anlık bildirim göndermediği için liste periyodik yenilenir.
@Injectable({ providedIn: 'root' })
export class AllocationRequestService {
  private readonly http = inject(HttpService);
  private readonly baseUrl = 'api/DocumentAllocationRequests';

  private static readonly POLL_INTERVAL_MS = 60_000;

  readonly pendingForMe = signal<AllocationRequestModel[]>([]);

  private pollUserId: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  getPendingByUserId(userId: string): Observable<AllocationRequestModel[]> {
    return this.http.get<AllocationRequestModel[]>(
      `${this.baseUrl}/GetPendingByUserId?userId=${encodeURIComponent(userId)}`
    ).pipe(map(list => list ?? []));
  }

  getSentByUserId(userId: string, onlyPending = true): Observable<AllocationRequestModel[]> {
    return this.http.get<AllocationRequestModel[]>(
      `${this.baseUrl}/GetSentByUserId?userId=${encodeURIComponent(userId)}&onlyPending=${onlyPending}`
    ).pipe(map(list => list ?? []));
  }

  getByDocumentId(incomingDocumentId: string): Observable<AllocationRequestModel[]> {
    return this.http.get<AllocationRequestModel[]>(
      `${this.baseUrl}/GetByDocumentId?incomingDocumentId=${encodeURIComponent(incomingDocumentId)}`
    ).pipe(map(list => list ?? []));
  }

  // Tekil onay; şerhli kabul yalnızca bununla yapılır (ApproveBulk şerhsizdir).
  // hasDiscrepancy = true ise note zorunlu (en fazla 1000 karakter).
  approve(requestId: string, userId: string, hasDiscrepancy = false, note: string | null = null) {
    return this.http.post<MessageResponse<AllocationRequestActionResult | AllocationRequestActionResult[]>>(
      `${this.baseUrl}/Approve`, { requestId, userId, hasDiscrepancy, note }
    );
  }

  approveBulk(requestIds: string[], userId: string) {
    return this.http.post<MessageResponse<AllocationRequestActionResult[]>>(
      `${this.baseUrl}/ApproveBulk`, { requestIds, userId }
    );
  }

  rejectBulk(requestIds: string[], userId: string, note: string | null) {
    return this.http.post<MessageResponse<AllocationRequestActionResult[]>>(
      `${this.baseUrl}/RejectBulk`, { requestIds, userId, note }
    );
  }

  cancelBulk(requestIds: string[], userId: string, note: string | null) {
    return this.http.post<MessageResponse<AllocationRequestActionResult[]>>(
      `${this.baseUrl}/CancelBulk`, { requestIds, userId, note }
    );
  }

  // Onayımı bekleyenleri yeniden çeker ve ortak listeyi günceller.
  // Hata olursa eldeki liste korunur.
  refreshPendingForMe(userId: string): Observable<AllocationRequestModel[]> {
    return this.getPendingByUserId(userId).pipe(
      tap(list => this.pendingForMe.set(list)),
      catchError(err => {
        console.error('Zimmet onay talepleri alınamadı:', err);
        return of(this.pendingForMe());
      })
    );
  }

  // Layout açıkken onay bekleyen liste dakikada bir yenilenir.
  startPolling(userId: string, destroyRef: DestroyRef): void {
    if (this.pollUserId === userId && this.pollTimer) return;
    this.stopPolling();

    this.pollUserId = userId;
    this.refreshPendingForMe(userId).subscribe();
    this.pollTimer = setInterval(
      () => this.refreshPendingForMe(userId).subscribe(),
      AllocationRequestService.POLL_INTERVAL_MS
    );
    destroyRef.onDestroy(() => this.stopPolling());
  }

  // Çıkışta (layout kapanınca) önceki kullanıcının listesi de temizlenir.
  stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.pollUserId = null;
    this.pendingForMe.set([]);
  }
}
