// Bazı QR okuyucular evrak numarasındaki '/' işaretini '.' olarak gönderir
// (ör. 2026.45678923). Okunan / yazılan değer her zaman 2026/45678923
// biçimine çevrilir; ekranda bu hâliyle gösterilir ve arama bununla yapılır.
export function normalizeDocumentNo(value: string): string {
  return value.replace(/\./g, '/');
}
