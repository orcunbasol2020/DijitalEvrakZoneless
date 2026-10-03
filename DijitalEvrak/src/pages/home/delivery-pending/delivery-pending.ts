import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, inject, input, signal } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { IncomingDocumentService } from '../../../services/incomingdocument';
import { Department } from '../../../services/department';
import { ExternalInstitution } from '../../../services/external-institution';
import { UserService } from '../../../services/user';
import { normalizeRoleName } from '../../../services/role-service';
import { IncomingDocumentModel } from '../../../models/incoming-document/incoming-document.model';
import { UrgencyDegreeEnum, UrgencyDegreeLabels } from '../../../models/urgencydegree.model';
import { SecurityDegreeEnum, SecurityDegreeLabels } from '../../../models/securitydegree.model';

interface ReminderPerson {
  name: string;
  email: string;
}

/** Yüksek Öncelikli Evraklar listesiyle aynı ton: critical Yıldırım, high Günlüdür, medium Çok Acele, low Acele */
type Tone = 'critical' | 'high' | 'medium' | 'low' | 'none';

const TONES: Tone[] = ['critical', 'high', 'medium', 'low', 'none'];

/** Bekleyen adedine tıklanınca açılan alt satırdaki evrak */
interface PendingDoc {
  id: string;
  documentNo: string;
  date: Date | null;
  urgency: string;
  tone: Tone;
  security: string;
  highSecurity: boolean;
  /** Gönderen kurum; bilinmiyorsa null */
  origin: string | null;
}

interface ReminderRow {
  departmentId: string;
  code: string;
  fullName: string;
  people: ReminderPerson[];
  incoming: number;
  pending: number;
  pendingDocs: PendingDoc[];
  /** Birimde bekleyen en ivedi evrakın tonu: satırın sol çizgisi */
  tone: Tone;
  /** Yıldırım, Günlüdür, Çok Acele ve Acele bekleyen evrak sayısı */
  urgent: number;
}

const HIGH_SECURITY = new Set<number>([
  SecurityDegreeEnum.Confidential,
  SecurityDegreeEnum.TopSecret,
  SecurityDegreeEnum.Crypto,
]);

// Açılan listede sıra: Yıldırım, Günlüdür, Çok Acele, Acele, sonra diğerleri; aynı ivedilikte en eski evrak önce
const URGENCY_ORDER: Record<number, number> = {
  [UrgencyDegreeEnum.Lightning]: 0,
  [UrgencyDegreeEnum.Dated]: 1,
  [UrgencyDegreeEnum.VeryUrgent]: 2,
  [UrgencyDegreeEnum.Urgent]: 3,
};

function urgencyRank(doc: IncomingDocumentModel): number {
  return URGENCY_ORDER[doc.urgencyDegree ?? 0] ?? 4;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  // Girilmemiş tarih backend'den 0001-01-01 olarak gelebilir
  return isNaN(date.getTime()) || date.getFullYear() < 1900 ? null : date;
}

type SortColumn = 'unit' | 'people' | 'incoming' | 'pending';

/** Teslim alınmayı bekleyen evrakın birimdeki muhatabı */
const BIRIM_EVRAK_SORUMLUSU = 'Birim Evrak Sorumlusu';

/**
 * Teslim Alınmayı Bekleyen Evraklar kartı: Gelen Evrak panelinde ilk birkaç birimle,
 * /teslim-bekleyenler sayfasında tüm birimlerle gösterilir.
 * Stiller (ad-head, customers-table, ad-reminder) dashboard.css ve styles.css'ten gelir.
 */
