import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal, ViewEncapsulation } from '@angular/core';
import GenericModel from '../../../components/generic-model/generic-model';
import { Router } from '@angular/router';
import { IncomingDocumentService } from '../../services/incomingdocument';
import { CommonModule } from '@angular/common';
import { DocumentTransactionModel } from '../../models/documenttransaction.model';
import { DocumentTransaction } from '../../services/documenttransaction';
import { FlexiToastService } from 'flexi-toast';
import { SecurityDegreeLabels, SecurityDegreeBadgeClass } from '../../models/securitydegree.model';
import { actionRequiredLabel, actionRequiredBadgeClass } from '../../models/actionrequired.model';
import { DocumentTypeLabels } from '../../models/documenttype.model';
import { IncomingDocumentModel } from '../../models/incoming-document/incoming-document.model';
import { DocumentAllocation } from '../../services/documentallocation';
import { DocumentAllocationModel } from '../../models/documentallocation.model';
import { Department, DepartmentModel } from '../../services/department';
import { ExternalInstitution, ExternalInstitutionModel } from '../../services/external-institution';

// Gelen evrak durumu (backend DocumentStatusEnum) için özet şeridindeki etiket ve ton.
const DOC_STATUS: Record<number, { label: string; tone: 'info' | 'success' | 'warning' | 'neutral' }> = {
  1: { label: 'Ön Kayıt', tone: 'info' },
  2: { label: 'Kayıt Tamamlandı', tone: 'neutral' },
  3: { label: 'Yayınlandı', tone: 'success' },
  4: { label: 'Teslim Edildi', tone: 'success' },
  6: { label: 'Yayınlanma Sırasında', tone: 'warning' },
  10: { label: 'Yayınlandı', tone: 'success' },
};

type Tone = 'info' | 'success' | 'warning' | 'neutral' | 'publish';

// Sürecin kilometre taşı sayılan adımları; diğer adımlardan daha belirgin çizilir.
type Milestone = 'publish' | 'deliver' | 'archive';

// İşlem türüne göre zaman çizelgesi düğümünün ikonu ve rengi.
// 1 Ön Kayıt, 6 Zimmet, 7 Teslim, 8 OCR, 9 Birim Arşivi; diğerleri varsayılan.
const TYPE_STYLE: Record<number, { icon: string; tone: Tone }> = {
  1: { icon: 'app_registration', tone: 'info' },
  6: { icon: 'contract_edit', tone: 'info' },
  7: { icon: 'task_alt', tone: 'success' },
  8: { icon: 'document_scanner', tone: 'warning' },
  9: { icon: 'assured_workload', tone: 'neutral' },
};

// Yayınlama adımının işlem türü numarası frontend'de bilinmiyor; bu yüzden kilometre
// taşları hem bilinen tür numarasından hem de backend'in gönderdiği işlem adından
// (transactionTypeName) tanınır. Adı "yayın" içeren her işlem yayınlama sayılır.
const MILESTONE_BY_TYPE: Record<number, Milestone> = {
  7: 'deliver',
  9: 'archive',
};

const MILESTONE_BY_NAME: Array<{ pattern: RegExp; kind: Milestone }> = [
  { pattern: /yay[ıi]n/i, kind: 'publish' },
  { pattern: /teslim/i, kind: 'deliver' },
  { pattern: /ar[şs]iv/i, kind: 'archive' },
];

const MILESTONE_STYLE: Record<Milestone, { icon: string; tone: Tone }> = {
  publish: { icon: 'verified', tone: 'publish' },
  deliver: { icon: 'task_alt', tone: 'success' },
  archive: { icon: 'assured_workload', tone: 'neutral' },
};

const ZIMMET_TYPE = 6;

// Yayınlamanın hemen ardından bu süre içinde oluşan zimmet, yayınlama ile birlikte
// otomatik açılmış sayılır ve ayrı bir adım yerine yayınlamanın alt adımı olarak çizilir.
const AUTO_ZIMMET_WINDOW_MS = 5 * 60 * 1000;

