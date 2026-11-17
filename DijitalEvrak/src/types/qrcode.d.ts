/** qrcode paketinin (angularx-qrcode bağımlılığı) kullanılan kısmı; paket kendi tiplerini getirmiyor. */
declare module 'qrcode' {
  export function create(
    text: string,
    options?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' }
  ): { modules: { size: number; get(row: number, col: number): number | boolean } };
}
