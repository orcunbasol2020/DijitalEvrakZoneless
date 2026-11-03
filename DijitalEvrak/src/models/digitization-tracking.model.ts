// GET api/ScannedDocuments/GetDigitizationTracking ve GetDigitizationTrackingStats yanıtları.
// Ayrıntılar: backend degisiklik_notlari/dijitallestirme_takip_frontend.md

/** Taranan belgenin taramadan Atlas'a kadar geçtiği aşamalar, sırasıyla. OCR şimdilik kapsam dışı. */
export type DigitizationStageKey = 'scanned' | 'qrRead' | 'transferred' | 'saved' | 'publishing' | 'atlasDone';

/**
 * skipped: aşama bu belge için geçerli değil (ör. elle yüklemede QR okuma).
 * warning: barkod okunamadı; hata değil, belge elle eşleştirilir. Hata yalnızca Atlas aktarımında olur.
 */
export type DigitizationStepStatus = 'completed' | 'processing' | 'error' | 'pending' | 'skipped' | 'warning';

export type DigitizationOverallStatus = 'completed' | 'processing' | 'error';

/**
 * Özet kartları ve Durum filtresi; her tarama tam bir gruba düşer.
 * pending: havuzda, evraka bağlanmamış · saved: evrak takipte, yayınlanmamış ·
 * publishing: yayınlandı, Atlas'a aktarılmayı bekliyor / aktarılıyor · published: Atlas'a aktarıldı ·
 * error: Atlas aktarımı hatalı
 */
export type DigitizationGroup = 'pending' | 'saved' | 'publishing' | 'published' | 'error';

export type DigitizationSource = 'evrak' | 'nota';

export type DigitizationSortField = 'scannedAt' | 'documentNumber' | 'documentName' | 'source' | 'status';

export interface DigitizationStep {
  status: DigitizationStepStatus;
  /** UTC, ISO ("Z" ekli); null olabilir */
  date: string | null;
  /** Okunan numara, hata mesajı, Atlas referansı vb. */
  note: string | null;
}

export interface DigitizationTrackingItem {
  scannedDocumentId: string;
  /** Tarama henüz havuzda bekliyorsa null */
  incomingDocumentId: string | null;
  documentName: string | null;
  /** Depodaki dosya adı; Taranan Belgeler havuzunda taramanın anahtarı (source ile birlikte) */
  fileName: string | null;
  /** Bağlandığı evrak no; havuzdaysa null */
  documentNumber: string | null;
  /** Barkoddan okunan numaralar; birden fazla olabilir */
  qrCodes: string[];
  subject: string | null;
  source: DigitizationSource;
  pageCount: number | null;
  /** Yalnızca Atlas aktarımı başarılıysa dolu */
  atlasReferenceNo: string | null;
  overallStatus: DigitizationOverallStatus;
  /** Tamamlanan, süren ya da hata veren en ileri aşama */
  currentStage: DigitizationStageKey;
  group: DigitizationGroup;
  /** Atlas aktarımı hatalı; AtlasTransfer/Retry ile yeniden kuyruğa alınabilir */
  canRetryAtlasTransfer: boolean;
  steps: Record<DigitizationStageKey, DigitizationStep>;
}

/** Filtrelerden bağımsız, tüm taramalar üzerinden hesaplanır; gruplar toplamı verir. */
export interface DigitizationTrackingStats {
  total: number;
  pending: number;
  saved: number;
  publishing: number;
  published: number;
  error: number;
}
