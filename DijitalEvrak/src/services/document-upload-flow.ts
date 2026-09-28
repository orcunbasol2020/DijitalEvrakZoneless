import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, switchMap, throwError } from 'rxjs';
import { IncomingDocumentService } from './incomingdocument';
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
 *   1. Dosya UploadFile ile yüklenir. Backend bu adımda dosya alanlarını
 *      (ElectronicCopy, DocumentName) yazar, durumu Kayıt Tamamlandı (2) yapar
 *      ve hareket (transaction) kaydını kendisi düşer; bu yüzden frontend
 *      ayrıca Update çağırmaz (eskiden çağrılıyordu ve çift transaction üretiyordu).
 *   2. Evrak yeniden çekilir; ekran güncel dosya adını ve durumu buradan alır.
 *   3. Zimmet dosyayı yükleyen kullanıcıya Devir olarak geçirilir.
 * Yükleme ya da yeniden çekme başarısızsa akış hata verir; zimmet devri
 * başarısızlığı ise sonuçta bayrak olarak döner, evrak kaydı geri alınmaz.
 */
@Injectable({ providedIn: 'root' })
export class DocumentUploadFlow {
  private readonly incomingDocumentService = inject(IncomingDocumentService);
  private readonly allocationService = inject(DocumentAllocation);

  run(documentId: string, file: File, userId: string): Observable<DocumentUploadResult> {
    return this.incomingDocumentService.uploadFile(documentId, file, userId).pipe(
      switchMap(() => this.incomingDocumentService.getIncomingDocumentByDocumentId(documentId)),
      switchMap((document: IncomingDocumentModel) =>
        this.allocationService.transferToUser(documentId, userId).pipe(
          map(transferred => ({ document, transferred, transferFailed: false })),
          catchError(() => of({ document, transferred: false, transferFailed: true }))
        )
      )
    );
  }

  /**
   * "Evrak Yükle" (evrak numarası + PDF; Gelen Evraklar ve Yönetici listesi ortak):
   * UploadWithDocumentNumber numaraya ait evrak varsa dosyayı ona bağlar, yoksa yeni
   * gelen evrak oluşturur; durum ve zimmeti backend verir. Yanıtta Id dönmediği için
   * evrak numarayla yeniden çekilir (çekilemezse null).
   * Numaraya bağlı evrakta zaten dosya varsa istek gönderilmez: backend bu durumda 500
   * döner ve genel hata interceptor'ı yanıltıcı "Sunucu Hatası" gösterir.
   * Hata, kullanıcıya gösterilecek metni `userMessage` ile taşır; boşsa mesajı
   * interceptor zaten göstermiştir.
   */
  runWithDocumentNumber(qrCode: string, file: File, userId: string): Observable<IncomingDocumentModel | null> {
    return this.incomingDocumentService.GetByQrCode(qrCode).pipe(
      // Numaraya ait evrak yoksa (404) numara boştadır
      catchError(() => of(null)),
      switchMap((existing: IncomingDocumentModel | null) => existing?.documentName
        ? throwError(() => uploadError(`${qrCode} numaralı evraka daha önce bir dosya bağlanmış.`))
        : this.incomingDocumentService.uploadWithDocumentNumber(qrCode, file, userId).pipe(
          // Doğrulama hatasında gövde { StatusCode: 403, Errors: [alan adları] } gelir
          catchError(err => throwError(() => uploadError(validationMessage(err?.error?.Errors))))
        )),
      switchMap(() => this.incomingDocumentService.GetByQrCode(qrCode).pipe(catchError(() => of(null))))
    );
  }
}

export type DocumentNumberUploadError = Error & { userMessage: string };

function uploadError(userMessage: string): DocumentNumberUploadError {
  return Object.assign(new Error(userMessage || 'upload'), { userMessage });
}

function validationMessage(fields: string[] | undefined): string {
  if (!fields?.length) return '';
  if (fields.includes('DocumentNumber')) return 'Evrak numarası boş olamaz.';
  if (fields.includes('FileName') || fields.includes('FileContent')) return 'Yalnızca 20 MB\'ı geçmeyen PDF dosyası yüklenebilir.';
  if (fields.includes('UserId')) return 'Kullanıcı bilgisi bulunamadı.';
  return 'Evrak bilgileri geçersiz.';
}
