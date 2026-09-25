import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  inject,
  signal
} from '@angular/core';
import { httpResource } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { FlexiToastService } from 'flexi-toast';
import { forkJoin, of } from 'rxjs';
import GenericModel from '../../../components/generic-model/generic-model';
import { IncomingDocumentService } from '../../services/incomingdocument';
import { DocumentAssignmentService } from '../../services/documentassignment';
import { Common } from '../../services/common';
import { IncomingDocumentModel } from '../../models/incoming-document/incoming-document.model';
import { UserModel } from '../users/users';
import { RoleService } from '../../services/role-service';
import { UPLOAD_DOCUMENT_ROLES, UploadDocumentModal } from '../../../components/upload-document-modal/upload-document-modal';
import { DocumentUploadFlow } from '../../services/document-upload-flow';

// Ön kayıt: DocumentStatusEnum.OnKayit
const ON_KAYIT_STATUS = 1;

type ListFilter = 'all' | 'mine' | 'scanned' | 'unscanned';
type SortColumn = 'qrCode' | 'createdByName' | 'createdDate';

// Listede gösterilen satır: evrak + kaydeden / atanan kullanıcı adları
interface OnKayitRow extends IncomingDocumentModel {
  // Ön kaydı yapan kullanıcı: yalnızca createdUserId (eski kayıtlarda boş olabilir)
  createdById: string | undefined;
  createdByName: string;
  createdByDepartment: string;
  createdByInitials: string;
  assignedToName: string;
  isScanned: boolean;
}