// Zaman çizelgesindeki bir satır: ana işlem + ona bağlı alt işlemler.
interface TimelineStep {
  t: DocumentTransactionModel;
  children: DocumentTransactionModel[];
}

@Component({
  imports: [
    GenericModel,
    CommonModule
  ],
  templateUrl: './surecler.html',
  // Görsel dil Ön Kayıt / Zimmet ekranlarıyla aynı; ortak zm-*, ok-*, iz-*
  // sınıfları ilgili ekranların stil dosyalarından gelir.
  styleUrls: ['../gidenevrak/zimmet/zimmet.css', '../onkayit/onkayit.css', '../zimmet/zimmet.css', './surecler.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Surecler implements OnInit {
  id!: string | null;
  transactions = signal<DocumentTransactionModel[]>([]);
  documentDetail = signal<IncomingDocumentModel | null>(null);
  loading = signal(true);
  readonly #toast = inject(FlexiToastService);

  private documentService = inject(IncomingDocumentService);
  private router = inject(Router);
  private documentTransactionService = inject(DocumentTransaction);
  private allocationService = inject(DocumentAllocation);
  private departmentService = inject(Department);
  private externalInstitutionService = inject(ExternalInstitution);
  securityDegreeMap: Record<number, string> = SecurityDegreeLabels;
  securityDegreeStyle: Record<number, string> = SecurityDegreeBadgeClass;
  readonly actionRequiredLabel = actionRequiredLabel;
  readonly actionRequiredBadgeClass = actionRequiredBadgeClass;
  readonly documentTypeLabels: Record<number, string> = DocumentTypeLabels;

  // ---- Özet şeridi: evrakın güncel durumu ----
  readonly activeZimmet = signal<DocumentAllocationModel | null>(null);
  readonly departments = signal<DepartmentModel[]>([]);
  readonly externalInstitutions = signal<ExternalInstitutionModel[]>([]);

  readonly docStatus = computed(() => {
    const status = this.documentDetail()?.status;
    return (status != null && DOC_STATUS[status]) || { label: '-', tone: 'neutral' as const };
  });

  readonly departmentName = computed(() => {
    const id = this.documentDetail()?.departmentId;
    return (id && this.departments().find(d => d.id === id)?.name) || '-';
  });

  readonly externalInstitutionName = computed(() => {
    const id = this.documentDetail()?.externalInstitutionId;
    return (id && this.externalInstitutions().find(i => i.id === id)?.name) || '-';
  });

  readonly documentTypeLabel = computed(() => {
    const type = this.documentDetail()?.documentTypeId;
    return (type != null && this.documentTypeLabels[type]) || '-';
  });


  // İşlemler adımlara gruplanır: yayınlamayı kısa süre içinde izleyen zimmet
  // (otomatik zimmet) yayınlama adımının altına alınır; diğer işlemler tek başına adımdır.
  readonly steps = computed<TimelineStep[]>(() => {
    const list = this.transactions();
    const result: TimelineStep[] = [];

    for (const t of list) {
      const prev = result[result.length - 1];
      if (prev && this.isAutoZimmetOf(prev, t)) {
        prev.children.push(t);
        continue;
      }
      result.push({ t, children: [] });
    }

    return result;
  });

  private isAutoZimmetOf(step: TimelineStep, t: DocumentTransactionModel): boolean {
    if (t.transactionType !== ZIMMET_TYPE) return false;
    if (this.milestoneKind(step.t) !== 'publish') return false;
    // Yayınlama adımının altında zaten bir zimmet varsa ikinci zimmet ayrı adım olur.
    if (step.children.length) return false;
    const diff = new Date(t.createdDate).getTime() - new Date(step.t.createdDate).getTime();
    return diff >= 0 && diff <= AUTO_ZIMMET_WINDOW_MS;
  }

  ngOnInit(): void {
    this.id = this.documentService.currentIncomingDocumentId;

    if (!this.id) {
      this.router.navigate(['/scanlist']);
      return;
    }

    this.loadTransactions(this.id);
    this.getDocument(this.id);
    this.loadActiveZimmet(this.id);
    this.loadLookups();
  }

  // Özet şeridindeki "Zimmet Sahibi" çipi; aktif zimmet yoksa 404/boş dönebilir.
  private loadActiveZimmet(docId: string): void {
    this.allocationService.getActiveByDocumentId(docId).subscribe({
      next: (a) => this.activeZimmet.set(a?.isActive ? a : null),
      error: () => this.activeZimmet.set(null)
    });
  }

  // Detay satırındaki Birim ve Dış Kurum adları için id -> ad listeleri.
  private loadLookups(): void {
    this.departmentService.getDepartments().subscribe({
      next: (res) => this.departments.set(res ?? []),
      error: (err) => console.error('Birimler yüklenemedi:', err)
    });
    this.externalInstitutionService.getExternalInstitutions().subscribe({
      next: (res) => this.externalInstitutions.set(res ?? []),
      error: (err) => console.error('Dış kurumlar yüklenemedi:', err)
    });
  }

  backToList() {
    this.router.navigate(['/scanlist']);
  }

  // Adımın kilometre taşı türü; kilometre taşı değilse null.
  milestoneKind(t: DocumentTransactionModel): Milestone | null {
    const byType = MILESTONE_BY_TYPE[t.transactionType];
    if (byType) return byType;
    const name = t.transactionTypeName ?? '';
    return MILESTONE_BY_NAME.find(m => m.pattern.test(name))?.kind ?? null;
  }

  typeIcon(t: DocumentTransactionModel): string {
    const kind = this.milestoneKind(t);
    if (kind) return MILESTONE_STYLE[kind].icon;
    return TYPE_STYLE[t.transactionType]?.icon ?? 'radio_button_checked';
  }

  typeTone(t: DocumentTransactionModel): Tone {
    const kind = this.milestoneKind(t);
    if (kind) return MILESTONE_STYLE[kind].tone;
    return TYPE_STYLE[t.transactionType]?.tone ?? 'neutral';
  }

  // Kişi satırındaki küçük etiket: işlem türüne göre rolü.
  personLabel(t: DocumentTransactionModel): string {
    if (this.milestoneKind(t) === 'publish') return 'Yayınlayan';
    const type = t.transactionType;
    if (type === 1) return 'Kaydeden';
    if (type === 6) return 'Zimmet Sahibi';
    if (type === 9) return 'Arşivleyen';
    return 'Kullanıcı';
  }

  initials(fullName: string | null | undefined): string {
    const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const first = parts[0].charAt(0);
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return `${first}${last}`.toLocaleUpperCase('tr');
  }

  // İşlemler eskiden yeniye sıralanır (çizelge yukarıdan aşağı akar);
  // "Güncellendi" (3) kayıtları akışta gösterilmez.
  loadTransactions(docId: string) {
    this.loading.set(true);
    this.documentTransactionService.getTransactionsByDocumentId(docId).subscribe({
      next: (res) => {
        const list = (res ?? [])
          .filter(t => t.transactionType !== 3)
          .sort((a, b) => new Date(a.createdDate).getTime() - new Date(b.createdDate).getTime());
        this.transactions.set(list);
        this.loading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.loading.set(false);
        this.#toast.showToast('Hata', 'İşlem kayıtları getirilemedi', 'error');
      }
    });
  }

  private getDocument(documentNumber: string) {
    if (!documentNumber) {
      this.#toast.showToast('Uyarı', 'Geçersiz QR', 'warning');
      return;
    }

    this.documentService.getIncomingDocumentByDocumentId(documentNumber)
      .subscribe(doc => {
        if (!doc?.id) {
          this.#toast.showToast('Hata', 'Evrak bulunamadı', 'error');
          return;
        }

        this.documentDetail.set(doc);
      });
  }
}
