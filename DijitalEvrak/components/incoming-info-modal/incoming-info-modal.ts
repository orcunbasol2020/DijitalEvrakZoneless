import { ChangeDetectionStrategy, Component, HostListener, ViewEncapsulation, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { IncomingAttachmentsView } from '../incoming-attachments-view/incoming-attachments-view';
import { IncomingDocumentService } from '../../src/services/incomingdocument';
import { Department } from '../../src/services/department';
import { idKey } from '../../src/models/ids';
import { IncomingDocumentModel, incomingRecipientNames } from '../../src/models/incoming-document/incoming-document.model';
import { SecurityDegreeBadgeClass, SecurityDegreeIcons, SecurityDegreeLabels } from '../../src/models/securitydegree.model';
import { UrgencyDegreeBadgeClass, UrgencyDegreeInitials, UrgencyDegreeLabels } from '../../src/models/urgencydegree.model';
import { DocumentTypeLabels } from '../../src/models/documenttype.model';
import { actionRequiredBadgeClass, actionRequiredIcon, actionRequiredLabel } from '../../src/models/actionrequired.model';
import { isPublished, isPublishFailed, isPublishing, publishStatusLabel } from '../../src/models/publishstatus.model';

// Evrakın akış durumu (status) metinleri; 6 ve 10 eski kayıtlarda yayın için kullanılmıştı
const DOCUMENT_STATUS_LABELS: Record<number, string> = {
  1: 'Ön Kayıt',
  2: 'Kayıt Tamamlandı',
  3: 'Teslim Edildi',
  4: 'Eşleştirme',
  5: 'OCR',
  6: 'Kayıt Tamamlandı',
  10: 'Kayıt Tamamlandı'
};

const OCR_STATUS_LABELS: Record<number, string> = {
  0: 'Bekliyor',
  1: 'Tamamlandı',
  2: 'Hatalı'
};

const LANGUAGES: Record<number, string> = { 1: 'Türkçe', 2: 'İngilizce' };

/**
 * Evrak Bilgileri popup'ı (salt okunur): Gelen Evraklar ve evrak listesindeki popup'ın aynısı.
 * Verilen evrak hemen gösterilir, ardından GetById + GetDistributions ile tazelenir (ek bilgisi
 * gibi alanlar liste yanıtında eksik olabilir). Kapatma closed ile bildirilir.
 */
@Component({
  selector: 'app-incoming-info-modal',
  standalone: true,
  imports: [IncomingAttachmentsView],
  templateUrl: './incoming-info-modal.html',
  styleUrl: './incoming-info-modal.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IncomingInfoModal {
  readonly #incomingDocuments = inject(IncomingDocumentService);
  readonly #departmentService = inject(Department);

  /** Gösterilecek evrak; null iken popup kapalıdır */
  readonly document = input<IncomingDocumentModel | null>(null);
  /** Alt bilgi satırında detay / kayıt ekranına götüren düğme */
  readonly showDetailLink = input(false);
  readonly detailLabel = input('Evrak detayına git');
  /** Doluysa düğme pasif, neden ipucunda gösterilir */
  readonly detailBlockedReason = input<string | null>(null);
  /** Düğmenin işi sürüyor (çift tıklamada ikinci istek gitmesin) */
  readonly detailBusy = input(false);

  readonly closed = output<void>();
  readonly detail = output<string>();

  readonly doc = signal<IncomingDocumentModel | null>(null);
  readonly loading = signal(false);

  // Nereye adları birim listesinden çözülür (liste yanıtlarında birim adı gelmez)
  readonly #departments = signal<Record<string, { name: string; short: string }>>({});

  constructor() {
    this.#departmentService.getDepartments().subscribe({
      next: list => this.#departments.set(Object.fromEntries((list ?? []).filter(x => x.id)
        .map(x => [idKey(x.id)!, { name: x.name, short: x.shortName?.trim() || '' }]))),
      error: err => console.error('Birimler alınamadı:', err),
    });

    effect(() => {
      const item = this.document();
      untracked(() => this.load(item));
    });
  }

  private load(item: IncomingDocumentModel | null): void {
    this.doc.set(item);
    if (!item?.id) return;
    this.loading.set(true);

    // GetById alıcıları döndürmez; "Nereye" listesi GetDistributions'tan eklenir
    this.#incomingDocuments.getIncomingDocumentWithDistributions(item.id).subscribe({
      next: fresh => {
        // Bu arada başka evrak açıldıysa eski yanıt yazılmaz
        if (this.document()?.id !== item.id) return;
        // Atanan personelin adı yalnızca liste satırında gelir; tazelenen kayda taşınır.
        // Alıcılar okunamadıysa liste satırındaki distributions kullanılır.
        if (fresh) this.doc.set({
          ...fresh,
          distributions: fresh.distributions ?? item.distributions,
          currentAssignmentUser: fresh.currentAssignmentUser ?? item.currentAssignmentUser,
        });
        this.loading.set(false);
      },
      error: err => {
        // Tazelenemezse liste satırındaki bilgilerle gösterilir
        console.error('Evrak bilgileri alınamadı:', err);
        this.loading.set(false);
      },
    });
  }

  // Nereye: kısa biçimde kısa ad + "(B)", tam biçimde (tooltip) tam ad + "(Bilgi)"
  private toNames(d: IncomingDocumentModel, compact: boolean): string[] {
    const names = this.#departments();
    return incomingRecipientNames(d, id => {
      const dept = names[idKey(id)!];
      return dept && (compact ? (dept.short || dept.name) : dept.name);
    }, compact ? 'B' : 'Bilgi');
  }

  readonly view = computed(() => {
    const d = this.doc();
    if (!d) return null;
    const text = (v: unknown) => (v === null || v === undefined || v === '' ? '-' : String(v));
    const date = (v?: string | Date | null) => v ? new Date(v).toLocaleDateString('tr-TR') : '-';
    const dateTime = (v?: string | Date | null) => v
      ? new Date(v).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '-';
    const ocr = d.ocrStatus ?? 0;
    const urgency = d.urgencyDegree;
    const security = d.securityDegree as keyof typeof SecurityDegreeLabels;

    return {
      qrCode: text(d.qrCode),
      subject: d.subject?.trim() || '',
      documentType: text(DocumentTypeLabels[d.documentTypeId as keyof typeof DocumentTypeLabels]),
      documentDate: date(d.documentDate),
      orginalNo: text(d.orginalNo),
      notes: d.notes?.trim() || '',

      security: {
        label: text(SecurityDegreeLabels[security]),
        icon: (SecurityDegreeIcons as Record<number, string>)[d.securityDegree] || 'help',
        tier: (SecurityDegreeBadgeClass as Record<number, string>)[d.securityDegree] || 'degree-tier-1',
      },
      urgency: {
        label: text(urgency != null ? (UrgencyDegreeLabels as Record<number, string>)[urgency] : null),
        initial: (urgency != null && (UrgencyDegreeInitials as Record<number, string>)[urgency]) || '-',
        tier: (urgency != null && (UrgencyDegreeBadgeClass as Record<number, string>)[urgency]) || 'degree-tier-1',
      },
      action: {
        label: actionRequiredLabel(d.actionRequired),
        icon: actionRequiredIcon(d.actionRequired),
        cls: actionRequiredBadgeClass(d.actionRequired),
      },

      // Kurum adı cevapta gelir (externalInstitutionName)
      from: text(d.externalInstitutionName),
      to: text(this.toNames(d, true).join(', ')),
      toTitle: this.toNames(d, false).join('\n'),

      pageCount: d.pageCount != null && String(d.pageCount) !== '' ? String(d.pageCount) : '-',
      hasAttachment: d.hasAttachment ?? null,
      attachmentDescription: d.attachmentDescription?.trim() || '',
      electronicCopy: d.electronicCopy === true ? 'Var' : d.electronicCopy === false ? 'Yok' : '-',
      language: text(LANGUAGES[d.languageId]),
      hasFile: !!d.documentName,

      status: [
        { label: 'Durum', value: text(DOCUMENT_STATUS_LABELS[d.status]), tone: d.status === 3 ? 'success' : d.status === 1 ? 'info' : 'neutral' },
        {
          label: 'Yayın', value: publishStatusLabel(d),
          tone: isPublished(d) ? 'success' : isPublishFailed(d) ? 'danger' : isPublishing(d) ? 'warning' : 'neutral'
        },
        { label: 'OCR', value: OCR_STATUS_LABELS[ocr] ?? '-', tone: ocr === 1 ? 'success' : ocr === 2 ? 'danger' : 'warning' },
      ],

      meta: [
        { icon: 'person', label: 'Atanan Personel', value: text(d.currentAssignmentUser) },
        { icon: 'calendar_add_on', label: 'Oluşturulma', value: dateTime(d.createdDate) },
        { icon: 'update', label: 'Son Güncelleme', value: dateTime(d.updateDate) },
      ],
    };
  });

  close(): void {
    this.closed.emit();
  }

  openDetail(): void {
    const id = this.doc()?.id;
    if (id && !this.detailBlockedReason() && !this.detailBusy()) this.detail.emit(id);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.document()) this.close();
  }
}
