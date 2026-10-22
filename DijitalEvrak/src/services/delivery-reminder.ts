import { Injectable, inject } from '@angular/core';
import { HttpContext } from '@angular/common/http';
import { HttpService } from './http';
import { DepartmentId } from '../models/ids';
import { SKIP_ERROR_TOAST } from '../interceptors/error-interceptor';

/** owners: Birim Evrak Sorumlusu / Birim Yöneticisi, department: birimin kurumsal e-postası, none: adres yok */
export type ReminderRecipientSource = 'owners' | 'department' | 'none';

/** api/DeliveryReminders/Preview: alıcı, konu ve gövde sunucuda hesaplanır. Tarihler UTC. */
export interface DeliveryReminderPreview {
  departmentId: DepartmentId;
  departmentName: string;
  to: string[];
  recipientSource: ReminderRecipientSource;
  subject: string;
  /** Düz metin, satır sonu \n */
  body: string;
  pendingCount: number;
  urgentCount: number;
  lastSentAt: string | null;
  /** "Ad Soyad" */
  lastSentBy: string | null;
  canSend: boolean;
  /** canSend false iken nedeni */
  reason: string | null;
  /** Tekrar sınırı sürüyorsa kalan dakika */
  retryAfterMinutes: number | null;
}

export interface DeliveryReminderSent {
  sentAt: string;
  to: string[];
  pendingCount: number;
}

/**
 * Teslim alınmayı bekleyen evrak hatırlatması (yalnızca Yönetici ve Gelen Evrak rolleri).
 * Hata mesajlarını popup kendisi gösterdiği için genel hata toast'ı atlanır.
 * Send: 400 bekleyen / adres yok, 404 birim yok, 429 tekrar sınırı, 503 SMTP kapalı ya da hatalı.
 */
@Injectable({ providedIn: 'root' })
export class DeliveryReminderService {
  readonly #http = inject(HttpService);
  readonly #baseUrl = 'api/DeliveryReminders';
  readonly #options = { context: new HttpContext().set(SKIP_ERROR_TOAST, true) };

  preview(departmentId: DepartmentId) {
    return this.#http.get<DeliveryReminderPreview>(`${this.#baseUrl}/Preview?departmentId=${departmentId}`, this.#options);
  }

  send(departmentId: DepartmentId) {
    return this.#http.post<DeliveryReminderSent>(`${this.#baseUrl}/Send`, { departmentId }, this.#options);
  }
}