@Component({
  imports: [RouterLink, DatePipe, NgTemplateOutlet],
  standalone: true,
  selector: 'delivery-pending',
  templateUrl: './delivery-pending.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeliveryPending {
  private readonly incomingDocumentService = inject(IncomingDocumentService);
  private readonly departmentService = inject(Department);
  private readonly externalInstitutionService = inject(ExternalInstitution);
  private readonly userService = inject(UserService);

  /** Gösterilecek birim sayısı; null ise tümü */
  readonly limit = input<number | null>(null);

  /** Başlıktaki "Tümü" bağlantısı (tüm listeyi gösteren sayfada kapalı) */
  readonly showAllLink = input<boolean>(true);

  /** Sayfa başına birim sayısı; null ise sayfalama yok. limit verilmişse sayfalama yapılmaz. */
  readonly pageSize = input<number | null>(null);

  // Birime yönlendirilmiş, silinmemiş ve henüz teslim alınmamış (status 3 olmayan) evraklar.
  // Sayım Birim panelindeki "teslim bekleyen" ile aynıdır.
  private readonly allRows = signal<ReminderRow[]>([]);
  /** Arama süzgecinden geçen birim sayısı (sayfalama ve "Toplam" yazısı bunu kullanır) */
  readonly totalRows = computed(() => this.filteredRows().length);

  /** Sütun başlığına tıklayarak sıralama (alt sayfada açık; panel kartı en çok bekleyenle sabit) */
  readonly sortable = input<boolean>(false);
  readonly sortColumn = signal<SortColumn | null>(null);
  readonly sortDirection = signal<'asc' | 'desc'>('asc');

  /** Birim adına göre arama (alt sayfada açık); uzun ve kısa adda aranır */
  readonly searchable = input<boolean>(false);
  readonly searchQuery = signal('');

  setSearchQuery(query: string): void {
    this.searchQuery.set(query);
    this.currentPage.set(1);
  }

  private readonly filteredRows = computed(() => {
    const query = this.searchQuery().trim().toLocaleLowerCase('tr');
    if (!query) return this.allRows();
    return this.allRows().filter(r =>
      r.fullName.toLocaleLowerCase('tr').includes(query) || r.code.toLocaleLowerCase('tr').includes(query));
  });

  /** Sıralama seçilmemişse en çok bekleyen birim önce gelir (yükleme sırası) */
  private readonly sortedRows = computed(() => {
    const column = this.sortColumn();
    if (!column) return this.filteredRows();
    const dir = this.sortDirection() === 'asc' ? 1 : -1;
    return [...this.filteredRows()].sort((a, b) => {
      let diff: number;
      switch (column) {
        case 'unit': diff = a.fullName.localeCompare(b.fullName, 'tr'); break;
        case 'people': diff = (a.people[0]?.name ?? '').localeCompare(b.people[0]?.name ?? '', 'tr'); break;
        default: diff = a[column] - b[column];
      }
      return diff * dir || a.fullName.localeCompare(b.fullName, 'tr');
    });
  });

  toggleSort(column: SortColumn): void {
    if (this.sortColumn() === column) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumn.set(column);
      // Sayılarda ilk tıklama büyükten küçüğe: en çok evrakı olan birim önce gelsin
      this.sortDirection.set(column === 'incoming' || column === 'pending' ? 'desc' : 'asc');
    }
    this.currentPage.set(1);
  }

  sortIcon(column: SortColumn): string {
    if (this.sortColumn() !== column) return 'unfold_more';
    return this.sortDirection() === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  // Sayfalama: Birim Gelen Evrakları ekranıyla aynı yapı (zl-pager)
  readonly paged = computed(() => this.limit() == null && this.pageSize() != null);
  readonly currentPage = signal(1);
  readonly totalPages = computed(() =>
    this.paged() ? Math.max(1, Math.ceil(this.totalRows() / this.pageSize()!)) : 1);
  /** Yeniden yüklemede sayfa sayısı azalırsa son sayfaya oturur */
  readonly page = computed(() => Math.min(this.currentPage(), this.totalPages()));

  readonly rows = computed(() => {
    const limit = this.limit();
    const rows = this.sortedRows();
    if (limit != null) return rows.slice(0, limit);
    const size = this.pageSize();
    if (size == null) return rows;
    const start = (this.page() - 1) * size;
    return rows.slice(start, start + size);
  });

  readonly pageNumbers = computed(() => {
    const total = this.totalPages();
    const current = this.page();
    const delta = 2;
    const range: number[] = [];
    for (let i = Math.max(1, current - delta); i <= Math.min(total, current + delta); i++) range.push(i);
    return range;
  });

  readonly pageRangeStart = computed(() =>
    this.totalRows() === 0 ? 0 : (this.page() - 1) * (this.pageSize() ?? 0) + 1);

  readonly pageRangeEnd = computed(() =>
    Math.min(this.page() * (this.pageSize() ?? 0), this.totalRows()));

  goToPage(page: number): void {
    const clamped = Math.min(Math.max(page, 1), this.totalPages());
    if (clamped === this.currentPage()) return;
    this.currentPage.set(clamped);
  }

  /** Başlıktaki adet etiketi: kartta gösterilmeyenler dahil tüm birimlerdeki bekleyenlerin toplamı */
  readonly pendingTotal = computed(() => this.allRows().reduce((sum, r) => sum + r.pending, 0));
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly lastUpdated = signal<Date | null>(null);

  constructor() {
    this.reload();
  }

  /** Tüm evrak listesi çekildiği için periyodik yenilemeye girmez; açılışta ve yenile butonuyla alınır. */
  reload() {
    this.loading.set(true);
    this.failed.set(false);

    forkJoin({
      docs: this.incomingDocumentService.getAllIncomingDocuments(),
      departments: this.departmentService.getDepartments().pipe(catchError(() => of([]))),
      institutions: this.externalInstitutionService.getExternalInstitutions().pipe(catchError(() => of([]))),
      users: this.userService.getAll().pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ docs, departments, institutions, users }) => {
        // GUID'ler uçlara göre farklı harf büyüklüğüyle dönebildiğinden anahtarlar küçük harfe indirgenir
        const counts = new Map<string, { incoming: number; pending: IncomingDocumentModel[] }>();
        for (const d of docs ?? []) {
          if (d.isDeleted || !d.departmentId) continue;
          const key = d.departmentId.toLowerCase();
          const c = counts.get(key) ?? { incoming: 0, pending: [] };
          c.incoming++;
          if (d.status !== 3) c.pending.push(d);
          counts.set(key, c);
        }

        const people = new Map<string, ReminderPerson[]>();
        for (const u of users ?? []) {
          if (u.isDeleted || !u.isActive || !u.departmentId) continue;
          if (!(u.roles ?? []).some(r => normalizeRoleName(r.name) === BIRIM_EVRAK_SORUMLUSU)) continue;
          const key = u.departmentId.toLowerCase();
          const list = people.get(key) ?? [];
          list.push({ name: `${u.name} ${u.surname}`.trim(), email: u.email });
          people.set(key, list);
        }

        const departmentById = new Map((departments ?? []).filter(d => d.id).map(d => [d.id.toLowerCase(), d]));
        // Nereden: gönderen kurum (dış kurum ya da kurum içi birim), Yüksek Öncelikli Evraklar ile aynı çözümleme
        const placeNames = new Map<string, string>();
        for (const d of departments ?? []) if (d.id) placeNames.set(d.id.toLowerCase(), d.name);
        for (const i of institutions ?? []) if (i.id) placeNames.set(i.id.toLowerCase(), i.name);

        const rows: ReminderRow[] = [];
        for (const [key, c] of counts) {
          if (c.pending.length === 0) continue;
          const dep = departmentById.get(key);
          rows.push({
            departmentId: key,
            code: dep?.shortName?.trim() ?? '',
            fullName: dep?.name || dep?.shortName?.trim() || 'Bilinmeyen birim',
            people: (people.get(key) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'tr')),
            incoming: c.incoming,
            pending: c.pending.length,
            ...this.toPendingDocs(c.pending, placeNames),
          });
        }
        rows.sort((a, b) => b.pending - a.pending || a.fullName.localeCompare(b.fullName, 'tr'));

        this.allRows.set(rows);
        this.lastUpdated.set(new Date());
        this.loading.set(false);
      },
      error: err => {
        console.error('Teslim alınmayı bekleyen evraklar alınamadı:', err);
        this.failed.set(true);
        this.loading.set(false);
      }
    });
  }

  /** Gösterilen tarih belge tarihi (evrakın üzerindeki tarih); aynı ivedilikte en eski belge önce gelir */
  private toPendingDocs(docs: IncomingDocumentModel[], placeNames: Map<string, string>): Pick<ReminderRow, 'pendingDocs' | 'tone' | 'urgent'> {
    const sorted = [...docs].sort((a, b) => urgencyRank(a) - urgencyRank(b)
      || (toDate(a.documentDate)?.getTime() ?? 0) - (toDate(b.documentDate)?.getTime() ?? 0));
    const pendingDocs = sorted.map(d => ({
      id: d.id ?? '',
      documentNo: d.qrCode || d.orginalNo || '—',
      date: toDate(d.documentDate),
      urgency: UrgencyDegreeLabels[d.urgencyDegree as UrgencyDegreeEnum] ?? '—',
      tone: TONES[urgencyRank(d)],
      security: SecurityDegreeLabels[d.securityDegree as SecurityDegreeEnum] ?? '—',
      highSecurity: HIGH_SECURITY.has(d.securityDegree),
      origin: (d.externalInstitutionId && placeNames.get(d.externalInstitutionId.toLowerCase())) || null,
    }));
    return {
      pendingDocs,
      // Liste ivediliğe göre sıralı olduğundan ilk evrakın tonu birimin en yüksek tonudur
      tone: pendingDocs[0]?.tone ?? 'none',
      urgent: pendingDocs.filter(d => d.tone !== 'none').length,
    };
  }

  // Alt sayfanın özet kartları
  readonly unitCount = computed(() => this.allRows().length);
  readonly urgentTotal = computed(() => this.allRows().reduce((sum, r) => sum + r.urgent, 0));
  readonly unitsWithoutOwner = computed(() => this.allRows().filter(r => !r.people.length).length);

  // Bekleyen adedine tıklanınca birimin satırı altında evrak listesi açılır; aynı anda tek birim açık kalır
  readonly expandedId = signal<string | null>(null);

  toggleExpand(row: ReminderRow): void {
    this.expandedId.update(id => id === row.departmentId ? null : row.departmentId);
  }

  /** Hatırlat: birimin evrak sorumlularına e-posta taslağı açar (gönderim için backend uç noktası yok). */
  reminderMailto(row: ReminderRow): string | null {
    const emails = row.people.map(p => p.email).filter(Boolean);
    if (!emails.length) return null;
    const subject = 'Teslim alınmayı bekleyen gelen evraklar';
    const body = `Merhaba,\n\nBiriminize yönlendirilmiş ${row.pending} gelen evrak teslim alınmayı beklemektedir. `
      + `Evrakları Dijital Evrak sisteminde teslim almanızı rica ederiz.\n\nİyi çalışmalar.`;
    return `mailto:${emails.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
}
