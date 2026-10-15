// Gelen evrakın elektronik eki (PDF). Ana evrak dosyasından ayrı tutulur ve Atlas'a giden
// EYP paketine orderNo sırasıyla eklenir. Fiziki ek bilgisi (hasAttachment /
// attachmentDescription) evrak formunda kalır; elektronik ekler o açıklamaya yazılmaz.
export interface IncomingDocumentAttachmentModel {
  id: string;
  incomingDocumentId: string;
  // EYP'de görünen ek adı (boş yüklenirse dosya adı, uzantısız)
  name: string;
  description?: string | null;
  orderNo: number;
  originalFileName: string;
  // Bayt
  fileSize: number;
  uploadedUserId?: string | null;
  createdDate: string;
  updateDate?: string | null;
}

// PUT Update gövdesi: gönderilmeyen (null) alan değişmez, description "" açıklamayı temizler
export interface IncomingDocumentAttachmentUpdateInput {
  id: string;
  name?: string | null;
  description?: string | null;
  orderNo?: number | null;
}

// Sunucunun kabul ettiği sınırlar (backend doğrulamasıyla aynı)
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_NAME_MAX = 250;
export const ATTACHMENT_DESCRIPTION_MAX = 500;

/** Dosya seçilirken yapılan kontrol: yalnızca PDF, boş değil, en fazla 10 MB. Hata yoksa null. */
export function attachmentFileError(file: File): string | null {
  const isPdf = file.name.toLowerCase().endsWith('.pdf') && (!file.type || file.type === 'application/pdf');
  if (!isPdf) return 'Desteklenmeyen dosya türü. Yalnızca PDF yüklenebilir.';
  if (file.size === 0) return 'Yüklenecek dosya boş olamaz!';
  if (file.size > ATTACHMENT_MAX_BYTES) return "Ek dosyası 10 MB'ı geçemez!";
  return null;
}

/** 245760 -> "240 KB", 3.4 MB -> "3,4 MB" */
export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`;
}
