/** Taranan Belge API havuzundaki belge; evrak takip backend'i üzerinden gelir (api/ScannedDocuments/GetScanPool) */
export interface ScanFileModel {
  source: string;          // "evrak" | "nota"
  fileName: string;
  sizeBytes: number;
  scannedAtUtc: string;
  state: string;
  /** Barkoddan okunan evrak numaraları; [] = etiket yok/okunamadı */
  qrCodes: string[] | null;
  readAtUtc: string | null;
  error: string | null;
  sha256: string | null;
}
