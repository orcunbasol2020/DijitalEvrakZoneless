/** İçerik türü başlığına güvenilmez; görüntüleyiciye yalnızca "%PDF-" ile başlayan içerik verilir */
export async function isPdfBlob(blob: Blob | null | undefined): Promise<boolean> {
  return !!blob && blob.size > 0 && (await blob.slice(0, 5).text()) === '%PDF-';
}

/** iframe'de gösterilecek object URL; sunucu türü yanlış bildirse de application/pdf olarak açılır */
export function pdfObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' }));
}
