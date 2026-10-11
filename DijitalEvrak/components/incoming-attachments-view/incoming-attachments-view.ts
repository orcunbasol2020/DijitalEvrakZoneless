import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FlexiToastService } from 'flexi-toast';
import { IncomingDocumentAttachmentService } from '../../src/services/incoming-document-attachment';
import { IncomingDocumentAttachmentModel, formatFileSize } from '../../src/models/incoming-document-attachment.model';

/**
 * Gelen evrakın elektronik ekleri, salt okunur (detay popup'ları ve Süreçler ekranı).
 * Liste GetByIncomingDocumentId'den okunur; eke tıklanınca dosya blob olarak alınıp yeni
 * sekmede açılır. Ek yönetimi (yükleme, sıralama, silme) Evrak Kayıt ekranındadır.
 */
@Component({
  selector: 'app-incoming-attachments-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  // hideWhenEmpty: ek yoksa (ve liste okunurken) bileşen hiç görünmez; satır içi stil, kapsayıcı
  // sınıfın display değerini de ezer
  host: { '[style.display]': "hidden() ? 'none' : null" },
  template: `
    <div class="iav">
      <div class="iav-title">
        <span class="material-symbols-outlined">attach_file</span>
        Ekler
        @if (attachments().length) { <span class="iav-count">{{ attachments().length }}</span> }
      </div>

      @if (loading()) {
        <div class="iav-state"><span class="spinner-border spinner-border-sm"></span> Ekler yükleniyor…</div>
      } @else if (failed()) {
        <div class="iav-state is-error">
          Ekler alınamadı.
          <button type="button" class="iav-retry" (click)="load()">Tekrar dene</button>
        </div>
      } @else if (!attachments().length) {
        <div class="iav-state">Ek yok</div>
      } @else {
        <ul class="iav-list">
          @for (a of attachments(); track a.id; let i = $index) {
            <li class="iav-item">
              <button type="button" class="iav-open" [disabled]="busyId() === a.id"
                [title]="(a.description ? a.description + '\\n' : '') + a.originalFileName + ' · ' + size(a.fileSize) + ' — yeni sekmede aç'"
                (click)="open(a)">
                <span class="iav-no">{{ i + 1 }}</span>
                <span class="iav-name">{{ a.name }}</span>
                <span class="iav-size">{{ size(a.fileSize) }}</span>
                @if (busyId() === a.id) {
                  <span class="spinner-border spinner-border-sm"></span>
                } @else {
                  <span class="material-symbols-outlined iav-icon">open_in_new</span>
                }
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: [`
    .iav { display: flex; flex-direction: column; gap: 6px; }
    .iav-title { display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #64748b; }
    .iav-title .material-symbols-outlined { font-size: 15px; }
    .iav-count { padding: 0 7px; border-radius: 999px; background: #e0f2fe; color: #0369a1; font-size: 11px; letter-spacing: 0; }
    .iav-state { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: #94a3b8; }
    .iav-state.is-error { color: #b91c1c; }
    .iav-retry { border: 0; background: none; padding: 0; color: #0369a1; font-weight: 600; text-decoration: underline; }
    .iav-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .iav-open { width: 100%; display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 9px; border: 1px solid #e2e8f0; background: #fff; text-align: left; font-size: 12.5px; color: #1e293b; transition: border-color .15s ease, background .15s ease; }
    .iav-open:hover:not(:disabled) { border-color: #7dd3fc; background: #f0f9ff; }
    .iav-no { flex-shrink: 0; width: 20px; height: 20px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; background: #f1f5f9; color: #64748b; font-size: 11px; font-weight: 700; }
    .iav-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
    .iav-size { flex-shrink: 0; font-size: 11px; color: #94a3b8; font-variant-numeric: tabular-nums; }
    .iav-icon { flex-shrink: 0; font-size: 16px; color: #94a3b8; }
    [data-theme="dark"] .iav-open { background: rgba(255,255,255,0.03); border-color: rgba(148,163,184,0.22); color: #e2e8f0; }
    [data-theme="dark"] .iav-open:hover:not(:disabled) { background: rgba(56,189,248,0.1); border-color: rgba(125,211,252,0.4); }
    [data-theme="dark"] .iav-no { background: rgba(148,163,184,0.15); color: #cbd5e1; }
    [data-theme="dark"] .iav-count { background: rgba(14,165,233,0.18); color: #7dd3fc; }
    [data-theme="dark"] .iav-retry { color: #7dd3fc; }
  `]
})
export class IncomingAttachmentsView {
  readonly documentId = input<string | null | undefined>(null);
  /** true: ek yoksa başlık dahil hiçbir şey gösterilmez (detay popup'ları) */
  readonly hideWhenEmpty = input(false);

  private readonly service = inject(IncomingDocumentAttachmentService);
  private readonly toast = inject(FlexiToastService);

  readonly attachments = signal<IncomingDocumentAttachmentModel[]>([]);
  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly busyId = signal<string | null>(null);
  readonly size = formatFileSize;
  // Hata durumunda "Tekrar dene" görünsün diye gizlenmez
  readonly hidden = computed(() => this.hideWhenEmpty() && !this.failed() && !this.attachments().length);

  constructor() {
    effect(() => {
      const id = this.documentId();
      untracked(() => this.load(id));
    });
  }

  load(id: string | null | undefined = this.documentId()): void {
    this.attachments.set([]);
    this.failed.set(false);
    if (!id) return;
    this.loading.set(true);
    this.service.getByDocument(id, false).subscribe({
      next: list => {
        if (id !== this.documentId()) return;
        this.attachments.set(list ?? []);
        this.loading.set(false);
      },
      error: err => {
        console.error('Ekler alınamadı:', err);
        this.loading.set(false);
        this.failed.set(true);
      }
    });
  }

  open(a: IncomingDocumentAttachmentModel): void {
    this.busyId.set(a.id);
    this.service.openInNewTab(a).subscribe({
      next: () => this.busyId.set(null),
      error: () => {
        this.busyId.set(null);
        this.toast.showToast('Ek açılamadı', 'Ek dosyası bulunamadı.', 'error');
      }
    });
  }
}
