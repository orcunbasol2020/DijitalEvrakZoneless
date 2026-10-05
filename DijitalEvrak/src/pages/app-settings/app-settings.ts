import { ChangeDetectionStrategy, Component, HostListener, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { from, of } from 'rxjs';
import { catchError, concatMap, map, toArray } from 'rxjs/operators';
import { FlexiToastService } from 'flexi-toast';
import GenericModel from '../../../components/generic-model/generic-model';
import { AppSettingModel, AppSettingsService, SESSION_TIMEOUT_KEY } from '../../services/app-settings';
import { AtlasDocumentNumberService, AtlasNumberStock } from '../../services/atlas-document-number';
import { AtlasTransferService, AtlasTransferStats } from '../../services/atlas-transfer';
import { Common } from '../../services/common';

type FieldKind = 'text' | 'email' | 'textarea' | 'bool' | 'int';

type GroupId = 'general' | 'scan' | 'zimmet' | 'atlas' | 'atlasTransfer' | 'session' | 'other';

interface SettingDef {
  key: string;
  group: GroupId;
  label: string;
  kind: FieldKind;
  /** Boş bırakılamaz (sayı ve true/false ayarları her zaman zorunlu) */
  required?: boolean;
  min?: number;
  max?: number;
  /** Sayı alanının birimi (sn, saat) */
  unit?: string;
  /** Backend açıklaması gelmezse gösterilen yardım metni */
  hint?: string;
  /** Alanın altında ayrıca gösterilen uyarı / not */
  note?: string;
  /** Metin alanı yalnızca rakam içerebilir (ör. DETSİS kodu) */
  digitsOnly?: boolean;
  /** Uyarı tonunda not (ör. henüz açılmaması gereken ayar) */
  warn?: boolean;
  /** true yapılmadan önce onay penceresi */
  confirmOn?: boolean;
}

interface GroupDef {
  id: GroupId;
  title: string;
  sub: string;
  icon: string;
  note?: string;
}

/** Ekranda gösterilen alan: tanım + sunucudaki kayıt + taslak değer ve doğrulama */
interface FieldView {
  def: SettingDef;
  setting: AppSettingModel;
  value: string;
  dirty: boolean;
  error: string | null;
  saveError: string | null;
  updatedAt: Date | null;
}

const MAX_LENGTH = 2000;
const WORK_START = 'ZimmetReminderWorkStartHour';
const WORK_END = 'ZimmetReminderWorkEndHour';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GROUPS: GroupDef[] = [
  { id: 'general', title: 'Genel Bilgiler', sub: '"Hakkında" ekranı ve destek bilgisi', icon: 'info' },
  { id: 'scan', title: 'Taranan Belgelerin Otomatik Aktarımı', sub: 'Sunucudaki klasörden belgelerin içeri alınması', icon: 'folder_open' },
  {
    id: 'zimmet', title: 'Zimmet Onayı ve Hatırlatmalar', sub: 'Kurum içi devir / teslim onayı ve hatırlatma e-postaları', icon: 'notifications_active',
    note: 'Hatırlatmalar yalnızca hafta içi ve aşağıdaki mesai saatleri arasında, sunucu saatine göre gönderilir.',
  },
  { id: 'atlas', title: 'Atlas Evrak Numarası Havuzu', sub: 'QR kod numaralarının Atlas\'tan alınması', icon: 'qr_code_2' },
  { id: 'atlasTransfer', title: 'Atlas\'a Aktarım', sub: 'Yayınlanan evrakların EYP olarak Atlas\'a gönderilmesi', icon: 'cloud_upload' },
  { id: 'session', title: 'Oturum Güvenliği', sub: 'İşlem yapılmayan oturumların otomatik kapanması', icon: 'lock_clock' },
  { id: 'other', title: 'Diğer Ayarlar', sub: 'Bu ekranda henüz özel alanı olmayan ayarlar', icon: 'tune' },
];

const DEFS: SettingDef[] = [
  { key: 'ApplicationName', group: 'general', label: 'Uygulama adı', kind: 'text', required: true },
  { key: 'SupportEmail', group: 'general', label: 'Destek e-postası', kind: 'email' },
  { key: 'SupportPhone', group: 'general', label: 'Destek telefonu', kind: 'text' },
  { key: 'AnnouncementMessage', group: 'general', label: 'Duyuru mesajı', kind: 'textarea' },

  { key: 'ScanImportEnabled', group: 'scan', label: 'Otomatik aktarım', kind: 'bool' },
  {
    key: 'ScanImportFolderPath', group: 'scan', label: 'Klasör yolu', kind: 'text', required: true,
    note: 'Sunucudaki klasörün yolu, kendi bilgisayarınızdaki değil. Klasör yoksa aktarım uyarı vermeden durur.',
  },
  { key: 'ScanImportIntervalSeconds', group: 'scan', label: 'Kontrol aralığı', kind: 'int', min: 10, unit: 'sn' },

  { key: 'ZimmetApprovalRequired', group: 'zimmet', label: 'Alıcı onayı gereksin', kind: 'bool', hint: 'Kurum içi devir / teslimde alıcının onayı gereksin mi' },
  { key: 'ZimmetReminderEnabled', group: 'zimmet', label: 'Hatırlatmalar', kind: 'bool' },
  { key: 'ZimmetReminderIntervalHours', group: 'zimmet', label: 'Hatırlatma aralığı', kind: 'int', min: 1, unit: 'saat' },
  {
    key: 'ZimmetReminderEscalateAfter', group: 'zimmet', label: 'Devredene gecikme bildirimi', kind: 'int', min: 0,
    note: '0 girilirse devredene gecikme bildirimi gönderilmez.',
  },
  { key: WORK_START, group: 'zimmet', label: 'Mesai başlangıcı', kind: 'int', min: 0, max: 23, unit: 'saat' },
  { key: WORK_END, group: 'zimmet', label: 'Mesai bitişi', kind: 'int', min: 1, max: 24, unit: 'saat' },

  {
    key: 'AtlasNumberPoolEnabled', group: 'atlas', label: 'Havuzu otomatik doldur', kind: 'bool', warn: true,
    note: 'Şu an açılmamalı: Atlas bağlantısı henüz test aşamasında, açılırsa havuza test numaraları girer.',
  },
  { key: 'AtlasNumberPoolMinStock', group: 'atlas', label: 'En az stok', kind: 'int', min: 1 },
  { key: 'AtlasNumberPoolBatchSize', group: 'atlas', label: 'Tek seferde alınan numara', kind: 'int', min: 1, max: 1000 },
  { key: 'AtlasNumberPoolIntervalSeconds', group: 'atlas', label: 'Stok kontrol aralığı', kind: 'int', min: 30, unit: 'sn' },
  {
    key: 'AtlasNumberPoolEnforced', group: 'atlas', label: 'Yalnızca havuz numarasıyla evrak aç', kind: 'bool', confirmOn: true, warn: true,
    note: 'Açıkken gelen evrak yalnızca havuzdaki numarayla açılabilir. Geçiş tamamlanınca açılmalı.',
  },

  {
    key: 'AtlasTransferEnabled', group: 'atlasTransfer', label: 'Otomatik aktarım', kind: 'bool', warn: true,
    note: 'Şu an açılmamalı: EYP üretimi ve Atlas bağlantısı henüz sahte; açılırsa kuyruktaki evraklar Atlas\'a gitmeden Yayınlandı görünür.',
  },
  { key: 'AtlasTransferIntervalSeconds', group: 'atlasTransfer', label: 'Kontrol aralığı', kind: 'int', min: 10, unit: 'sn' },
  { key: 'AtlasTransferBatchSize', group: 'atlasTransfer', label: 'Bir turda aktarılan', kind: 'int', min: 1, max: 100 },
  { key: 'AtlasTransferMaxTryCount', group: 'atlasTransfer', label: 'En fazla deneme', kind: 'int', min: 1, max: 20 },
  {
    key: 'AtlasEypRecipientKkk', group: 'atlasTransfer', label: 'Bakanlık KKK (DETSİS) kodu', kind: 'text', required: true, digitsOnly: true,
    hint: 'EYP dağıtım listesine yazılır. Boşken aktarım çalışmaz, evraklar kuyrukta bekler.',
  },
  { key: 'AtlasEypRecipientName', group: 'atlasTransfer', label: 'Bakanlık adı', kind: 'text', required: true },

  {
    key: SESSION_TIMEOUT_KEY, group: 'session', label: 'Boşta kalma süresi', kind: 'int', min: 0, max: 480, unit: 'dk',
    hint: 'Bu süre boyunca işlem yapılmazsa oturum kapanır; 0 girilirse kapanmaz.',
  },
];

const DEF_BY_KEY = new Map(DEFS.map(d => [d.key, d]));

function isTrue(value: string | null | undefined): boolean {
  return (value ?? '').trim().toLowerCase() === 'true';
}

/** Backend'in yanıtı: { Errors: ["Value"] | ["Key"], StatusCode } — mesaj değil alan adı gelir. */
function saveErrorMessage(err: unknown): string {
  const body = (err as HttpErrorResponse)?.error;
  const fields: string[] = body?.Errors ?? body?.errors ?? [];
  if (fields.includes('Key')) return 'Bu ayar sunucuda tanınmıyor, kaydedilemedi.';
  if (fields.includes('Value')) return 'Değer sunucu kurallarına uymadığı için kaydedilemedi.';
  return 'Kaydedilemedi, lütfen tekrar deneyin.';
}

/**
 * Uygulama ayarları (yalnızca Yönetici). Değişiklikler tek "Kaydet" ile, yalnızca değişen
 * ayarlar için ve her biri ayrı istekle gönderilir; kaydedildiği an geçerli olur.
 */
@Component({
  imports: [GenericModel, RouterLink],
  templateUrl: './app-settings.html',
  // Kart iskeleti (st-*) Ayarlar, üst kart (sp-hero) Destek sayfasıyla ortak
  styleUrls: ['../support/support.css', '../settings/settings.css', './app-settings.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class AppSettings {
  readonly #service = inject(AppSettingsService);
  readonly #atlas = inject(AtlasDocumentNumberService);
  readonly #transfer = inject(AtlasTransferService);
  readonly #common = inject(Common);
  readonly #toast = inject(FlexiToastService);

  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly saving = signal(false);

  readonly #settings = signal<AppSettingModel[]>([]);
  /** Kaydedilmemiş değerler (anahtar → yeni değer) */
  readonly #drafts = signal<Map<string, string>>(new Map());
  /** Son kayıtta sunucunun reddettiği ayarlar (anahtar → mesaj) */
  readonly #saveErrors = signal<Map<string, string>>(new Map());

  readonly stock = signal<AtlasNumberStock | null>(null);
  /** Atlas aktarım kuyruğu özeti; hatalı evrak varsa grup başlığında listeye bağlantı */
  readonly transferStats = signal<AtlasTransferStats | null>(null);

  /** Onay bekleyen açma işlemi (AtlasNumberPoolEnforced) */
  readonly confirmField = signal<FieldView | null>(null);

  readonly fields = computed<FieldView[]>(() => {
    const drafts = this.#drafts();
    const saveErrors = this.#saveErrors();
    const views = this.#settings().map(setting => {
      const def = DEF_BY_KEY.get(setting.key) ?? { key: setting.key, group: 'other' as GroupId, label: setting.key, kind: 'text' as FieldKind };
      const original = this.#normalize(def, setting.value);
      const value = drafts.has(setting.key) ? drafts.get(setting.key)! : original;
      return {
        def,
        setting,
        value,
        dirty: value !== original,
        error: null as string | null,
        saveError: saveErrors.get(setting.key) ?? null,
        updatedAt: this.#parseUtc(setting.updateDate),
      };
    });

    // Mesai bitişi başlangıçtan büyük olmalı; backend bunu denetlemediği için yalnızca burada
    const byKey = new Map(views.map(v => [v.def.key, v]));
    for (const view of views) view.error = this.#validate(view);
    const start = byKey.get(WORK_START);
    const end = byKey.get(WORK_END);
    if (start && end && !start.error && !end.error && Number(end.value) <= Number(start.value)) {
      end.error = 'Mesai bitişi, başlangıç saatinden büyük olmalı. Aksi halde hiç hatırlatma gönderilmez.';
    }
    return views;
  });

  readonly groups = computed(() => {
    const fields = this.fields();
    const order = new Map(DEFS.map((d, i) => [d.key, i]));
    return GROUPS
      .map(group => ({
        ...group,
        fields: fields
          .filter(f => f.def.group === group.id)
          .sort((a, b) => (order.get(a.def.key) ?? 999) - (order.get(b.def.key) ?? 999) || a.def.key.localeCompare(b.def.key)),
      }))
      .filter(g => g.fields.length > 0);
  });

  readonly dirtyCount = computed(() => this.fields().filter(f => f.dirty).length);
  readonly invalidCount = computed(() => this.fields().filter(f => f.error).length);
  readonly canSave = computed(() => !this.saving() && this.dirtyCount() > 0 && this.invalidCount() === 0);

  constructor() {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.#service.getAll().subscribe({
      next: list => {
        this.#settings.set(list ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
    this.#atlas.getStock().pipe(catchError(() => of(null))).subscribe(stock => this.stock.set(stock));
    this.#transfer.getStats().pipe(catchError(() => of(null))).subscribe(stats => this.transferStats.set(stats));
  }

  // ---- Alan girişleri ----

  setValue(field: FieldView, value: string): void {
    const original = this.#normalize(field.def, field.setting.value);
    this.#drafts.update(map => {
      const next = new Map(map);
      if (value === original) next.delete(field.def.key);
      else next.set(field.def.key, value);
      return next;
    });
    this.#clearSaveError(field.def.key);
  }

  onInput(field: FieldView, event: Event): void {
    this.setValue(field, (event.target as HTMLInputElement | HTMLTextAreaElement).value);
  }

  onToggle(field: FieldView, event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.checked && field.def.confirmOn) {
      // Onaylanana kadar kapalı kalır
      input.checked = false;
      this.confirmField.set(field);
      return;
    }
    this.setValue(field, input.checked ? 'true' : 'false');
  }

  isOn(field: FieldView): boolean {
    return isTrue(field.value);
  }

  confirmEnable(): void {
    const field = this.confirmField();
    if (field) this.setValue(field, 'true');
    this.confirmField.set(null);
  }

  cancelConfirm(): void {
    this.confirmField.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.confirmField()) this.cancelConfirm();
  }

  discard(): void {
    this.#drafts.set(new Map());
    this.#saveErrors.set(new Map());
  }

  // ---- Kaydet ----

  save(): void {
    if (!this.canSave()) return;
    const userId = this.#common.user()?.id;
    if (!userId) {
      this.#toast.showToast('Hata', 'Kullanıcı bulunamadı', 'error');
      return;
    }

    const changed = this.#orderForSave(this.fields().filter(f => f.dirty));
    this.saving.set(true);
    this.#saveErrors.set(new Map());

    // Sırayla gönderilir (mesai saatlerinin sırası önemli); biri hata verirse diğerleri yine denenir
    from(changed).pipe(
      concatMap(field =>
        this.#service.update(field.def.key, field.value, userId).pipe(
          map(() => ({ key: field.def.key, error: null as string | null })),
          catchError(err => of({ key: field.def.key, error: saveErrorMessage(err) })),
        )
      ),
      toArray(),
    ).subscribe(results => {
      const failed = results.filter(r => r.error);
      const savedKeys = new Set(results.filter(r => !r.error).map(r => r.key));

      this.#drafts.update(drafts => {
        const next = new Map(drafts);
        for (const key of savedKeys) next.delete(key);
        return next;
      });
      this.#saveErrors.set(new Map(failed.map(r => [r.key, r.error!])));
      this.saving.set(false);

      if (failed.length) {
        const names = failed.map(r => DEF_BY_KEY.get(r.key)?.label ?? r.key).join(', ');
        this.#toast.showToast('Hata', `Kaydedilemeyen ayarlar: ${names}`, 'error');
      }

      // Son güncelleme zamanlarını tazelemek için listeyi yeniden al (taslaklar korunur)
      if (savedKeys.size) {
        this.#service.getAll().subscribe({ next: list => this.#settings.set(list ?? []) });
        if (results.some(r => r.key.startsWith('AtlasNumberPool') && !r.error)) {
          this.#atlas.getStock().pipe(catchError(() => of(null))).subscribe(stock => this.stock.set(stock));
        }
      }
    });
  }

  /** Mesai saatleri birlikte değiştiyse: ileri alınıyorsa önce bitiş, geri alınıyorsa önce başlangıç. */
  #orderForSave(changed: FieldView[]): FieldView[] {
    const start = changed.find(f => f.def.key === WORK_START);
    const end = changed.find(f => f.def.key === WORK_END);
    if (!start || !end) return changed;

    const forward = Number(start.value) >= Number(start.setting.value);
    const pair = forward ? [end, start] : [start, end];
    const rest = changed.filter(f => f !== start && f !== end);
    return [...rest, ...pair];
  }

  // ---- Yardımcılar ----

  #normalize(def: SettingDef, value: string | null | undefined): string {
    if (def.kind === 'bool') return isTrue(value) ? 'true' : 'false';
    return value ?? '';
  }

  #validate(view: FieldView): string | null {
    const { def } = view;
    const value = view.value;
    if (def.kind === 'bool') return null;
    if (value.length > MAX_LENGTH) return `En fazla ${MAX_LENGTH} karakter olabilir.`;

    if (def.kind === 'int') {
      const text = value.trim();
      if (!text) return 'Boş bırakılamaz.';
      if (!/^-?\d+$/.test(text)) return 'Tam sayı olmalı.';
      const n = Number(text);
      if (def.min != null && def.max != null && (n < def.min || n > def.max)) return `${def.min} ile ${def.max} arasında olmalı.`;
      if (def.min != null && n < def.min) return `En az ${def.min} olmalı.`;
      if (def.max != null && n > def.max) return `En fazla ${def.max} olabilir.`;
      return null;
    }

    if (def.required && !value.trim()) return 'Boş bırakılamaz.';
    if (def.digitsOnly && value.trim() && !/^\d+$/.test(value.trim())) return 'Yalnızca rakam girilebilir.';
    if (def.kind === 'email' && value.trim() && !EMAIL_RE.test(value.trim())) return 'Geçerli bir e-posta adresi girin.';
    return null;
  }

  #clearSaveError(key: string): void {
    if (!this.#saveErrors().has(key)) return;
    this.#saveErrors.update(map => {
      const next = new Map(map);
      next.delete(key);
      return next;
    });
  }

  /** updateDate UTC gelir; saat dilimi eki yoksa Z eklenir. */
  #parseUtc(value?: string | null): Date | null {
    if (!value) return null;
    const iso = /Z|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`;
    const date = new Date(iso);
    return isNaN(date.getTime()) ? null : date;
  }

  helpText(field: FieldView): string | null {
    return field.setting.description || field.def.hint || null;
  }

  formatDate(date: Date): string {
    return date.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

}
