/**
 * Önceden çekme servisinin (ScanPoolImportBackgroundService) pod başına durumu.
 * Backend hesaplar: Unresponsive eşiği tur aralığının 3 katı (en az 1 dk), 10 dk'yı geçen tur da Unresponsive.
 */
export type ScanPoolInstanceState = 'Running' | 'Idle' | 'Error' | 'Unresponsive' | 'Stopped';

/** Tüm zamanlar UTC ("Z" ekli) gelir */
export interface ScanPoolImportInstance {
  instanceName: string;
  state: ScanPoolInstanceState;
  startedAtUtc: string;
  stoppedAtUtc: string | null;
  lastRunStartedAtUtc: string | null;
  lastRunFinishedAtUtc: string | null;
  lastRunSucceeded: boolean | null;
  /** Son turun Türkçe özeti; olduğu gibi gösterilir */
  lastRunMessage: string | null;
  /** Son tur hatayla kesildiyse hata metni */
  lastError: string | null;
  lastSuccessAtUtc: string | null;
  nextRunAtUtc: string | null;
  lastSeenAtUtc: string;
}

/** GET api/ScannedDocuments/GetScanPoolImportStatus */
export interface ScanPoolImportStatus {
  /** ScanApiImportEnabled; false iken turlar döner ama belge çekilmez */
  enabled: boolean;
  intervalSeconds: number;
  /** "x sn önce" hesapları tarayıcı saatiyle değil bununla yapılır */
  serverTimeUtc: string;
  /** Çalışan pod'lar üstte; bir günden eski satırlar backend'de silinir */
  instances: ScanPoolImportInstance[];
}
