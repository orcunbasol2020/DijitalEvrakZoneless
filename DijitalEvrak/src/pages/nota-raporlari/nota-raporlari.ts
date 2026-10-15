import { idKey, ExternalInstitutionId, sameId, toExternalInstitutionId } from '../../models/ids';
import { ChangeDetectionStrategy, Component, ElementRef, HostListener, Injector, ViewEncapsulation, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, catchError, forkJoin, of } from 'rxjs';
import GenericModel from '../../../components/generic-model/generic-model';
import { ReportChart } from '../reports/report-chart';
import { downloadCsv } from '../reports/report-csv';
import {
  NotaDateField,
  NotaDepartmentCount,
  NotaReportService,
  NotaSummary,
  notaErrorMessage
} from '../../services/nota-report';
import { countryOfMission } from '../map-world/mission-countries';
import { ExternalInstitution, ExternalInstitutionType } from '../../services/external-institution';

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const MONTHS_LONG = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const SUGGESTION_LIMIT = 8;
const POPULAR_LIMIT = 15;
const UNKNOWN_DEPARTMENT = 'Bilinmeyen birim';
/** Süzgeç panelinin açık / kapalı tercihi (yalnızca bu tarayıcıda) */
const FILTERS_OPEN_KEY = 'nota-raporlari.filtersOpen';

