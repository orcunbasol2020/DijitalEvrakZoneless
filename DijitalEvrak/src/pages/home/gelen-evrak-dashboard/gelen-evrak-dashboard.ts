import { ChangeDetectionStrategy, Component, inject, signal, ViewEncapsulation } from '@angular/core';
import { IncomingDocumentTodayStats } from '../../../models/dashboard/IncomingDocumentTodayStats.model';
import { IncomingDocumentService } from '../../../services/incomingdocument';
import { CommonModule, DecimalPipe } from '@angular/common';
import { IncomingDocumentLast30DaysStats } from '../../../models/dashboard/IncomingDocument30DaysStats.model';
import { IncomingDocumentPendingScanStats } from '../../../models/dashboard/IncomingDocumentPendingScanStats.model';
import { IncomingDocumentOcrQueueStats } from '../../../models/dashboard/IncomingDocumentOcrQueueStats.model';
import { FlexiToastService } from 'flexi-toast';
import { Router, RouterLink } from '@angular/router';

interface RecentIncomingDocument {
  id: string;
  documentNo: string;
  institution: string;
  date: Date;
  custodian: string;
  status: 'zimmet' | 'onkayit' | 'ocr' | 'yayinlandi';
}

@Component({
  imports: [
    DecimalPipe,
    CommonModule,
    RouterLink
  ],
  selector: 'app-gelen-evrak-dashboard',
  standalone: true,
  templateUrl: './gelen-evrak-dashboard.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class GelenEvrakDashboard {
  private router = inject(Router);
  statsSignal = signal<IncomingDocumentTodayStats>({ todayCount: 0, changePercent: 0 });
  last30DaysStatsSignal = signal<IncomingDocumentLast30DaysStats>({ last30DaysCount: 0, changePercent: 0 });
  readonly #toast = inject(FlexiToastService);
  private refreshInterval: any;

  constructor(private incomingDocumentService: IncomingDocumentService) { }

  ngOnInit() {
    this.loadTodayStats();
    this.loadLast30DaysStats();
    this.loadPendingScanStats();
    this.loadOcrQueueStats();

    this.refreshInterval = setInterval(() => {
      this.loadTodayStats();
      this.loadLast30DaysStats();
      this.loadPendingScanStats();
      this.loadOcrQueueStats();
    }, 30000);
  }

  ngOnDestroy() {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
  }

  isLoading = false;

  updateCard() {
    const cards = document.querySelectorAll('.stat-card');

    cards.forEach(card => {
      card.classList.add('updated');
      setTimeout(() => card.classList.remove('updated'), 500);
    });
  }

  async loadTodayStats() {
    this.isLoading = true;
    const stats = await this.incomingDocumentService.loadTodayStats();
    if (stats) this.statsSignal.set(stats);
    this.isLoading = false;
    this.updateCard();
  }

  async loadLast30DaysStats() {
    const stats = await this.incomingDocumentService.loadLast30DaysStats();
    if (stats) this.last30DaysStatsSignal.set(stats);
  }

  pendingScanStatsSignal = signal<IncomingDocumentPendingScanStats>({ pendingScanCount: 0, changePercent: 0 });

  async loadPendingScanStats() {
    const stats = await this.incomingDocumentService.loadPendingScanStats();
    if (stats) this.pendingScanStatsSignal.set(stats);
  }

  ocrQueueStatsSignal = signal<IncomingDocumentOcrQueueStats>({ ocrQueueCount: 0, changePercent: 0 });

  async loadOcrQueueStats() {
    const stats = await this.incomingDocumentService.loadOcrQueueStats();
    //console.log(stats);
    if (stats) this.ocrQueueStatsSignal.set(stats);
  }

  loadAll() {
    this.loadTodayStats();
    this.loadLast30DaysStats();
    this.loadPendingScanStats();
    this.loadOcrQueueStats();
  }

  goDetail(id: string) {
    this.#toast.showToast('Bilgi', 'Belge Detayına Ulaşılamadı.', 'warning');
  }

  goToIncoming() {
    this.router.navigate(['/evrakkayit']);
  }

  // Son Gelen Evraklar
  private readonly statusConfig: Record<RecentIncomingDocument['status'], { label: string; badgeClass: string; icon: string }> = {
    zimmet: { label: 'Zimmet', badgeClass: 'doc-status doc-status-zimmet', icon: 'inventory_2' },
    onkayit: { label: 'Ön kayıt', badgeClass: 'doc-status doc-status-onkayit', icon: 'draft' },
    ocr: { label: 'Ocr', badgeClass: 'doc-status doc-status-ocr', icon: 'document_scanner' },
    yayinlandi: { label: 'Yayınlandı', badgeClass: 'doc-status doc-status-yayinlandi', icon: 'check_circle' },
  };

  private readonly avatarPalette = ['avatar-indigo', 'avatar-teal', 'avatar-orange', 'avatar-rose', 'avatar-blue'];

  recentDocumentsSignal = signal<RecentIncomingDocument[]>([
    { id: '1', documentNo: '2026/459763/19', institution: 'Emniyet Genel Müdürlüğü', date: new Date(2025, 10, 18, 14, 25), custodian: 'Murat Kale', status: 'zimmet' },
    { id: '2', documentNo: '2026/353646/11', institution: 'Türkiye Noterler Birliği', date: new Date(2025, 10, 17, 17, 26), custodian: 'Murat Kale', status: 'onkayit' },
    { id: '3', documentNo: '2026/561235/9', institution: 'Rusya Federasyonu, Moskova BE', date: new Date(2025, 10, 17, 12, 26), custodian: 'Bülent Arslan', status: 'zimmet' },
    { id: '4', documentNo: '2026/862442/4', institution: 'İçişleri Bakanlığı', date: new Date(2025, 10, 16, 17, 18), custodian: 'Oral Akçakoyun', status: 'ocr' },
    { id: '5', documentNo: '2026/408672/14', institution: 'Adalet Bakanlığı', date: new Date(2025, 10, 16, 17, 16), custodian: 'Bülent Arslan', status: 'yayinlandi' },
  ]);

  getStatusConfig(status: RecentIncomingDocument['status']) {
    return this.statusConfig[status];
  }

  getInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  getAvatarColorClass(name: string): string {
    const sum = [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return this.avatarPalette[sum % this.avatarPalette.length];
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

row1 = { mailSent: false, loading: false };
row2 = { mailSent: true, loading: false };
row3 = { mailSent: false, loading: false };
row4 = { mailSent: false, loading: false };

sendReminder(row: any) {
  if (row.mailSent) return;

  row.loading = true;

  // fake mail gönderme süresi
  setTimeout(() => {
    row.loading = false;
    row.mailSent = true;
  }, 400); // 0.8 saniye = daha gerçekçi
}
}