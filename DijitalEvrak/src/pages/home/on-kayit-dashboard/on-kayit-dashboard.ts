import { ChangeDetectionStrategy, Component, signal, ViewEncapsulation } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';

type DocStatus = 'zimmet' | 'onkayit' | 'ocr' | 'yayinlandi';

interface StatCard {
  label: string;
  value: string;
  period: string;
  trend: number;
  icon: string;
  url: string;
  hint: string;
}

interface RecentDocument {
  documentNo: string;
  institution: string;
  status: DocStatus;
  date: string;
  custodian: string;
}

interface ReminderRow {
  code: string;
  fullName: string;
  people: { name: string; ext: string }[];
  incoming: number;
  pending: number;
  mailSent: boolean;
  loading: boolean;
}

interface ActivityRow {
  icon: string;
  title: string;
  subtitle?: string;
  value: number;
  unit: string;
  chip: string;
}

@Component({
  imports: [CommonModule, DatePipe, DecimalPipe, RouterLink],
  templateUrl: './on-kayit-dashboard.html',
  styleUrl: '../dashboard.css',
  selector: 'app-on-kayit-dashboard',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class OnKayitDashboard {
  // ---- Üst şerit ----
  readonly today = new Date();
  readonly lastUpdated = signal(new Date());
  readonly refreshing = signal(false);

  /** Veriler bağlanana kadar yalnızca "son güncelleme" zamanını tazeler. */
  refresh(): void {
    if (this.refreshing()) return;
    this.refreshing.set(true);
    setTimeout(() => {
      this.lastUpdated.set(new Date());
      this.refreshing.set(false);
    }, 600);
  }

  // ---- İstatistik kartları (örnek değerler) ----
  readonly stats: StatCard[] = [
    { label: 'GELEN EVRAK', value: '24.580', period: 'Son 30 gün', trend: 12.5, icon: 'folder_open', url: '/scanlist', hint: 'Son 30 günde kaydedilen gelen evrak' },
    { label: 'OCR BEKLEYEN', value: '23', period: 'Bugün', trend: 8.3, icon: 'document_scanner', url: '/scanlist', hint: 'OCR işlemi bekleyen evraklar' },
    { label: 'KURYE İLE GELEN', value: '132', period: 'Son 30 gün', trend: 15.7, icon: 'person_pin_circle', url: '/scanlist', hint: 'Kurye ile teslim alınan evraklar' },
    { label: 'GİDEN EVRAK', value: '15.320', period: 'Son 30 gün', trend: -2.1, icon: 'outbox', url: '/gidenevrak/outgoing', hint: 'Son 30 günde kaydedilen giden evrak' },
  ];

  // ---- Son gelen evraklar (örnek) ----
  readonly statusConfig: Record<DocStatus, { label: string; badgeClass: string; icon: string }> = {
    zimmet: { label: 'Zimmet', badgeClass: 'doc-status doc-status-zimmet', icon: 'inventory_2' },
    onkayit: { label: 'Ön kayıt', badgeClass: 'doc-status doc-status-onkayit', icon: 'draft' },
    ocr: { label: 'OCR', badgeClass: 'doc-status doc-status-ocr', icon: 'document_scanner' },
    yayinlandi: { label: 'Kayıt', badgeClass: 'doc-status doc-status-yayinlandi', icon: 'check_circle' },
  };

  readonly recentDocuments: RecentDocument[] = [
    { documentNo: '2025/41851325/40472808', institution: 'Emniyet Genel Müdürlüğü', status: 'zimmet', date: '18.11.2025 14:25', custodian: 'Murat Kale' },
    { documentNo: '2025/31851350/20472800', institution: 'Türkiye Noterler Birliği', status: 'onkayit', date: '17.11.2025 17:26', custodian: 'Murat Kale' },
    { documentNo: '2025/91851329/40472809', institution: 'Rusya Federasyonu, Moskova BE', status: 'zimmet', date: '17.11.2025 12:26', custodian: 'Bülent Arslan' },
    { documentNo: '2025/48851328/40472807', institution: 'İçişleri Bakanlığı', status: 'ocr', date: '16.11.2025 17:18', custodian: 'Oral Akçakoyun' },
    { documentNo: '2025/71851325/70472804', institution: 'Adalet Bakanlığı', status: 'yayinlandi', date: '16.11.2025 17:16', custodian: 'Bülent Arslan' },
  ];

  // ---- Teslim edilmeyi bekleyenler (örnek) ----
  readonly reminderRows: ReminderRow[] = [
    { code: 'EÇGM', fullName: 'Enerji, Çevre ve Sınıraşan Sular Genel Müdürlüğü', people: [{ name: 'Banu Gültekin', ext: '3420' }], incoming: 217, pending: 18, mailSent: false, loading: false },
    { code: 'DSGM', fullName: 'Destek Hizmetleri Genel Müdürlüğü', people: [{ name: 'Aytül Özcan', ext: '1323' }, { name: 'Zeynep Büşra Tatar', ext: '1323' }], incoming: 376, pending: 15, mailSent: true, loading: false },
    { code: 'KOGM', fullName: 'Konsolosluk Hizmetleri ve Yurtdışında Yaşayan Vatandaşlar Genel Müdürlüğü', people: [{ name: 'Didem Pekzorlu', ext: '2025' }], incoming: 450, pending: 12, mailSent: false, loading: false },
    { code: 'TPGM', fullName: 'Bilim ve Teknoloji Politikaları Genel Müdürlüğü', people: [{ name: 'Cevşen Büşra Bahçecik', ext: '1116' }], incoming: 78, pending: 9, mailSent: false, loading: false },
  ];

  /** Zoneless değişiklik algılama için: satır nesneleri değişince görünümü tetikler */
  readonly reminderTick = signal(0);

  sendReminder(row: ReminderRow): void {
    if (row.mailSent || row.loading) return;
    row.loading = true;
    this.reminderTick.update(v => v + 1);
    setTimeout(() => {
      row.loading = false;
      row.mailSent = true;
      this.reminderTick.update(v => v + 1);
    }, 400);
  }

  // ---- Anlık durum (örnek) ----
  readonly activity: ActivityRow[] = [
    { icon: 'add_home', title: 'Ön Kayıt', subtitle: 'Bugün giriş yapan', value: 48, unit: 'Evrak', chip: '' },
    { icon: 'airplane_ticket', title: 'Kurye Kayıt', subtitle: 'Kurye ile gelen', value: 14, unit: 'Evrak', chip: '' },
    { icon: 'hourglass', title: 'OCR Kuyruk', value: 23, unit: 'Bekleyen', chip: 'count-chip-alert' },
    { icon: 'check_small', title: 'OCR Tamamlanan', value: 20, unit: 'Evrak', chip: 'count-chip-info' },
    { icon: 'done_all', title: 'Kaydı Tamamlanan', value: 21, unit: 'Evrak', chip: 'count-chip-success' },
    { icon: 'approval_delegation', title: 'Teslim Edilen', value: 56, unit: 'Evrak', chip: 'count-chip-success' },
  ];
}
