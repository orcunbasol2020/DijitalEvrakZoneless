function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Excel'in Türkçe ayarında doğrudan açılan CSV (noktalı virgül, UTF-8 BOM) */
export function downloadCsv(fileName: string, header: string[], rows: unknown[][]): void {
  const body = [header, ...rows].map(r => r.map(csvCell).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