@Component({
  imports: [
    GenericModel,
    CommonModule,
    FormsModule,
    UploadDocumentModal
  ],
  templateUrl: './onkayitlar.html',
  // Kart iskeleti (st-*) Ayarlar, üst kart / arama / boş durum (sp-*) Destek,
  // istatistik kutuları / tablo / sayfalama (zl-*) Zimmetlerim ekranıyla ortak;
  // okl-* sınıfları bu ekrana özgü.
  styleUrls: ['../settings/settings.css', '../support/support.css', '../zimmetlerim/zimmetlerim.css', './onkayitlar.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Onkayitlar {
  private readonly incomingDocumentService = inject(IncomingDocumentService);
  private readonly assignmentService = inject(DocumentAssignmentService);
  private readonly toast = inject(FlexiToastService);
  private readonly common = inject(Common);
  private readonly router = inject(Router);
  private readonly roleService = inject(RoleService);
  private readonly uploadFlow = inject(DocumentUploadFlow);

  readonly user = computed(() => this.common.user());

  // Belge yükleme yalnızca yetkili rollere açıktır (bkz. UPLOAD_DOCUMENT_ROLES)
  readonly canUploadDocument = computed(() => this.roleService.hasAny(UPLOAD_DOCUMENT_ROLES));

  get currentUserId(): string | undefined {
    return this.user()?.id;
  }

  // GUID karşılaştırmaları harf duyarsız (backend kaynağına göre büyük/küçük değişebiliyor)
  isMe(id?: string | null): boolean {
    const me = this.currentUserId;
    return !!id && !!me && id.toLowerCase() === me.toLowerCase();
  }

  // Ön kayıt durumundaki tüm evraklar ve "Ön Kayıtlarım" ayrı ayrı çekilir.
  // Ön Kayıtlarım backend'de createdUserId süzgeciyle daraltılır (oluşturan
  // kullanıcı); arama, tarama süzgeci, sıralama ve sayfalama istemci tarafındadır.
  readonly documents = signal<IncomingDocumentModel[]>([]);
  readonly mineDocuments = signal<IncomingDocumentModel[]>([]);
  readonly loading = signal(false);

  // Belge numarası kopyalanan satır; ikon kısa süreliğine "check" olur
  readonly copiedId = signal<string | null>(null);
  private copiedTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Belge numarasının solundaki ikona tıklanınca numara panoya kopyalanır ve
   * metin, fareyle seçilmiş gibi vurgulanır. Pano API'si yoksa (http, eski
   * tarayıcı) seçili metin üzerinden execCommand('copy') ile kopyalanır.
   */
  copyDocNo(item: OnKayitRow, event: MouseEvent): void {
    const text = (item.qrCode ?? '').trim();
    if (!text) return;

    // Numarayı görsel olarak seç
    const host = event.currentTarget as HTMLElement | null;
    const numberEl = host?.parentElement?.querySelector('.zl-doc-no');
    if (numberEl) {
      const range = document.createRange();
      range.selectNodeContents(numberEl);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }

    const markCopied = () => {
      this.copiedId.set(item.id ?? null);
      clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copiedId.set(null), 1500);
    };

    const fallbackCopy = () => {
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      if (ok) markCopied();
      else this.toast.showToast('Hata', 'Belge numarası kopyalanamadı.', 'error');
    };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(markCopied).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
  }

  // "Kaydeden" ve "Atanan" sütunları için kullanıcı id -> kullanıcı eşlemesi.
  // Users/GetAll id'leri büyük harfli GUID, evraktaki createdUserId / currentAssignmentUserId
  // küçük harfli döndüğünden anahtarlar küçük harfe indirgenir.
  readonly usersResult = httpResource<UserModel[]>(() => 'api/Users/GetAll');
  readonly userMap = computed(() => {
    const map: Record<string, UserModel> = {};
    for (const u of this.usersResult.value() ?? []) {
      if (u.id) map[u.id.toLowerCase()] = u;
    }
    return map;
  });

  private findUser(id?: string | null): UserModel | undefined {
    return id ? this.userMap()[id.toLowerCase()] : undefined;
  }

  readonly rows = computed<OnKayitRow[]>(() => this.toRows(this.documents()));
  readonly mineRows = computed<OnKayitRow[]>(() => this.toRows(this.mineDocuments()));

  private toRows(docs: IncomingDocumentModel[]): OnKayitRow[] {
    const fullName = (id?: string | null) => {
      const u = this.findUser(id);
      return u ? `${u.name} ${u.surname}`.trim() : '';
    };

    return docs.map(doc => {
      const createdById = doc.createdUserId ?? undefined;
      const creator = this.findUser(createdById);
      return {
        ...doc,
        createdById,
        createdByName: fullName(createdById) || '-',
        createdByDepartment: creator?.departmentName ?? '',
        createdByInitials: creator
          ? `${creator.name?.[0] ?? ''}${creator.surname?.[0] ?? ''}`.toLocaleUpperCase('tr')
          : '?',
        assignedToName: fullName(doc.currentAssignmentUserId) || '',
        isScanned: !!doc.documentName
      };
    });
  }

  // Sayfa tüm ön kayıtlar listelenmiş olarak açılır
  readonly listFilter = signal<ListFilter>('all');
  readonly searchQuery = signal('');
  readonly sortColumn = signal<SortColumn | null>(null);
  readonly sortDirection = signal<'asc' | 'desc'>('asc');

  readonly filteredRows = computed(() => {
    const filter = this.listFilter();
    const query = this.searchQuery().trim().toLocaleLowerCase('tr');
    const column = this.sortColumn();
    const direction = this.sortDirection();

    const matches = (value?: string | null) => (value ?? '').toLocaleLowerCase('tr').includes(query);

    // Ön Kayıtlarım sunucudan süzülmüş ayrı listeden gelir; diğerleri tüm liste üzerinden
    const source = filter === 'mine' ? this.mineRows() : this.rows();

    const filtered = source
      .filter(row => {
        switch (filter) {
          case 'scanned': return row.isScanned;
          case 'unscanned': return !row.isScanned;
          default: return true;
        }
      })
      .filter(row => !query
        || matches(row.qrCode)
        || matches(row.orginalNo)
        || matches(row.createdByName));

    if (!column) return filtered;

    const factor = direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (column === 'createdDate') {
        const aTime = a.createdDate ? new Date(a.createdDate).getTime() : 0;
        const bTime = b.createdDate ? new Date(b.createdDate).getTime() : 0;
        return (aTime - bTime) * factor;
      }
      return (a[column] ?? '').localeCompare(b[column] ?? '', 'tr') * factor;
    });
  });

  // Varsayılan görünüm "Tümü" olduğu için yalnızca arama ya da başka bir kutu
  // seçiliyken "filtre uygulanıyor" sayılır.
  readonly isFiltering = computed(() => !!this.searchQuery().trim() || this.listFilter() !== 'all');

  readonly totalCount = computed(() => this.rows().length);
  readonly mineCount = computed(() => this.mineRows().length);
  readonly scannedCount = computed(() => this.rows().filter(r => r.isScanned).length);
  readonly unscannedCount = computed(() => this.rows().filter(r => !r.isScanned).length);

  setListFilter(filter: ListFilter): void {
    this.listFilter.set(filter);
    this.currentPage.set(1);
  }

  setSearchQuery(query: string): void {
    this.searchQuery.set(query);
    this.currentPage.set(1);
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.listFilter.set('all');
    this.currentPage.set(1);
  }

  toggleSort(column: SortColumn): void {
    if (this.sortColumn() === column) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('asc');
    }
    this.currentPage.set(1);
  }

  sortIcon(column: SortColumn): string {
    if (this.sortColumn() !== column) return 'unfold_more';
    return this.sortDirection() === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  // Sayfalama
  readonly pageSize = 10;
  readonly currentPage = signal(1);

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredRows().length / this.pageSize)));

  readonly pagedRows = computed(() => {
    const page = Math.min(this.currentPage(), this.totalPages());
    const start = (page - 1) * this.pageSize;
    return this.filteredRows().slice(start, start + this.pageSize);
  });

  readonly pageNumbers = computed(() => {
    const total = this.totalPages();
    const current = Math.min(this.currentPage(), total);
    const delta = 2;
    const from = Math.max(1, current - delta);
    const to = Math.min(total, current + delta);
    const range: number[] = [];
    for (let i = from; i <= to; i++) range.push(i);
    return range;
  });

  readonly pageRangeStart = computed(() =>
    this.filteredRows().length === 0 ? 0 : (Math.min(this.currentPage(), this.totalPages()) - 1) * this.pageSize + 1);

  readonly pageRangeEnd = computed(() =>
    Math.min(Math.min(this.currentPage(), this.totalPages()) * this.pageSize, this.filteredRows().length));

  goToPage(page: number): void {
    const clamped = Math.min(Math.max(page, 1), this.totalPages());
    if (clamped === this.currentPage()) return;
    this.currentPage.set(clamped);
  }

  constructor() {
    this.loadDocuments();
  }

  loadDocuments(): void {
    this.loading.set(true);
    this.currentPage.set(1);

    const createdUserId = this.currentUserId;
    const all$ = this.incomingDocumentService.getIncomingDocumentsByStatusCode(ON_KAYIT_STATUS);
    const mine$ = createdUserId
      ? this.incomingDocumentService.getIncomingDocumentsByStatusCode(ON_KAYIT_STATUS, { createdUserId })
      : of<IncomingDocumentModel[]>([]);

    forkJoin({ all: all$, mine: mine$ }).subscribe({
      next: ({ all, mine }) => {
        this.documents.set(all ?? []);
        this.mineDocuments.set(mine ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.documents.set([]);
        this.mineDocuments.set([]);
        this.loading.set(false);
        this.toast.showToast('Hata', 'Ön kayıt evrakları yüklenemedi.', 'error');
      }
    });
  }

  // Evrak Kayıt: Gelen Evraklar ekranındaki "İşleme Al" ile aynı akış. Evrak
  // giriş yapan kullanıcıya atanır, ardından Evrak Kayıt ekranı açılır.
  // Başka bir personele atanmış evrak için buton kapalıdır.
  isAssignedToOther(row: OnKayitRow): boolean {
    return !!row.currentAssignmentUserId && !this.isMe(row.currentAssignmentUserId);
  }

  evrakKayitTitle(row: OnKayitRow): string {
    if (!row.isScanned) return 'Belge henüz taranmadı';
    if (this.isAssignedToOther(row)) return `${row.assignedToName || 'Başka bir personel'} üzerinde işlemde`;
    return this.isMe(row.currentAssignmentUserId) ? 'İşleme Devam Et' : 'İşleme Al';
  }

  goToEvrakKayit(row: OnKayitRow): void {
    if (!row.id || !row.isScanned || this.isAssignedToOther(row)) return;
    this.assignAndOpen(row.id);
  }

  // Evrak giriş yapan kullanıcıya atanır, ardından Evrak Kayıt ekranı açılır
  private assignAndOpen(documentId: string, onError?: () => void): void {
    const currentUserId = this.currentUserId;
    if (!currentUserId) {
      this.toast.showToast('Hata', 'Kullanıcı bulunamadı', 'error');
      onError?.();
      return;
    }

    this.assignmentService.createAssignment({ documentId, userId: currentUserId }).subscribe({
      next: () => {
        this.incomingDocumentService.setSelectedIncomingDocument(documentId);
        this.incomingDocumentService.setIncomingDocumentUpdateType('1');
        this.router.navigate(['/evrakkayit']);
      },
      error: () => {
        this.toast.showToast('Hata', 'Atama oluşturulamadı', 'error');
        onError?.();
      }
    });
  }

  // ---- Belge Yükle penceresi ----
  // Henüz taranmamış evrağa tarayıcı hattı dışında dosya yüklenir; akış evrağı
  // Kayıt Tamamlandı yapıp zimmeti yükleyene devreder (DocumentUploadFlow),
  // ardından normal "İşleme Al" akışıyla Evrak Kayıt ekranına geçilir.
  // Pencere için sunucudan gelen ham evrak tutulur.
  readonly uploadDoc = signal<IncomingDocumentModel | null>(null);
  readonly uploadLoading = signal(false);

  canOfferUpload(row: OnKayitRow): boolean {
    return this.canUploadDocument() && !row.isScanned && !this.isAssignedToOther(row);
  }

  openUpload(row: OnKayitRow): void {
    if (!this.canOfferUpload(row)) return;
    const source = this.documents().find(d => d.id === row.id)
      ?? this.mineDocuments().find(d => d.id === row.id);
    if (!source) {
      this.toast.showToast('Hata', 'Evrak bilgisi bulunamadı', 'error');
      return;
    }
    this.uploadDoc.set(source);
  }

  closeUpload(): void {
    if (this.uploadLoading()) return;
    this.uploadDoc.set(null);
  }

  confirmUpload(file: File): void {
    const source = this.uploadDoc();
    if (!source?.id || this.uploadLoading()) return;

    const documentId = source.id;
    const userId = this.currentUserId;
    if (!userId) {
      this.toast.showToast('Hata', 'Kullanıcı bulunamadı', 'error');
      return;
    }

    this.uploadLoading.set(true);
    this.uploadFlow.run(documentId, file, userId).subscribe({
      next: (result) => {
        // Evrak artık Ön Kayıt durumunda değil; listelerden düşürülür
        const drop = (list: IncomingDocumentModel[]) => list.filter(d => d.id !== documentId);
        this.documents.update(drop);
        this.mineDocuments.update(drop);

        if (result.transferFailed) {
          this.toast.showToast(
            'Zimmet devri yapılamadı',
            'Belge yüklendi ve evrak kaydı oluşturuldu ancak zimmet devredilemedi. Zimmet ekranından devir yapabilirsiniz.',
            'warning'
          );
        } else {
          this.toast.showToast('Başarılı', 'Belge yüklendi, evrak kaydı oluşturuldu ve zimmet üzerinize geçti.', 'success');
        }

        this.assignAndOpen(documentId, () => this.uploadLoading.set(false));
      },
      error: () => {
        this.uploadLoading.set(false);
        this.toast.showToast('Hata', 'Belge yüklenemedi ya da evrak kaydı güncellenemedi.', 'error');
      }
    });
  }

  goToProcess(id?: string): void {
    if (!id) return;
    this.incomingDocumentService.setSelectedIncomingDocument(id);
    this.router.navigate(['/surecler']);
  }

  goToZimmet(id?: string): void {
    if (!id) return;
    this.incomingDocumentService.setZimmetIncomingDocument(id);
    this.router.navigate(['/zimmet']);
  }
}