/** Misyon seçicideki kayıt (GetNotaSenders) */
interface MissionOption {
  id: ExternalInstitutionId;
  name: string;
  country: string | null;
  notaCount: number;
  search: string;
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

const lower = (s: string | null | undefined) => (s ?? '').toLocaleLowerCase('tr');

function readFiltersOpen(): boolean {
  try {
    return localStorage.getItem(FILTERS_OPEN_KEY) !== '0';
  } catch {
    return true; // localStorage kapalıysa varsayılan: açık
  }
}

/**
 * Nota Raporları: önce bir yabancı misyon seçilir, sonra o misyonun hangi birime kaç nota
 * gönderdiği gösterilir. Sayımlar sunucuda yapılır
 * (GetNotaSummary); ekran tek tek evrak göstermez, yalnızca toplamları gösterir.
 */
@Component({
  imports: [GenericModel, ReportChart, DatePipe, NgTemplateOutlet],
  templateUrl: './nota-raporlari.html',
  // Raporlar sayfasıyla aynı görsel dil (home/dashboard.css + reports.css); burada yalnızca nr- ekleri
  styleUrls: ['../home/dashboard.css', '../reports/reports.css', './nota-raporlari.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class NotaRaporlari {
  private readonly reportService = inject(NotaReportService);
  private readonly institutionService = inject(ExternalInstitution);
  // GetNotaSenders / GetNotaSummary adı boş dönerse dış kurum listesinden tamamlanır
  private institutionNames = new Map<string, string>();
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  readonly monthsLong = MONTHS_LONG;

  // ---- Süzgeç paneli ----
  // Misyon seçilmemişken panel her zaman açıktır (arama kutusu orada); seçildikten sonra kapatılabilir
  readonly filtersOpen = signal(readFiltersOpen());
  readonly filtersVisible = computed(() => this.filtersOpen() || !this.selected());

  toggleFilters(): void {
    this.setFiltersOpen(!this.filtersOpen());
  }

  /** Üst şeritteki "Misyon Değiştir": paneli açar, arama kutusuna odaklanır */
  changeMission(): void {
    this.setFiltersOpen(true);
    afterNextRender(() => {
      const input = this.searchInput()?.nativeElement;
      input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      input?.focus({ preventScroll: true });
    }, { injector: this.injector });
  }

  private setFiltersOpen(open: boolean): void {
    this.filtersOpen.set(open);
    try {
      localStorage.setItem(FILTERS_OPEN_KEY, open ? '1' : '0');
    } catch { /* localStorage kapalıysa tercih kaydedilmez */ }
  }

  // ---- Misyon seçici (GetNotaSenders) ----
  readonly missions = signal<MissionOption[]>([]);
  readonly missionsState = signal<LoadState>('loading');
  readonly query = signal('');
  readonly pickerOpen = signal(false);
  readonly activeIndex = signal(0);

  readonly suggestions = computed(() => {
    const terms = lower(this.query().trim()).split(/\s+/).filter(Boolean);
    const list = terms.length
      ? this.missions().filter(m => terms.every(t => m.search.includes(t)))
      : this.missions();
    return list.slice(0, SUGGESTION_LIMIT);
  });

  readonly popular = computed(() =>
    this.missions().filter(m => m.notaCount > 0).slice(0, POPULAR_LIMIT));

  // ---- Seçili misyon ve dönem ----
  readonly selected = signal<{ id: ExternalInstitutionId; name: string } | null>(null);
  readonly year = signal<number | null>(null);
  readonly month = signal<number | null>(null);
  readonly dateField = signal<NotaDateField>('created');

  readonly summary = signal<NotaSummary | null>(null);
  readonly summaryState = signal<LoadState>('idle');
  // Yıl düğmeleri özetle gelir; dönem değişip özet yeniden yüklenirken kaybolmasın diye ayrı tutulur
  readonly years = signal<{ year: number; notaCount: number }[]>([]);
  private summarySub?: Subscription;

  readonly selectedCountry = computed(() => {
    const s = this.selected();
    return s ? countryOfMission(s.name)?.label ?? null : null;
  });

  /** Üst şeritteki rozet: ülkenin (yoksa misyon adının) ilk iki harfi */
  readonly selectedInitials = computed(() => {
    const words = (this.selectedCountry() || this.selected()?.name || '').trim().split(/s+/).filter(Boolean);
    const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '').slice(0, 2);
    return letters.toLocaleUpperCase('tr') || '?';
  });

  readonly dateFieldLabel = computed(() => this.dateField() === 'created' ? 'Kayıt tarihine göre' : 'Belge tarihine göre');

  readonly periodLabel = computed(() => {
    const y = this.year();
    const m = this.month();
    if (y == null) return m == null ? 'Tüm zamanlar' : `Tüm yılların ${MONTHS_LONG[m - 1]} ayları`;
    return m == null ? `${y}` : `${MONTHS_LONG[m - 1]} ${y}`;
  });

  readonly departments = computed(() => this.summary()?.departments ?? []);
  readonly maxDepartmentCount = computed(() => Math.max(1, ...this.departments().map(d => d.notaCount)));

  readonly monthOption = computed(() => {
    const months = this.summary()?.months ?? [];
    const showYear = this.year() == null;
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { top: 16, left: 4, right: 4, bottom: 0, containLabel: true },
      xAxis: {
        type: 'category', axisTick: { show: false },
        data: months.map(m => showYear ? `${MONTHS[m.month - 1]} ${String(m.year).slice(2)}` : MONTHS[m.month - 1]),
      },
      yAxis: { type: 'value', minInterval: 1, splitNumber: 3 },
      series: [{
        name: 'Nota', type: 'bar', barMaxWidth: 18, data: months.map(m => m.notaCount),
        itemStyle: { color: '#0369a1', borderRadius: [5, 5, 0, 0] },
        label: { show: true, position: 'top', fontSize: 10, formatter: (p: any) => p.value || '' },
      }],
    };
  });

  constructor() {
    this.loadMissions();
    const id = toExternalInstitutionId(this.route.snapshot.queryParamMap.get('misyon'));
    if (id !== null) this.select({ id, name: '' }, false);
  }

  // ---- Misyon listesi: nota gönderenler, nota sayısına göre azalan (GetNotaSenders) ----
  loadMissions(): void {
    this.missionsState.set('loading');
    forkJoin({
      senders: this.reportService.getSenders(),
      // Seçicide nota göndermemiş misyonlar da yer alır; alınamazsa yalnızca nota gönderenler listelenir
      institutions: this.institutionService.getMissions().pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ senders, institutions }) => {
        const all = (institutions ?? []).filter(i => i?.id);
        this.institutionNames = new Map(all.map(i => [idKey(i.id)!, i.name]));
        const options = new Map<string, MissionOption>();
        for (const s of senders ?? []) {
          options.set(idKey(s.externalInstitutionId)!,
            this.toOption(s.externalInstitutionId, this.nameOf(s.externalInstitutionId, s.name), s.notaCount));
        }
        for (const i of all) {
          if (i.type === ExternalInstitutionType.Misyon && !options.has(idKey(i.id)!)) options.set(idKey(i.id)!, this.toOption(i.id, i.name ?? '', 0));
        }
        // Nota sayısına göre azalan, eşitlikte ada göre
        this.setMissions([...options.values()].sort((a, b) => b.notaCount - a.notaCount || a.name.localeCompare(b.name, 'tr')));
      },
      error: (err) => {
        console.error('Nota gönderenler alınamadı:', err);
        this.missionsState.set('error');
      }
    });
  }

  private nameOf(id: ExternalInstitutionId | null | undefined, name: string | null | undefined): string {
    return name?.trim() || (id && this.institutionNames.get(idKey(id)!)) || '';
  }

  private toOption(id: ExternalInstitutionId, name: string, notaCount: number): MissionOption {
    const country = countryOfMission(name)?.label ?? null;
    return { id, name, country, notaCount, search: lower(`${name} ${country ?? ''}`) };
  }

  private setMissions(list: MissionOption[]): void {
    this.missions.set(list);
    this.missionsState.set('ready');
    // Adresten gelen misyonun adı listeden tamamlanır (özet gelmeden başlıkta görünsün)
    const s = this.selected();
    if (s && !s.name) {
      const found = list.find(m => sameId(m.id, s.id));
      if (found) this.selected.set({ id: s.id, name: found.name });
    }
  }

  // ---- Arama kutusu ----
  onQuery(value: string): void {
    this.query.set(value);
    this.activeIndex.set(0);
    this.pickerOpen.set(true);
  }

  onKeydown(event: KeyboardEvent): void {
    const list = this.suggestions();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.pickerOpen.set(true);
      this.activeIndex.update(i => Math.min(list.length - 1, i + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex.update(i => Math.max(0, i - 1));
    } else if (event.key === 'Enter') {
      const m = list[this.activeIndex()];
      if (m && this.pickerOpen()) {
        event.preventDefault();
        this.pick(m);
      }
    } else if (event.key === 'Escape') {
      this.pickerOpen.set(false);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const picker = this.host.nativeElement.querySelector('.nr-picker');
    if (picker && !picker.contains(event.target as Node)) this.pickerOpen.set(false);
  }

  pick(m: MissionOption): void {
    this.query.set('');
    this.pickerOpen.set(false);
    this.select({ id: m.id, name: m.name });
  }

  // ---- Seçim ----
  select(mission: { id: ExternalInstitutionId; name: string }, updateUrl = true): void {
    this.selected.set(mission);
    this.years.set([]);
    this.year.set(null);
    this.month.set(null);
    if (updateUrl) {
      this.router.navigate([], { relativeTo: this.route, queryParams: { misyon: mission.id }, replaceUrl: true });
    }
    this.loadSummary();
  }

  clearSelection(): void {
    this.summarySub?.unsubscribe();
    this.selected.set(null);
    this.summary.set(null);
    this.summaryState.set('idle');
    this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }

  setYear(year: number | null): void {
    if (this.year() === year) return;
    this.year.set(year);
    if (year == null) this.month.set(null);
    this.loadSummary();
  }

  setMonth(value: string): void {
    this.month.set(value === '' ? null : Number(value));
    this.loadSummary();
  }

  setDateField(field: NotaDateField): void {
    if (this.dateField() === field) return;
    this.dateField.set(field);
    this.loadSummary();
  }

  private period() {
    return { year: this.year(), month: this.month(), dateField: this.dateField() };
  }

  loadSummary(): void {
    const s = this.selected();
    if (!s) return;
    this.summarySub?.unsubscribe();
    this.summaryState.set('loading');
    this.summarySub = this.reportService.getSummary(s.id, this.period()).subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.years.set(summary?.years ?? []);
        this.summaryState.set('ready');
        const name = this.nameOf(s.id, summary?.name);
        if (name && name !== s.name) this.selected.set({ id: s.id, name });
      },
      error: (err) => {
        console.error('Nota özeti alınamadı:', err);
        this.summary.set(null);
        // Ör. adresteki misyon silinmişse "Dış kurum bulunamadı."
        this.summaryError.set(notaErrorMessage(err, 'Nota özeti alınamadı.'));
        this.summaryState.set('error');
      }
    });
  }

  readonly summaryError = signal('');

  // ---- Birim notaları ----
  barWidth(d: NotaDepartmentCount): number {
    return Math.max(4, Math.round((d.notaCount / this.maxDepartmentCount()) * 100));
  }

  fullName(d: NotaDepartmentCount): string {
    return d.departmentName?.trim() || UNKNOWN_DEPARTMENT;
  }

  shortName(d: NotaDepartmentCount): string {
    return d.departmentShortName?.trim() || this.fullName(d);
  }

  exportDepartments(): void {
    const s = this.summary();
    if (!s) return;
    downloadCsv(`${s.name} - Birimlere Göre Nota (${this.periodLabel()}).csv`,
      ['Birim', 'Kısa Ad', 'Nota', 'Gereği', 'Bilgi'],
      s.departments.map(d => [this.fullName(d), d.departmentShortName ?? '', d.notaCount, d.geregiCount, d.bilgiCount]));
  }
}
