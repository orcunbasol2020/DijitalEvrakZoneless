import { ChangeDetectionStrategy, Component, HostListener, ViewEncapsulation, computed, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
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
import { DocumentAssignmentService } from '../../../services/documentassignment';
import { Common } from '../../../services/common';
import { FlexiToastService } from 'flexi-toast';

/** recent: en son kaydedilen evraklar (Gelen Evrak paneli)
 *  attention: işi bitmemiş evraklardan dikkat gerektirenler (Yönetici paneli) */
export type CurrentDocumentMode = 'recent' | 'attention';

export type AttentionRowAction = 'detail' | 'process';

/** Ön kayıt / kayıt aşamaları (1, 2, 4): bu evraklarda İşleme Al kilidi geçerli */
const IN_REGISTRATION = new Set<number>([1, 2, 4]);

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
  assigneeId: string | null;
  /** Gönderen kurum ve evrakın gideceği birim (Nereden / Nereye); yoksa null */
  origin: string | null;
  /** Merkez birim kısa adıyla (shortName) gösterilir; tam adı destinationFull'da */
  destination: string | null;
  destinationFull: string | null;
  /** Evrakın üzerindeki belge tarihi; girilmemişse null */
  documentDate: Date | null;
  /** Belge taranmış (dosyası var) */
  scanned: boolean;
  /** Ham akış durumu (İşleme Al kilidi için) */
  docStatus: number;
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

/** Yönetici kartında gösterilen yüksek öncelikli evrak sayısı; fazlası "Tümünü gör" popup'ında. */
const ATTENTION_CARD_LIMIT = 5;

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

// Evrakın işi hem Atlas'ta yayınlanınca hem de teslim alınınca (status 3) biter;
// ikisinden biri eksikse evrak açıktır ve listede kalır.
function isOpen(doc: IncomingDocumentModel): boolean {
  return !(isPublished(doc) && doc.status === 3);
}

/**
 * Gelen evrak kartı: Yönetici ve Gelen Evrak panellerinde ortak.
 * Tablo stilleri (orders-table, doc-status) styles.css'ten, başlık (ad-head) dashboard.css'ten gelir.
 */
@Component({
  imports: [RouterLink, NgTemplateOutlet],
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
  private readonly assignmentService = inject(DocumentAssignmentService);
  private readonly common = inject(Common);
  private readonly toast = inject(FlexiToastService);

  readonly mode = input<CurrentDocumentMode>('recent');

  /** "Tümü" bağlantısının hedefi (Yönetici: evrak listesi, Gelen Evrak: evrak kayıt) */
  readonly allLink = input<string>('/documentlist');

  /** Atanan personel sütunu */
  readonly showCustodian = input<boolean>(true);

  /** Başlık altındaki açıklama satırı; Yönetici panelinde gösterilmez */
  readonly showSubtitle = input<boolean>(true);

  /** Dikkat listesinde satıra tıklayınca ne olacağı.
   *  detail: kilitsiz belge detayı (Yönetici), process: Gelen Evraklar'daki İşleme Al akışı (evrak kayıt personeli) */
  readonly rowAction = input<AttentionRowAction>('detail');

  /** Evrak hücresinde Nereden (gönderen kurum) / Nereye (birim) satırı; evrak kayıt panelinde açık */
  readonly showRoute = input<boolean>(false);

  /** İşleme Al akışında satırın açılışı sürüyor (çift tıklamada ikinci atama gitmesin) */
  readonly processingId = signal<string | null>(null);

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
  /** Merkez birimlerin kısa adları (shortName); boşsa tam ada düşülür */
  private readonly departmentShortNames = signal<Map<string, string>>(new Map());
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

  private readonly allRows = computed<DocRow[]>(() => {
    const now = Date.now();
    return this.documents()
      .filter(doc => !doc.isDeleted && doc.id)
      .map(doc => this.toRow(doc, now));
  });

  /** Yüksek öncelikli evrakların tamamı (popup'ta listelenir) */
  readonly attentionRows = computed<DocRow[]>(() =>
    this.allRows()
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score || b.idleMinutes - a.idleMinutes)
  );

  /** Kartta gösterilen satırlar */
  readonly rows = computed<DocRow[]>(() => {
    if (this.isAttention()) return this.attentionRows().slice(0, ATTENTION_CARD_LIMIT);
    return [...this.allRows()].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, ROW_LIMIT);
  });

  readonly hasMore = computed(() => this.attentionRows().length > ATTENTION_CARD_LIMIT);

  readonly allOpen = signal(false);

  openAll(): void {
    this.allOpen.set(true);
  }

  closeAll(): void {
    this.allOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.allOpen()) this.closeAll();
  }

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
        const shortNames = new Map<string, string>();
        for (const d of departments ?? []) {
          if (!d.id) continue;
          names.set(d.id.toLowerCase(), d.name);
          shortNames.set(d.id.toLowerCase(), d.shortName?.trim() || d.name);
        }
        for (const i of institutions ?? []) if (i.id) names.set(i.id.toLowerCase(), i.name);
        this.placeNames.set(names);
        this.departmentShortNames.set(shortNames);
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
      assigneeId: doc.currentAssignmentUserId || null,
      origin: this.placeNameOrNull(doc.externalInstitutionId),
      destination: doc.departmentId
        ? this.departmentShortNames().get(doc.departmentId.toLowerCase()) ?? null
        : null,
      destinationFull: this.placeNameOrNull(doc.departmentId),
      documentDate: this.validDate(doc.documentDate),
      scanned: !!doc.documentName,
      docStatus: doc.status,
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
    return this.placeNameOrNull(id) ?? '-';
  }

  // Girilmemiş tarih boş ya da varsayılan (0001-01-01) gelebilir
  private validDate(value?: string | null): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return isNaN(date.getTime()) || date.getFullYear() < 1900 ? null : date;
  }

  getShortDate(date: Date): string {
    return date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  private placeNameOrNull(id?: string | null): string | null {
    if (!id) return null;
    return this.placeNames().get(id.toLowerCase()) ?? null;
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

  // Dikkat listesindeki Yayın sütunu: kısa etiket ve nokta rengi (yayınlanmış ama teslim alınmamış evrak listede kalır)
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

  // GUID karşılaştırmaları harf duyarsız (backend kaynağına göre büyük/küçük değişebiliyor)
  private isMe(id?: string | null): boolean {
    const me = this.common.user()?.id;
    return !!id && !!me && id.toLowerCase() === me.toLowerCase();
  }

  /** İşleme Al akışında açılamayan satır: belge taranmamış ya da kayıttaki evrak başka personelde */
  private blockReason(row: DocRow): string | null {
    if (this.rowAction() !== 'process') return null;
    if (!row.scanned) return 'Belge henüz taranmadı';
    if (IN_REGISTRATION.has(row.docStatus) && row.assigneeId && !this.isMe(row.assigneeId)) {
      return `${row.assignee || 'Başka bir personel'} üzerinde işlemde`;
    }
    return null;
  }

  isRowClickable(row: DocRow): boolean {
    return this.blockReason(row) === null;
  }

  /** Gelen Evraklar'daki İşleme Al düğmesinin başlıklarıyla aynı */
  getRowTitle(row: DocRow): string {
    if (this.rowAction() !== 'process') return 'Evrak detayına git';
    const blocked = this.blockReason(row);
    if (blocked) return blocked;
    if (!IN_REGISTRATION.has(row.docStatus)) return 'Belge Detayına Git';
    return this.isMe(row.assigneeId) ? 'İşleme Devam Et' : 'İşleme Al';
  }

  onRowClick(row: DocRow): void {
    if (!this.isAttention() || !this.isRowClickable(row)) return;
    if (this.rowAction() === 'process') this.processRow(row);
    else this.goDetail(row.id);
  }

  /** Yönetici: atama (işleme alma) ya da kilit kontrolü yapmadan belge detayına gider. */
  private goDetail(id: string) {
    this.closeAll();
    this.incomingDocumentService.setSelectedIncomingDocument(id);
    this.incomingDocumentService.setIncomingDocumentUpdateType('1');
    this.router.navigate(['/evrakkayit']);
  }

  /** Evrak kayıt personeli: Gelen Evraklar'daki İşleme Al ile aynı akış. Evrak giriş yapan
   *  kullanıcıya atanır, ardından Evrak Kayıt ekranı açılır. */
  private processRow(row: DocRow): void {
    if (this.processingId()) return;
    const userId = this.common.user()?.id;
    if (!userId) {
      this.toast.showToast('Hata', 'Kullanıcı bulunamadı', 'error');
      return;
    }

    this.processingId.set(row.id);
    this.assignmentService.createAssignment({ documentId: row.id, userId }).subscribe({
      next: () => {
        this.processingId.set(null);
        this.closeAll();
        this.incomingDocumentService.setSelectedIncomingDocument(row.id);
        this.incomingDocumentService.setIncomingDocumentUpdateType('1');
        this.router.navigate(['/evrakkayit']);
      },
      error: () => {
        this.processingId.set(null);
        this.toast.showToast('Hata', 'Atama oluşturulamadı', 'error');
      },
    });
  }
}
