import { ChangeDetectionStrategy, Component, inject, signal, ViewEncapsulation } from '@angular/core';
import { IncomingDocumentTodayStats } from '../../../models/dashboard/IncomingDocumentTodayStats.model';
import { IncomingDocumentService } from '../../../services/incomingdocument';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
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

interface ReminderPerson {
  name: string;
  ext: string;
}

interface ReminderRow {
  code: string;
  fullName: string;
  people: ReminderPerson[];
  incoming: number;
  pending: number;
  mailSent: boolean;
  loading: boolean;
}

@Component({
  imports: [
    DecimalPipe,
    DatePipe,
    CommonModule,
    RouterLink
  ],
  selector: 'app-gelen-evrak-dashboard',
  standalone: true,
  templateUrl: './gelen-evrak-dashboard.html',
  styleUrl: '../dashboard.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class GelenEvrakDashboard {
  private router = inject(Router);

  // Üst şerit
  readonly today = new Date();
  readonly lastUpdated = signal(new Date());

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
    const cards = document.querySelectorAll('.ad-stat');

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
    this.lastUpdated.set(new Date());
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

  // Teslim edilmeyi bekleyenler (veri bağlanana kadar örnek satırlar)
  readonly reminderRows: ReminderRow[] = [
    { code: 'EÇGM', fullName: 'Enerji, Çevre ve Sınıraşan Sular Genel Müdürlüğü', people: [{ name: 'Banu Gültekin', ext: '3420' }], incoming: 217, pending: 18, mailSent: false, loading: false },
    { code: 'DSGM', fullName: 'Destek Hizmetleri Genel Müdürlüğü', people: [{ name: 'Aytül Özcan', ext: '1323' }, { name: 'Zeynep Büşra Tatar', ext: '1323' }], incoming: 376, pending: 15, mailSent: true, loading: false },
    { code: 'KOGM', fullName: 'Konsolosluk Hizmetleri ve Yurtdışında Yaşayan Vatandaşlar Genel Müdürlüğü', people: [{ name: 'Didem Pekzorlu', ext: '2025' }], incoming: 450, pending: 12, mailSent: false, loading: false },
    { code: 'TPGM', fullName: 'Bilim ve Teknoloji Politikaları Genel Müdürlüğü', people: [{ name: 'Cevşen Büşra Bahçecik', ext: '1116' }], incoming: 78, pending: 9, mailSent: false, loading: false },
  ];

  sendReminder(row: ReminderRow) {
    if (row.mailSent || row.loading) return;

    row.loading = true;
    this.reminderTick.update(v => v + 1);

    // Sahte e-posta gönderim süresi
    setTimeout(() => {
      row.loading = false;
      row.mailSent = true;
      this.reminderTick.update(v => v + 1);
    }, 400);
  }

  /** Zoneless değişiklik algılama için: satır nesneleri değişince görünümü tetikler */
  readonly reminderTick = signal(0);
}