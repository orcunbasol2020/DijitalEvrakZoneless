import { ChangeDetectionStrategy, Component, inject, OnInit, signal, ViewEncapsulation } from '@angular/core';
import GenericModel from '../../../components/generic-model/generic-model';
import { Router } from '@angular/router';
import { IncomingDocumentService } from '../../services/incomingdocument';
import { CommonModule } from '@angular/common';
import { DocumentTransactionModel } from '../../models/documenttransaction.model';
import { DocumentTransaction } from '../../services/documenttransaction';
import { FlexiToastService } from 'flexi-toast';
import { SecurityDegreeLabels, SecurityDegreeBadgeClass } from '../../models/securitydegree.model';
import { actionRequiredLabel, actionRequiredBadgeClass } from '../../models/actionrequired.model';

type Tone = 'info' | 'success' | 'warning' | 'neutral';

// İşlem türüne göre zaman çizelgesi düğümünün ikonu ve rengi.
// 1 Ön Kayıt, 6 Zimmet, 7 Teslim, 8 OCR, 9 Birim Arşivi; diğerleri varsayılan.
const TYPE_STYLE: Record<number, { icon: string; tone: Tone }> = {
  1: { icon: 'app_registration', tone: 'info' },
  6: { icon: 'contract_edit', tone: 'info' },
  7: { icon: 'task_alt', tone: 'success' },
  8: { icon: 'document_scanner', tone: 'warning' },
  9: { icon: 'assured_workload', tone: 'neutral' },
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
  documentDetail = signal<any | null>(null);
  loading = signal(true);
  readonly #toast = inject(FlexiToastService);

  private documentService = inject(IncomingDocumentService);
  private router = inject(Router);
  private documentTransactionService = inject(DocumentTransaction);
  securityDegreeMap: Record<number, string> = SecurityDegreeLabels;
  securityDegreeStyle: Record<number, string> = SecurityDegreeBadgeClass;
  readonly actionRequiredLabel = actionRequiredLabel;
  readonly actionRequiredBadgeClass = actionRequiredBadgeClass;

  ngOnInit(): void {
    this.id = this.documentService.currentIncomingDocumentId;

    if (!this.id) {
      this.router.navigate(['/scanlist']);
      return;
    }

    this.loadTransactions(this.id);
    this.getDocument(this.id);
  }

  backToList() {
    this.router.navigate(['/scanlist']);
  }

  typeIcon(type: number): string {
    return TYPE_STYLE[type]?.icon ?? 'radio_button_checked';
  }

  typeTone(type: number): Tone {
    return TYPE_STYLE[type]?.tone ?? 'neutral';
  }

  // Kişi satırındaki küçük etiket: işlem türüne göre rolü.
  personLabel(type: number): string {
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
