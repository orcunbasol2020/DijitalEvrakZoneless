import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { HttpService } from './http';
import { SKIP_ERROR_TOAST } from '../interceptors/error-interceptor';
import {
  IncomingDocumentAttachmentModel,
  IncomingDocumentAttachmentUpdateInput
} from '../models/incoming-document-attachment.model';

// Hata mesajını ekran kendisi gösterir (backend Errors / Message); genel "Sunucu Hatası" toast'ı atlanır
const skipErrorToast = () => ({ context: new HttpContext().set(SKIP_ERROR_TOAST, true) });

/**
 * Gelen evrakın elektronik ekleri (api/IncomingDocumentAttachments). GetById / GetAll cevabında
 * ekler gelmez; ekranlar listeyi GetByIncomingDocumentId'den alır.
 */
@Injectable({ providedIn: 'root' })
export class IncomingDocumentAttachmentService {
  private readonly httpService = inject(HttpService);
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'api/IncomingDocumentAttachments/';

  /** EYP sırasıyla (orderNo, sonra yüklenme zamanı); silinmiş ekler gelmez */
  getByDocument(incomingDocumentId: string, showErrorToast = true) {
    return this.httpService.get<IncomingDocumentAttachmentModel[]>(
      `${this.baseUrl}GetByIncomingDocumentId?incomingDocumentId=${encodeURIComponent(incomingDocumentId)}`,
      showErrorToast ? undefined : skipErrorToast()
    );
  }

  /** Tek istekte tek dosya; ek listenin sonuna eklenir. Backend evrakın hasAttachment alanını true yapar. */
  upload(incomingDocumentId: string, file: File, userId: string, name?: string, description?: string) {
    const formData = new FormData();
    formData.append('incomingDocumentId', incomingDocumentId);
    formData.append('file', file, file.name);
    formData.append('userId', userId);
    if (name?.trim()) formData.append('name', name.trim());
    if (description?.trim()) formData.append('description', description.trim());
    return this.httpService.post<IncomingDocumentAttachmentModel>(`${this.baseUrl}Upload`, formData, skipErrorToast());
  }

  /** Ad, açıklama ya da sıra; backend sıraları kendisi kaydırmaz */
  update(model: IncomingDocumentAttachmentUpdateInput) {
    return this.httpService.put<IncomingDocumentAttachmentModel>(`${this.baseUrl}Update`, model, skipErrorToast());
  }

  remove(id: string, userId: string) {
    return this.httpService.post<{ message: string }>(`${this.baseUrl}Remove`, { id, userId }, skipErrorToast());
  }

  /**
   * PDF blob olarak alınır. Download ileride [Authorize] olacağından iframe / a href ile doğrudan
   * adres verilmez (token gitmez); dosya her zaman HttpClient üzerinden okunur.
   */
  download(id: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}Download?id=${encodeURIComponent(id)}`, { responseType: 'blob', ...skipErrorToast() })
      .pipe(map(blob => blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' })));
  }

  /**
   * Eki yeni sekmede açar. Sekme tıklama anında açılır (dosya gelince açılırsa açılır pencere
   * engelleyicisine takılır), dosya gelince adresi blob'a çevrilir.
   */
  openInNewTab(attachment: Pick<IncomingDocumentAttachmentModel, 'id'>): Observable<void> {
    const tab = window.open('', '_blank');
    return new Observable<void>(subscriber => {
      const sub = this.download(attachment.id).subscribe({
        next: blob => {
          const url = URL.createObjectURL(blob);
          if (tab && !tab.closed) tab.location.href = url;
          else window.open(url, '_blank');
          // Sekme dosyayı yükledikten sonra adres serbest bırakılır
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
          subscriber.next();
          subscriber.complete();
        },
        error: err => {
          tab?.close();
          subscriber.error(err);
        }
      });
      return () => sub.unsubscribe();
    });
  }

  /** Dosyayı özgün adıyla indirir */
  saveToDisk(attachment: Pick<IncomingDocumentAttachmentModel, 'id' | 'originalFileName' | 'name'>): Observable<void> {
    return this.download(attachment.id).pipe(map(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.originalFileName || `${attachment.name}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }));
  }
}
