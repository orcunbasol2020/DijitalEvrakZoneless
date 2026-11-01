// GET api/ScannedDocuments/GetScanFolders yanıtı: tarama paylaşımındaki klasörler ve içlerindeki dosyalar,
// ayrıca backend'e çekilmiş ama henüz evraka bağlanmamış belgeler.

export interface ScanFoldersResponse {
  /** Tarama servisine ulaşılamazsa boş gelir, neden foldersError'dadır */
  folders: ScanFolder[];
  /** Tarama servisi hatası (Türkçe, kullanıcıya gösterilebilir); bu durumda da yanıt 200 ve pulled doludur */
  foldersError: string | null;
  /** En yeni üstte */
  pulled: PulledFile[];
}

/** Backend'e çekilmiş, kaydı (evraka bağlanması) bekleyen belge; GetScanPool ile aynı kayıtlar */
export interface PulledFile {
  /** "evrak" | "nota" */
  source: string;
  /** Backend deposundaki ad; önizleme ve kayıt bu adla yapılır */
  fileName: string;
  /** Tarama servisindeki ad; eski aktarımlarda null, o zaman fileName gösterilir */
  originalFileName: string | null;
  sizeBytes: number;
  /** Barkoddan okunan evrak numaraları; [] = etiket yok/okunamadı */
  qrCodes: string[];
  scannedAtUtc: string;
  pulledAtUtc: string;
}

/** Inbox = gelen kutusu, Okunan = havuz, Processed = üstlenilen, Failed = hatalı */
export type ScanFolderState = 'Inbox' | 'Okunan' | 'Processed' | 'Failed';

export interface ScanFolder {
  /** Kaynak anahtarı, küçük harf ("evrak", "nota") */
  source: string;
  state: ScanFolderState;
  /** Köke göre göreli yol ("okunan/evrak"); ortama göre değişir, başlık için state kullanılır */
  folder: string;
  /** false: klasör henüz oluşmamış (hata değil), files boş gelir */
  exists: boolean;
  /** modifiedAtUtc'ye göre eskiden yeniye sıralı */
  files: ScanFolderFile[];
}

export interface ScanFolderFile {
  fileName: string;
  /** Noktasıyla, küçük harf (".pdf"); uzantısız dosyada boş */
  extension: string;
  sizeBytes: number;
  modifiedAtUtc: string;
}
