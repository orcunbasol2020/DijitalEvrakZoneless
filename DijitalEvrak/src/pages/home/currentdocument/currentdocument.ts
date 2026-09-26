import { ChangeDetectionStrategy, Component, ViewEncapsulation, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FlexiToastService } from 'flexi-toast';

export interface RecentIncomingDocument {
  id: string;
  documentNo: string;
  institution: string;
  date: Date;
  custodian: string;
  status: 'zimmet' | 'onkayit' | 'ocr' | 'yayinlandi';
}

/**
 * Son Gelen Evraklar kartı: Yönetici ve Gelen Evrak panellerinde ortak.
 * Tablo stilleri (orders-table, doc-status) styles.css'ten, başlık (ad-head) dashboard.css'ten gelir.
 */
@Component({
  imports: [RouterLink],
  standalone: true,
  selector: 'app-currentdocument',
  templateUrl: './currentdocument.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Currentdocument {
  readonly #toast = inject(FlexiToastService);

  /** "Tümü" bağlantısının hedefi (Yönetici: evrak listesi, Gelen Evrak: evrak kayıt) */
  readonly allLink = input<string>('/documentlist');

  /** Zimmet (üzerindeki kişi) sütunu; Yönetici panelinde gösterilmez */
  readonly showCustodian = input<boolean>(true);

  private readonly statusConfig: Record<RecentIncomingDocument['status'], { label: string; badgeClass: string; icon: string }> = {
    zimmet: { label: 'Zimmet', badgeClass: 'doc-status doc-status-zimmet', icon: 'inventory_2' },
    onkayit: { label: 'Ön kayıt', badgeClass: 'doc-status doc-status-onkayit', icon: 'draft' },
    ocr: { label: 'OCR', badgeClass: 'doc-status doc-status-ocr', icon: 'document_scanner' },
    yayinlandi: { label: 'Yayınlandı', badgeClass: 'doc-status doc-status-yayinlandi', icon: 'check_circle' },
  };

  // Veri bağlanana kadar örnek satırlar (en yeniden eskiye)
  readonly recentDocuments = signal<RecentIncomingDocument[]>([
    { id: '1', documentNo: '2026/459763/19', institution: 'Emniyet Genel Müdürlüğü', date: new Date(2025, 10, 18, 14, 25), custodian: 'Murat Kale', status: 'zimmet' },
    { id: '2', documentNo: '2026/353646/11', institution: 'Türkiye Noterler Birliği', date: new Date(2025, 10, 17, 17, 26), custodian: 'Murat Kale', status: 'onkayit' },
    { id: '3', documentNo: '2026/561235/9', institution: 'Rusya Federasyonu, Moskova BE', date: new Date(2025, 10, 17, 12, 26), custodian: 'Bülent Arslan', status: 'zimmet' },
    { id: '4', documentNo: '2026/862442/4', institution: 'İçişleri Bakanlığı', date: new Date(2025, 10, 16, 17, 18), custodian: 'Oral Akçakoyun', status: 'ocr' },
    { id: '5', documentNo: '2026/408672/14', institution: 'Adalet Bakanlığı', date: new Date(2025, 10, 16, 17, 16), custodian: 'Bülent Arslan', status: 'yayinlandi' },
  ]);

  getStatusConfig(status: RecentIncomingDocument['status']) {
    return this.statusConfig[status];
  }

  getRelativeDateLabel(date: Date): string {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86400000);
    const time = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

    if (diffDays === 0) return `Bugün, ${time}`;
    if (diffDays === 1) return `Dün, ${time}`;
    if (diffDays > 1 && diffDays < 7) return `${diffDays} gün önce`;
    return date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  getFullDateTime(date: Date): string {
    return date.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  goDetail(id: string) {
    this.#toast.showToast('Bilgi', 'Belge Detayına Ulaşılamadı.', 'warning');
  }
}
