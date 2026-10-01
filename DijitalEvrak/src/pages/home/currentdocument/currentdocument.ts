import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, inject, input, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { IncomingDocumentService } from '../../../services/incomingdocument';
import { Department } from '../../../services/department';
import { ExternalInstitution } from '../../../services/external-institution';
import { IncomingDocumentModel } from '../../../models/incoming-document/incoming-document.model';
import { SecurityDegreeEnum, SecurityDegreeLabels } from '../../../models/securitydegree.model';
import { UrgencyDegreeEnum, UrgencyDegreeLabels } from '../../../models/urgencydegree.model';
import { isPublished, PublishStatusEnum, publishStatusOf } from '../../../models/publishstatus.model';
import { UserModel } from '../../users/users';

/** recent: en son kaydedilen evraklar (Gelen Evrak paneli)
 *  attention: işi bitmemiş evraklardan dikkat gerektirenler (Yönetici paneli) */
export type CurrentDocumentMode = 'recent' | 'attention';

type DocStatusKey = 'onkayit' | 'kayit' | 'ocr' | 'teslim' | 'yayinlandi';

interface DocRow {
  id: string;
  documentNo: string;
  institution: string;
  date: Date;
  idleDays: number;
  idleMinutes: number;
  lightning: boolean;
  assignee: string | null;
  /** Atlas yayın durumu (submissionStatus) */
  publish: PublishStatusEnum;
  /** Evrak akış durumu 3 = Teslim Edildi (Teslim Alındı onayıyla backend atar) */
  delivered: boolean;
  status: DocStatusKey;
  securityDegree: number;
  urgencyDegree: number | null;
  score: number;
  /** İvedilik adı ve (varsa) yüksek gizlilik derecesi */
  reason: string;
  reasonSub: string;
  /** Satırın sol çizgisi ve neden metninin rengi */
  tone: AttentionTone;
}

type AttentionTone = 'critical' | 'high' | 'medium' | 'low';

const URGENCY_TONE: Record<number, AttentionTone> = {
  [UrgencyDegreeEnum.Lightning]: 'critical',
  [UrgencyDegreeEnum.Dated]: 'high',
  [UrgencyDegreeEnum.VeryUrgent]: 'medium',
  [UrgencyDegreeEnum.Urgent]: 'low',
};

const ROW_LIMIT = 6;

/** Yıldırım dışındaki evrakta bekleme bu kadar günü geçince süre amber yazılır. */
const LATE_DAYS = 3;

/** Yıldırım evrak kısa sürede aktarılmalı: bekleme dakika / saat ile gösterilir,
 *  bu kadar saati geçince satır kırmızıyla vurgulanır. */
const LIGHTNING_LATE_HOURS = 2;

const HIGH_SECURITY = new Set<number>([
  SecurityDegreeEnum.Confidential,
  SecurityDegreeEnum.TopSecret,
  SecurityDegreeEnum.Crypto,
]);

// Dikkat listesine yalnızca bu ivedilikler girer, sıraları da budur: Yıldırım kısa sürede
// aktarılmalı (1.), Günlüdür ikinci, ardından Çok Acele ve Acele. Gizlilik yalnızca aynı
// ivedilikteki evrakları kendi arasında sıralar.
const URGENCY_WEIGHT: Record<number, number> = {
  [UrgencyDegreeEnum.Lightning]: 4000,
  [UrgencyDegreeEnum.Dated]: 3000,
  [UrgencyDegreeEnum.VeryUrgent]: 2000,
  [UrgencyDegreeEnum.Urgent]: 1000,
};
const HIGH_URGENCY = new Set<number>(Object.keys(URGENCY_WEIGHT).map(Number));

// Evrakın işi Atlas'ta yayınlanınca biter; teslim edilmiş ya da aktarımı süren evrak açıktır.
function isOpen(doc: IncomingDocumentModel): boolean {
  return !isPublished(doc);
}

