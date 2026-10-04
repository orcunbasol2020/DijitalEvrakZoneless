import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal, ViewEncapsulation } from '@angular/core';
import GenericModel from '../../../components/generic-model/generic-model';
import { Router } from '@angular/router';
import { IncomingDocumentService } from '../../services/incomingdocument';
import { CommonModule } from '@angular/common';
import { DocumentTransactionModel } from '../../models/documenttransaction.model';
import { DocumentTransaction } from '../../services/documenttransaction';
import { FlexiToastService } from 'flexi-toast';
import { SecurityDegreeLabels, SecurityDegreeBadgeClass } from '../../models/securitydegree.model';
import { actionRequiredLabel, actionRequiredBadgeClass, actionRequiredIcon } from '../../models/actionrequired.model';
import { DocumentTypeLabels } from '../../models/documenttype.model';
import { IncomingDocumentModel } from '../../models/incoming-document/incoming-document.model';
import { DocumentAllocation } from '../../services/documentallocation';
import { DocumentAllocationModel } from '../../models/documentallocation.model';
import { Department, DepartmentModel } from '../../services/department';
import { ExternalInstitution, ExternalInstitutionModel } from '../../services/external-institution';
import { RoleService } from '../../services/role-service';
import { isPublished, isSentToPublish, publishStatusLabel } from '../../models/publishstatus.model';
import { UrgencyDegreeBadgeClass, UrgencyDegreeEnum, UrgencyDegreeInitials, UrgencyDegreeLabels } from '../../models/urgencydegree.model';
import {
  buildProcessSteps, ProcessMilestone, processMilestoneKind, processPersonLabel, ProcessStep, ProcessTone,
  processTypeIcon, processTypeTone, sortProcessTransactions
} from '../../models/process-step';

// Evrak Kayıt ekranındaki Dil seçenekleriyle aynı
const LANGUAGES: Record<number, string> = { 1: 'Türkçe', 2: 'İngilizce' };

// Gelen evrak akış durumu (backend DocumentStatusEnum) için özet şeridindeki etiket ve ton.
// Yayın durumu ayrı alanda (submissionStatus): yayına gönderilmiş evrakta şerit yayın
// durumunu gösterir (docStatus). Eski kayıtlarda kalmış 6 / 10 akış olarak Kayıt Tamamlandı.
const DOC_STATUS: Record<number, { label: string; tone: 'info' | 'success' | 'warning' | 'neutral' }> = {
  1: { label: 'Ön Kayıt', tone: 'info' },
  2: { label: 'Kayıt Tamamlandı', tone: 'neutral' },
  3: { label: 'Teslim Edildi', tone: 'success' },
  4: { label: 'Eşleştirme', tone: 'neutral' },
  5: { label: 'OCR', tone: 'neutral' },
  6: { label: 'Kayıt Tamamlandı', tone: 'neutral' },
  10: { label: 'Kayıt Tamamlandı', tone: 'neutral' },
};

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
  private roleService = inject(RoleService);

  // Geri dönülecek liste: evrak kayıt rolleri Gelen Evraklar (scanlist), yalnızca
  // Birim Evrak Sorumlusu olanlar Birim Gelen Evrakları (incomingDepartmentDocument).
  readonly listUrl = this.roleService.hasAny(['Gelen Evrak', 'Ön Kayıt'])
    ? '/scanlist'
    : (this.roleService.hasBirimEvrakRole() ? '/incomingDepartmentDocument' : '/scanlist');

  securityDegreeMap: Record<number, string> = SecurityDegreeLabels;
  securityDegreeStyle: Record<number, string> = SecurityDegreeBadgeClass;
  readonly actionRequiredLabel = actionRequiredLabel;
  readonly actionRequiredBadgeClass = actionRequiredBadgeClass;
  readonly actionRequiredIcon = actionRequiredIcon;
  readonly documentTypeLabels: Record<number, string> = DocumentTypeLabels;

  // ---- Özet şeridi: evrakın güncel durumu ----
  readonly activeZimmet = signal<DocumentAllocationModel | null>(null);
  readonly departments = signal<DepartmentModel[]>([]);
  readonly externalInstitutions = signal<ExternalInstitutionModel[]>([]);

  readonly docStatus = computed(() => {
    const doc = this.documentDetail();
    if (doc && isSentToPublish(doc)) {
      return { label: publishStatusLabel(doc), tone: isPublished(doc) ? 'success' as const : 'warning' as const };
    }
    const status = doc?.status;
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

  // ---- Sağ kart sekmeleri: Evrak Bilgileri (künye) ve orada olmayan alanlar (Diğer Bilgiler) ----
  readonly detailTab = signal<'general' | 'other'>('general');

  // Diğer Bilgiler sekmesi: sayfa sayısı, ek, ivedilik, dil, elektronik kopya, dosya ve tarihler
  readonly otherInfo = computed(() => {
    const d = this.documentDetail();
    if (!d) return null;
    const dateTime = (v?: string | Date | null) => {
      if (!v) return '-';
      const date = new Date(v);
      // Girilmemiş tarih backend'den 0001-01-01 olarak gelebilir
      return isNaN(date.getTime()) || date.getFullYear() < 1900
        ? '-'
        : date.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };
    const urgency = d.urgencyDegree != null ? d.urgencyDegree as UrgencyDegreeEnum : null;

    return {
      pageCount: d.pageCount != null && String(d.pageCount) !== '' ? String(d.pageCount) : '-',
      hasAttachment: d.hasAttachment ?? null,
      attachmentDescription: d.attachmentDescription?.trim() || '',
      urgency: urgency != null && UrgencyDegreeLabels[urgency]
        ? { label: UrgencyDegreeLabels[urgency], initial: UrgencyDegreeInitials[urgency], tier: UrgencyDegreeBadgeClass[urgency] }
        : null,
      language: LANGUAGES[d.languageId] || '-',
      electronicCopy: d.electronicCopy === true ? 'Var' : d.electronicCopy === false ? 'Yok' : '-',
      hasFile: !!d.documentName,
      releaseDate: isPublished(d) ? dateTime(d.releaseDate) : null,
      createdDate: dateTime(d.createdDate),
      updateDate: dateTime(d.updateDate)
    };
  });


  // Adım gruplama, ikon ve renk kuralları models/process-step.ts'te; Gelen Evraklar
  // listesindeki Süreç popup'ı da aynı kuralları kullanır.
  readonly steps = computed<ProcessStep[]>(() => buildProcessSteps(this.transactions()));

  ngOnInit(): void {
    this.id = this.documentService.currentIncomingDocumentId;

    if (!this.id) {
      this.router.navigate([this.listUrl]);
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
    this.router.navigate([this.listUrl]);
  }

  milestoneKind(t: DocumentTransactionModel): ProcessMilestone | null { return processMilestoneKind(t); }
  typeIcon(t: DocumentTransactionModel): string { return processTypeIcon(t); }
  typeTone(t: DocumentTransactionModel): ProcessTone { return processTypeTone(t); }
  personLabel(t: DocumentTransactionModel): string { return processPersonLabel(t); }

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
        this.transactions.set(sortProcessTransactions(res));
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
