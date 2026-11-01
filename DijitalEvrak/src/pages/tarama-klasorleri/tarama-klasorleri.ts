import { ChangeDetectionStrategy, Component, ElementRef, ViewEncapsulation, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { HttpClient, HttpContext, httpResource } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { FlexiToastService } from 'flexi-toast';
import { firstValueFrom } from 'rxjs';
import GenericModel from '../../../components/generic-model/generic-model';
import { SKIP_ERROR_TOAST } from '../../interceptors/error-interceptor';
import { ScannedDocumentService, scanSourceLabel } from '../../services/scanneddocument';
import { RoleService } from '../../services/role-service';
import { PulledFile, ScanFolder, ScanFolderFile, ScanFolderState, ScanFoldersResponse } from '../../models/scan-folder.model';

/** Ağaçta bir kaynağın altındaki düğümler: paylaşımdaki dört klasör ve backend'e çekilenler */
type NodeKey = ScanFolderState | 'Pulled';

interface NodeDef {
  key: NodeKey;
  label: string;
  /** Ağaçta ve kutucukta başlığın yanında küçük yazılan ek */
  sub?: string;
  icon: string;
  /** Sağ bölmede klasörün altında görünen kısa açıklama */
  hint: string;
}

/** Klasörler backend'in döndüğü sırayla (akış gelen kutusundan havuza, oradan üstlenilene); çekilenler en sonda */
const NODES: readonly NodeDef[] = [
  { key: 'Inbox', label: 'Gelen Kutusu', icon: 'move_to_inbox', hint: 'Tarayıcıdan yeni gelen dosyalar; birkaç saniye içinde havuza geçer' },
  { key: 'Okunan', label: 'Havuz', icon: 'inventory_2', hint: 'Barkodu okunmuş, backend\'e çekilmeyi bekleyen dosyalar' },
  { key: 'Processed', label: 'Üstlenilen', icon: 'task_alt', hint: 'Backend\'e çekilerek havuzdan alınmış dosyalar' },
  { key: 'Failed', label: 'Hatalı', icon: 'report', hint: 'Okunamayan (bozuk) dosyalar; elle incelenir' },
  { key: 'Pulled', label: 'Çekilenler', sub: 'kaydı bekleyen', icon: 'pending_actions', hint: 'Backend\'e çekilmiş, henüz evraka bağlanmamış belgeler' }
];

const FOLDER_KEYS = new Set<NodeKey>(['Inbox', 'Okunan', 'Processed', 'Failed']);

/** Klasörler okunamadığında (ve hiç çekilen yokken) ağaçta gösterilecek kaynaklar */
const DEFAULT_SOURCES = ['evrak', 'nota'];

/** Gelen kutusunda bundan uzun bekleyen dosya, tarama servisinin takıldığına işaret eder */
const INBOX_STALE_MINUTES = 5;

const PAGE_SIZE = 50;

const DEFAULT_EXT = '.pdf';

/** Uzantısız dosyaların filtredeki değeri; boş metin "tümü" anlamına geldiği için ayrı tutulur */
const NO_EXT = '-';

/**
 * Çekilenlerdeki tarihler veritabanından saat dilimi eki olmadan ("2026-10-20T12:14:06") gelebiliyor;
 * tarayıcı bunu yerel saat sanmasın diye UTC olarak işaretlenir.
 */
function asUtc(iso: string): string {
  return !iso || /(Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : iso + 'Z';
}

type SortField = 'fileName' | 'sizeBytes' | 'modifiedAtUtc' | 'scannedAtUtc' | 'pulledAtUtc';

interface Selection {
  source: string;
  /** null: kaynak klasörü seçili, sağda alt klasörler görünür */
  node: NodeKey | null;
}

/**
 * Tarama klasörleri izleme ekranı: ScannedDocumentApi paylaşımındaki klasörleri dosya gezgini görünümünde
 * listeler; klasörlerde işlem yoktur. Backend'e çekilmiş, kaydı bekleyen belgeler (Çekilenler) önizlenebilir
 * ve kayıt için Taranmış Evraklar ekranında açılabilir. Liste her çağrıda paylaşımı baştan taradığı için
 * otomatik yenilenmez, Yenile ile güncellenir.
 */
@Component({
  imports: [GenericModel, DatePipe, NgTemplateOutlet],
  templateUrl: './tarama-klasorleri.html',
  styleUrls: ['../home/dashboard.css', './tarama-klasorleri.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class TaramaKlasorleri {
  readonly #router = inject(Router);
  readonly #route = inject(ActivatedRoute);
  readonly #http = inject(HttpClient);
  readonly #sanitizer = inject(DomSanitizer);
  readonly #toast = inject(FlexiToastService);
  readonly #scanService = inject(ScannedDocumentService);

  readonly nodes = NODES;
  /** Kayıt Taranmış Evraklar ekranında yapılır; o ekranın rotası yalnızca bu role açık */
  readonly canRegister = inject(RoleService).has('Gelen Evrak');

  // Hata mesajı ekranda backend'in metniyle gösterildiği için genel hata toast'ı atlanır
  readonly foldersResource = httpResource<ScanFoldersResponse>(() => ({
    url: 'api/ScannedDocuments/GetScanFolders',
    context: new HttpContext().set(SKIP_ERROR_TOAST, true)
  }));

  /** Son başarılı yanıt ve alındığı an; istek tümden hata verirse eski liste ekranda kalır */
  readonly #snapshot = signal<{ data: ScanFoldersResponse; at: Date } | null>(null);
  readonly folders = computed(() => this.#snapshot()?.data.folders ?? []);
  readonly pulled = computed(() => this.#snapshot()?.data.pulled ?? []);
  /** Tarama servisi hatası: klasörler boş gelir, çekilenler yine doludur */
  readonly foldersError = computed(() => this.#snapshot()?.data.foldersError ?? null);
  readonly lastUpdated = computed(() => this.#snapshot()?.at ?? null);

  readonly loading = computed(() => this.foldersResource.isLoading());
  /** İsteğin tümden başarısız olması (backend'in kendi hatası, 500) */
  readonly requestError = computed(() => {
    const err: any = this.foldersResource.error();
    if (!err) return null;
    const body = err.error ?? err.cause?.error;
    const message: string | undefined = body?.message ?? body?.Message;
    if (message) return message;
    if ((err.status ?? err.cause?.status) === 0) return 'Sunucuya ulaşılamıyor.';
    return 'Tarama klasörleri alınamadı.';
  });

  /** Kaynaklar yanıttaki sırayla ("evrak", "nota"); klasörler okunamazsa çekilenlerden ya da varsayılandan */
  readonly sources = computed(() => {
    const list = [...new Set([...this.folders().map(f => f.source), ...this.pulled().map(p => p.source)])];
    return list.length || !this.foldersError() ? list : DEFAULT_SOURCES;
  });

  readonly selection = signal<Selection | null>(null);
  readonly #collapsed = signal<ReadonlySet<string>>(new Set());

  readonly search = signal('');
  /** Uzantı filtresi; '' = tümü. Önizleme ve işlem yalnızca PDF için olduğundan PDF ile açılır. */
  readonly extFilter = signal(DEFAULT_EXT);
  readonly sortBy = signal<SortField>('modifiedAtUtc');
  readonly sortDir = signal<'asc' | 'desc'>('asc');
  readonly currentPage = signal(1);

  constructor() {
    const params = this.#route.snapshot.queryParamMap;
    const source = params.get('kaynak');
    if (source) {
      const node = NODES.find(n => n.key === params.get('klasor'))?.key ?? null;
      this.#select({ source, node });
    }

    effect(() => {
      if (!this.foldersResource.hasValue()) return;
      const data = this.foldersResource.value();
      if (!data) return;
      const pulled = (data.pulled ?? []).map(p => ({
        ...p,
        qrCodes: p.qrCodes ?? [],
        scannedAtUtc: asUtc(p.scannedAtUtc),
        pulledAtUtc: asUtc(p.pulledAtUtc)
      }));
      untracked(() => this.#snapshot.set({ data: { ...data, folders: data.folders ?? [], pulled }, at: new Date() }));
    });

    // İlk yüklemede (ya da seçili kaynak artık yoksa) ilk kaynak seçilir
    effect(() => {
      const sources = this.sources();
      if (!sources.length) return;
      const sel = untracked(this.selection);
      if (!sel || !sources.includes(sel.source)) untracked(() => this.#select({ source: sources[0], node: null }));
    });

    effect(() => {
      const sel = this.selection();
      const queryParams = { kaynak: sel?.source ?? null, klasor: sel?.node ?? null };
      untracked(() => this.#router.navigate([], { relativeTo: this.#route, queryParams, replaceUrl: true }));
    });
  }

  refresh(): void {
    this.foldersResource.reload();
  }

  // ---- Ağaç ----
  sourceLabel(source: string): string {
    return scanSourceLabel(source);
  }

  isFolderNode(key: NodeKey): key is ScanFolderState {
    return FOLDER_KEYS.has(key);
  }

  folderOf(source: string, key: NodeKey): ScanFolder | undefined {
    return this.folders().find(f => f.source === source && f.state === key);
  }

  pulledOf(source: string): PulledFile[] {
    return this.pulled().filter(p => p.source === source);
  }

  /** Ağaçtaki sayı; klasör okunamadıysa ya da henüz oluşmadıysa null (sayı gösterilmez) */
  nodeCount(source: string, key: NodeKey): number | null {
    if (key === 'Pulled') return this.pulledOf(source).length;
    const folder = this.folderOf(source, key);
    return folder?.exists ? folder.files.length : null;
  }

  isExpanded(source: string): boolean {
    return !this.#collapsed().has(source);
  }

  toggleExpanded(source: string, event?: Event): void {
    event?.stopPropagation();
    this.#collapsed.update(set => {
      const next = new Set(set);
      if (next.has(source)) next.delete(source); else next.add(source);
      return next;
    });
  }

  selectSource(source: string): void {
    this.#select({ source, node: null });
    if (!this.isExpanded(source)) this.toggleExpanded(source);
  }

  selectNode(source: string, node: NodeKey): void {
    this.#select({ source, node });
  }

  isSelected(source: string, node: NodeKey | null): boolean {
    const sel = this.selection();
    return !!sel && sel.source === source && sel.node === node;
  }

  #select(sel: Selection): void {
    this.selection.set(sel);
    this.search.set('');
    this.extFilter.set(DEFAULT_EXT);
    this.currentPage.set(1);
    // Çekilenler en son çekilen üstte; üstlenilen klasörü büyür ve en son alınanlar ilgi çeker: yeniden eskiye.
    // Diğer klasörlerde en uzun bekleyen dosya üstte olsun diye eskiden yeniye.
    this.sortBy.set(sel.node === 'Pulled' ? 'pulledAtUtc' : 'modifiedAtUtc');
    this.sortDir.set(sel.node === 'Processed' || sel.node === 'Pulled' ? 'desc' : 'asc');
  }

  /** Ağaçta kaynak satırındaki uyarı: hatalı dosya ya da gelen kutusunda takılı dosya varsa */
  sourceHasWarning(source: string): boolean {
    return NODES.some(n => this.nodeWarning(source, n.key) !== null);
  }

  /** 'danger': hatalı klasöründe dosya var; 'warn': gelen kutusunda uzun bekleyen dosya var */
  nodeWarning(source: string, key: NodeKey): 'danger' | 'warn' | null {
    const folder = this.folderOf(source, key);
    if (!folder?.files.length) return null;
    if (key === 'Failed') return 'danger';
    if (key === 'Inbox' && this.staleCount(folder) > 0) return 'warn';
    return null;
  }

  staleCount(folder: ScanFolder): number {
    return folder.files.filter(f => this.isStale(folder, f)).length;
  }

  isStale(folder: ScanFolder, file: ScanFolderFile): boolean {
    return folder.state === 'Inbox' && this.#ageMinutes(file.modifiedAtUtc) >= INBOX_STALE_MINUTES;
  }

  readonly staleMinutes = INBOX_STALE_MINUTES;

  // ---- Sağ bölme ----
  readonly selectedNode = computed(() => {
    const node = this.selection()?.node;
    return node ? NODES.find(n => n.key === node)! : null;
  });

  readonly isPulledView = computed(() => this.selection()?.node === 'Pulled');

  readonly selectedFolder = computed(() => {
    const sel = this.selection();
    return sel?.node && sel.node !== 'Pulled' ? this.folderOf(sel.source, sel.node) ?? null : null;
  });

  readonly selectedPulled = computed(() => {
    const sel = this.selection();
    return sel?.node === 'Pulled' ? this.pulledOf(sel.source) : [];
  });

  /** Kaynak seçiliyken sağda listelenen alt klasörler */
  readonly subNodes = computed(() => {
    const sel = this.selection();
    if (!sel || sel.node) return [];
    return NODES.map(def => ({
      def,
      folder: this.folderOf(sel.source, def.key),
      pulled: def.key === 'Pulled' ? this.pulledOf(sel.source) : []
    }));
  });

  /** Arama ve uzantı filtresinin gösterileceği durum: seçili düğümde listelenecek kayıt var */
  readonly hasRows = computed(() =>
    this.isPulledView() ? this.selectedPulled().length > 0 : !!this.selectedFolder()?.files.length);

  /** Klasördeki uzantılar ve dosya sayıları; PDF klasörde olmasa da ilk sırada, kalanlar ada göre */
  readonly extensionOptions = computed(() => {
    const counts = new Map<string, number>([[DEFAULT_EXT, 0]]);
    for (const f of this.selectedFolder()?.files ?? []) {
      const ext = f.extension || NO_EXT;
      counts.set(ext, (counts.get(ext) ?? 0) + 1);
    }
    const [pdf, ...rest] = [...counts.entries()].map(([value, count]) => ({ value, count, label: this.extLabel(value) }));
    return [pdf, ...rest.sort((a, b) => a.value.localeCompare(b.value, 'tr'))];
  });

  extLabel(ext: string): string {
    if (ext === NO_EXT) return 'Uzantısız';
    return ext === DEFAULT_EXT ? 'PDF' : ext;
  }

  readonly filteredFiles = computed(() => {
    const ext = this.extFilter();
    const q = this.#query();
    const list = (this.selectedFolder()?.files ?? []).filter(f =>
      (!ext || (f.extension || NO_EXT) === ext) &&
      (!q || f.fileName.toLocaleLowerCase('tr').includes(q)));
    const field = this.sortBy();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      const cmp = field === 'fileName'
        ? a.fileName.localeCompare(b.fileName, 'tr')
        : field === 'sizeBytes'
          ? a.sizeBytes - b.sizeBytes
          : a.modifiedAtUtc.localeCompare(b.modifiedAtUtc);
      return cmp * dir;
    });
  });

  /** Çekilenlerde arama gösterilen ad, depodaki ad ve okunan evrak numaralarında yapılır */
  readonly filteredPulled = computed(() => {
    const q = this.#query();
    const list = this.selectedPulled().filter(p => !q ||
      this.pulledName(p).toLocaleLowerCase('tr').includes(q) ||
      p.fileName.toLocaleLowerCase('tr').includes(q) ||
      p.qrCodes.some(c => c.toLocaleLowerCase('tr').includes(q)));
    const field = this.sortBy();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      const cmp = field === 'fileName'
        ? this.pulledName(a).localeCompare(this.pulledName(b), 'tr')
        : field === 'sizeBytes'
          ? a.sizeBytes - b.sizeBytes
          : field === 'scannedAtUtc'
            ? a.scannedAtUtc.localeCompare(b.scannedAtUtc)
            : a.pulledAtUtc.localeCompare(b.pulledAtUtc);
      return cmp * dir;
    });
  });

  readonly #query = computed(() => this.search().trim().toLocaleLowerCase('tr'));

  /** Seçili listede filtreden sonra kalan ve filtresiz toplam kayıt sayısı */
  readonly filteredCount = computed(() => this.isPulledView() ? this.filteredPulled().length : this.filteredFiles().length);
  readonly totalCount = computed(() => this.isPulledView() ? this.selectedPulled().length : (this.selectedFolder()?.files.length ?? 0));

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filteredCount() / PAGE_SIZE)));
  readonly page = computed(() => Math.min(this.currentPage(), this.totalPages()));
  readonly pagedFiles = computed(() => this.filteredFiles().slice(this.#pageOffset(), this.#pageOffset() + PAGE_SIZE));
  readonly pagedPulled = computed(() => this.filteredPulled().slice(this.#pageOffset(), this.#pageOffset() + PAGE_SIZE));
  readonly #pageOffset = computed(() => (this.page() - 1) * PAGE_SIZE);
  readonly pageStart = computed(() => this.filteredCount() ? this.#pageOffset() + 1 : 0);
  readonly pageEnd = computed(() => Math.min(this.page() * PAGE_SIZE, this.filteredCount()));

  readonly totalSize = computed(() => {
    const items: { sizeBytes: number }[] = this.isPulledView() ? this.selectedPulled() : (this.selectedFolder()?.files ?? []);
    return items.reduce((sum, f) => sum + f.sizeBytes, 0);
  });

  setSearch(value: string): void {
    this.search.set(value);
    this.currentPage.set(1);
  }

  setExtFilter(value: string): void {
    this.extFilter.set(value);
    this.currentPage.set(1);
  }

  sort(field: SortField): void {
    if (this.sortBy() === field) {
      this.sortDir.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortBy.set(field);
      this.sortDir.set(field === 'fileName' ? 'asc' : 'desc');
    }
    this.currentPage.set(1);
  }

  sortIcon(field: SortField): string {
    if (this.sortBy() !== field) return 'unfold_more';
    return this.sortDir() === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  goToPage(page: number): void {
    this.currentPage.set(Math.min(Math.max(1, page), this.totalPages()));
  }

  // ---- Çekilenler: önizleme ve kayıt ----
  pulledName(p: PulledFile): string {
    return p.originalFileName || p.fileName;
  }

  readonly preview = signal<{ file: PulledFile; url: SafeResourceUrl | null } | null>(null);
  /** showModal() ile üst katmanda açılır; sol menü (z-index'i yüksek) ve sayfa katmanları üstüne binemez */
  readonly previewDialog = viewChild<ElementRef<HTMLDialogElement>>('previewDialog');
  #previewObjectUrl: string | null = null;

  /**
   * PDF önce indirilir: belge bu arada kaydedildiyse servis 404 döner, iframe bunu ayırt edemez.
   * 404'te kullanıcıya bildirilir ve liste yenilenir.
   */
  async openPreview(file: PulledFile): Promise<void> {
    this.closePreview();
    this.preview.set({ file, url: null });
    this.previewDialog()?.nativeElement.showModal();
    try {
      const blob = await firstValueFrom(this.#http.get(this.#scanService.getPdfUrl(file.source, file.fileName), {
        responseType: 'blob',
        context: new HttpContext().set(SKIP_ERROR_TOAST, true)
      }));
      if (this.preview()?.file !== file) return;
      this.#previewObjectUrl = URL.createObjectURL(blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' }));
      this.preview.set({ file, url: this.#sanitizer.bypassSecurityTrustResourceUrl(this.#previewObjectUrl + '#zoom=100') });
    } catch (err: any) {
      if (this.preview()?.file !== file) return;
      this.closePreview();
      if (err?.status === 404) {
        this.#toast.showToast('Bilgi', 'Belge bu arada evraka bağlanmış; liste yenileniyor.', 'warning');
        this.refresh();
      } else {
        this.#toast.showToast('Hata', 'Belge önizlemesi açılamadı.', 'error');
      }
    }
  }

  closePreview(): void {
    if (this.#previewObjectUrl) {
      URL.revokeObjectURL(this.#previewObjectUrl);
      this.#previewObjectUrl = null;
    }
    this.preview.set(null);
    const dialog = this.previewDialog()?.nativeElement;
    if (dialog?.open) dialog.close();
  }

  /** Pencere içeriği dialog'u tamamen doldurur; dialog'un kendisine düşen tıklama arka plana yapılmıştır */
  onDialogClick(event: MouseEvent): void {
    if (event.target === this.previewDialog()?.nativeElement) this.closePreview();
  }

  /** Kayıt Taranmış Evraklar ekranındaki akışla yapılır; tarama orada tek evrak görünümünde açılır */
  register(file: PulledFile): void {
    this.closePreview();
    this.#router.navigate(['/scanneddocument'], {
      queryParams: { source: file.source, fileName: file.fileName, qrCode: file.qrCodes[0] || null }
    });
  }

  // ---- Biçimlendirme ----
  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toLocaleString('tr-TR', { maximumFractionDigits: kb < 10 ? 1 : 0 })} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`;
    return `${(mb / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} GB`;
  }

  /** Listenin alındığı ana göre geçen süre ("3 dk önce"); liste anlık görüntü olduğu için o an esas alınır */
  relativeTime(iso: string): string {
    const minutes = Math.floor(this.#ageMinutes(iso));
    if (minutes < 1) return 'az önce';
    if (minutes < 60) return `${minutes} dk önce`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} sa önce`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} gün önce`;
    const months = Math.floor(days / 30);
    return months < 12 ? `${months} ay önce` : `${Math.floor(days / 365)} yıl önce`;
  }

  isPdf(file: ScanFolderFile): boolean {
    return file.extension === '.pdf';
  }

  #ageMinutes(iso: string): number {
    const ref = this.lastUpdated()?.getTime() ?? Date.now();
    return Math.max(0, (ref - new Date(iso).getTime()) / 60000);
  }
}
