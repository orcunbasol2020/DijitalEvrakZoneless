import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { INCOMING_STATUS_KAYIT, IncomingDocumentService } from './incomingdocument';
import { DocumentAllocation } from './documentallocation';
import { IncomingDocumentModel } from '../models/incoming-document/incoming-document.model';

export interface DocumentUploadResult {
  // Yükleme ve durum güncellemesi sonrası evrağın sunucudaki güncel hali
  document: IncomingDocumentModel;
  // Zimmet devri yapıldı mı (zaten yükleyendeyse false)
  transferred: boolean;
  // Zimmet devri denendi ama başarısız oldu (evrak yine de yüklendi ve kaydedildi)
  transferFailed: boolean;
}

/**
 * "Belge Yükle" akışı (Ön Kayıtlar, QR Okut ve Evrak Kayıt ortak):
 *   1. Dosya UploadFile ile yüklenir.
 *   2. Evrak yeniden çekilir (dosya adı sunucuda belirlenir) ve durumu Evrak
 *      Kayıt'taki "Kaydet" ile aynı olacak şekilde Kayıt Tamamlandı (2) yapılır.
 *   3. Zimmet dosyayı yükleyen kullanıcıya Devir olarak geçirilir.
 * Yükleme ya da durum güncellemesi başarısızsa akış hata verir; zimmet devri
 * başarısızlığı ise sonuçta bayrak olarak döner, evrak kaydı geri alınmaz.
 */
@Injectable({ providedIn: 'root' })
export class DocumentUploadFlow {
  private readonly incomingDocumentService = inject(IncomingDocumentService);
  private readonly allocationService = inject(DocumentAllocation);

  run(documentId: string, file: File, userId: string): Observable<DocumentUploadResult> {
    return this.incomingDocumentService.uploadFile(documentId, file, userId).pipe(
      switchMap(() => this.incomingDocumentService.getIncomingDocumentByDocumentId(documentId)),
      switchMap(fresh => {
        const registered: IncomingDocumentModel = { ...fresh, status: INCOMING_STATUS_KAYIT, userId };
        return this.incomingDocumentService.updateIncomingDocument(registered).pipe(map(() => registered));
      }),
      switchMap(document =>
        this.allocationService.transferToUser(documentId, userId).pipe(
          map(transferred => ({ document, transferred, transferFailed: false })),
          catchError(() => of({ document, transferred: false, transferFailed: true }))
        )
      )
    );
  }
}