/**
 * Gelen evrak kartı: Yönetici ve Gelen Evrak panellerinde ortak.
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
  private readonly incomingDocumentService = inject(IncomingDocumentService);
  private readonly departmentService = inject(Department);
  private readonly externalInstitutionService = inject(ExternalInstitution);
  private readonly router = inject(Router);

  readonly mode = input<CurrentDocumentMode>('recent');

  /** "Tümü" bağlantısının hedefi (Yönetici: evrak listesi, Gelen Evrak: evrak kayıt) */
  readonly allLink = input<string>('/documentlist');

  /** Atanan personel sütunu */
  readonly showCustodian = input<boolean>(true);

  /** Başlık altındaki açıklama satırı; Yönetici panelinde gösterilmez */
  readonly showSubtitle = input<boolean>(true);

  readonly isAttention = computed(() => this.mode() === 'attention');

  private readonly statusConfig: Record<DocStatusKey, { label: string; badgeClass: string; icon: string }> = {
    onkayit: { label: 'Ön kayıt', badgeClass: 'doc-status doc-status-onkayit', icon: 'draft' },
    kayit: { label: 'Evrak kayıtta', badgeClass: 'doc-status doc-status-kayit', icon: 'edit_document' },
    ocr: { label: 'OCR', badgeClass: 'doc-status doc-status-ocr', icon: 'document_scanner' },
    teslim: { label: 'Teslim edildi', badgeClass: 'doc-status doc-status-zimmet', icon: 'inventory_2' },
    yayinlandi: { label: 'Yayınlandı', badgeClass: 'doc-status doc-status-yayinlandi', icon: 'check_circle' },
  };

  private readonly documents = signal<IncomingDocumentModel[]>([]);
  private readonly placeNames = signal<Map<string, string>>(new Map());
  readonly loading = signal(true);
  readonly failed = signal(false);

  // Atanan personelin adı backend'den gelmezse kullanıcı listesinden çözülür
  private readonly usersResult = httpResource<UserModel[]>(() => 'api/Users/GetAll');
  private readonly userNames = computed(() => {
    const map = new Map<string, string>();
    for (const u of this.usersResult.value() ?? []) {
      if (u.id) map.set(u.id.toLowerCase(), `${u.name} ${u.surname}`.trim());
    }
    return map;
  });

  readonly rows = computed<DocRow[]>(() => {
    const now = Date.now();
    const rows = this.documents()
      .filter(doc => !doc.isDeleted && doc.id)
      .map(doc => this.toRow(doc, now));

    if (!this.isAttention()) {
      return rows.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, ROW_LIMIT);
    }

    return rows
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score || b.idleMinutes - a.idleMinutes)
      .slice(0, ROW_LIMIT);
  });

  constructor() {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.usersResult.reload();

    forkJoin({
      docs: this.incomingDocumentService.getAllIncomingDocuments(),
      departments: this.departmentService.getDepartments().pipe(catchError(() => of([]))),
      institutions: this.externalInstitutionService.getExternalInstitutions().pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ docs, departments, institutions }) => {
        const names = new Map<string, string>();
        for (const d of departments ?? []) if (d.id) names.set(d.id.toLowerCase(), d.name);
        for (const i of institutions ?? []) if (i.id) names.set(i.id.toLowerCase(), i.name);
        this.placeNames.set(names);
        this.documents.set(docs ?? []);
        this.loading.set(false);
      },
      error: err => {
        console.error('Gelen evraklar alınamadı:', err);
        this.documents.set([]);
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  private toRow(doc: IncomingDocumentModel, now: number): DocRow {
    const created = doc.createdDate ? new Date(doc.createdDate) : new Date(doc.documentDate);
    // Aşamaya giriş tarihi tutulmadığı için son hareket olarak son güncelleme alınır
    const lastMove = doc.updateDate ? new Date(doc.updateDate) : created;
    const idleMinutes = Math.max(0, Math.floor((now - lastMove.getTime()) / 60000));
    const idleDays = Math.floor(idleMinutes / 1440);
    const urgency = doc.urgencyDegree ?? null;

    // Dikkat puanı: yalnızca işi bitmemiş ve listedeki ivediliklerden birini taşıyan evraklar.
    // Önce ivedilik (binler basamağı), sonra gizlilik (50-70); eşitlikte en uzun bekleyen önde.
    const highSecurity = HIGH_SECURITY.has(doc.securityDegree);
    const listedUrgency = urgency != null && HIGH_URGENCY.has(urgency);
    let score = 0;
    if (isOpen(doc) && listedUrgency) {
      score = URGENCY_WEIGHT[urgency!] + (highSecurity ? doc.securityDegree * 10 : 0);
    }

    const reason = listedUrgency ? UrgencyDegreeLabels[urgency as UrgencyDegreeEnum] : '';
    const reasonSub = highSecurity ? SecurityDegreeLabels[doc.securityDegree as SecurityDegreeEnum] : '';
    const tone: AttentionTone = listedUrgency ? URGENCY_TONE[urgency!] : 'low';

    return {
      id: doc.id!,
      documentNo: doc.qrCode || doc.orginalNo || '-',
      institution: this.placeName(doc.externalInstitutionId),
      date: created,
      idleDays,
      idleMinutes,
      lightning: urgency === UrgencyDegreeEnum.Lightning,
      assignee: this.assigneeName(doc),
      publish: publishStatusOf(doc),
      delivered: doc.status === 3,
      status: this.statusKey(doc),
      securityDegree: doc.securityDegree,
      urgencyDegree: urgency,
      score,
      reason,
      reasonSub,
      tone,
    };
  }

  private placeName(id?: string | null): string {
    if (!id) return '-';
    return this.placeNames().get(id.toLowerCase()) ?? '-';
  }

  private assigneeName(doc: IncomingDocumentModel): string | null {
    if (doc.currentAssignmentUser) return doc.currentAssignmentUser;
    if (!doc.currentAssignmentUserId) return null;
    return this.userNames().get(doc.currentAssignmentUserId.toLowerCase()) ?? null;
  }

  private statusKey(doc: IncomingDocumentModel): DocStatusKey {
    if (isPublished(doc)) return 'yayinlandi';
    switch (doc.status) {
      case 1: return 'onkayit';
      case 3: return 'teslim';
      case 5: return 'ocr';
      default: return 'kayit';
    }
  }

  // Dikkat listesindeki Yayın sütunu: kısa etiket ve nokta rengi (yayınlanan evrak listeye girmez)
  private readonly publishConfig: Record<PublishStatusEnum, { label: string; cls: string }> = {
    [PublishStatusEnum.Yayinlanmadi]: { label: 'Yayınlanmadı', cls: 'is-idle' },
    [PublishStatusEnum.AktarimSirasinda]: { label: 'Aktarılıyor', cls: 'is-progress' },
    [PublishStatusEnum.Aktariliyor]: { label: 'Aktarılıyor', cls: 'is-progress' },
    [PublishStatusEnum.Yayinlandi]: { label: 'Yayınlandı', cls: 'is-done' },
    [PublishStatusEnum.AktarimHatali]: { label: 'Aktarım hatalı', cls: 'is-warn' },
  };

  getPublishConfig(status: PublishStatusEnum) {
    return this.publishConfig[status];
  }

  getStatusConfig(status: DocStatusKey) {
    return this.statusConfig[status];
  }

  /** Yıldırım evrakta ilk gün dakika / saat, diğerlerinde gün. */
  getIdleLabel(row: DocRow): string {
    if (row.lightning && row.idleMinutes < 1440) {
      if (row.idleMinutes < 60) return `${row.idleMinutes} dk`;
      return `${Math.floor(row.idleMinutes / 60)} sa`;
    }
    if (row.idleDays === 0) return 'Bugün';
    return `${row.idleDays} gün`;
  }

  /** Aktarım süresi aşılmış Yıldırım evrak */
  isLightningLate(row: DocRow): boolean {
    return row.lightning && row.idleMinutes >= LIGHTNING_LATE_HOURS * 60;
  }

  isLate(row: DocRow): boolean {
    return !row.lightning && row.idleDays >= LATE_DAYS;
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

  /** Yönetici: atama (işleme alma) ya da kilit kontrolü yapmadan belge detayına gider. */
  goDetail(id: string) {
    if (!this.isAttention()) return;
    this.incomingDocumentService.setSelectedIncomingDocument(id);
    this.incomingDocumentService.setIncomingDocumentUpdateType('1');
    this.router.navigate(['/evrakkayit']);
  }
}
