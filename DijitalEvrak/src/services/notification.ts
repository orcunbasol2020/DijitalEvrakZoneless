import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { HttpService } from './http';
import { MessageResponse } from '../models/allocationrequest.model';
import {
  NotificationModel,
  NotificationTypeEnum,
  isApprovalRequestNotification
} from '../models/notification.model';

// Uygulama içi bildirimler (api/Notifications). Okunmamışlar tek yerde tutulur; zil menüsü,
// girişteki hatırlatma popup'ı ve Zimmet Onayları ekranının Bildirimler sekmesi aynı listeyi
// okur. Sunucu anlık bildirim göndermediği için liste periyodik yenilenir.
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http = inject(HttpService);
  private readonly router = inject(Router);
  private readonly baseUrl = 'api/Notifications';

  private static readonly POLL_INTERVAL_MS = 60_000;
  private static readonly UNREAD_TAKE = 50;

  readonly unread = signal<NotificationModel[]>([]);
  // Onay talebi / hatırlatma dışındaki okunmamışlar (bkz. isApprovalRequestNotification)
  readonly unreadVisible = computed(() => this.unread().filter(n => !isApprovalRequestNotification(n)));

  private pollUserId: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  getByUserId(userId: string, onlyUnread: boolean, take?: number): Observable<NotificationModel[]> {
    const params = new URLSearchParams({ userId, onlyUnread: String(onlyUnread) });
    if (take) params.set('take', String(take));
    return this.http.get<NotificationModel[]>(`${this.baseUrl}/GetByUserId?${params.toString()}`)
      .pipe(map(list => list ?? []));
  }

  refreshUnread(userId: string): Observable<NotificationModel[]> {
    return this.getByUserId(userId, true, NotificationService.UNREAD_TAKE).pipe(
      tap(list => this.unread.set(list)),
      catchError(err => {
        console.error('Bildirimler alınamadı:', err);
        return of(this.unread());
      })
    );
  }

  // Okundu işareti önce ekranda uygulanır; istek başarısız olsa da bir sonraki yenilemede düzelir.
  markAsRead(id: string, userId: string): void {
    this.unread.update(list => list.filter(n => n.id !== id));
    this.http.post<MessageResponse<unknown>>(`${this.baseUrl}/MarkAsRead`, { id, userId })
      .subscribe({ error: err => console.error('Bildirim okundu işaretlenemedi:', err) });
  }

  markAllAsRead(userId: string): Observable<void> {
    this.unread.set([]);
    return this.http.post<MessageResponse<unknown>>(`${this.baseUrl}/MarkAllAsRead`, { userId }).pipe(
      map(() => undefined),
      catchError(err => {
        console.error('Bildirimler okundu işaretlenemedi:', err);
        return of(undefined);
      })
    );
  }

  // Bildirime tıklanınca okundu sayılır ve ilgili ekrana gidilir:
  // bekleyen onaylar ve iptal (alıcı) → Onayımı Bekleyenler, gecikme (devreden) → Gönderdiklerim,
  // red (evrak devredene döndü) → Zimmetlerim, diğerleri → Bildirimler sekmesi.
  open(notification: NotificationModel, userId: string): void {
    if (!notification.isRead) this.markAsRead(notification.id, userId);

    switch (Number(notification.type)) {
      case NotificationTypeEnum.ZimmetOnayTalebi:
      case NotificationTypeEnum.ZimmetOnayHatirlatma:
        this.router.navigate(['/zimmet-onaylari']);
        break;
      case NotificationTypeEnum.ZimmetOnayGecikme:
        this.router.navigate(['/zimmet-onaylari'], { queryParams: { sekme: 'gonderilen' } });
        break;
      case NotificationTypeEnum.ZimmetReddedildi:
        this.router.navigate(['/zimmetlerim']);
        break;
      default:
        this.router.navigate(['/zimmet-onaylari'], { queryParams: { sekme: 'bildirimler' } });
    }
  }

  startPolling(userId: string, destroyRef: DestroyRef): void {
    if (this.pollUserId === userId && this.pollTimer) return;
    this.stopPolling();

    this.pollUserId = userId;
    this.refreshUnread(userId).subscribe();
    this.pollTimer = setInterval(
      () => this.refreshUnread(userId).subscribe(),
      NotificationService.POLL_INTERVAL_MS
    );
    destroyRef.onDestroy(() => this.stopPolling());
  }

  // Çıkışta (layout kapanınca) önceki kullanıcının listesi de temizlenir.
  stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.pollUserId = null;
    this.unread.set([]);
  }
}
