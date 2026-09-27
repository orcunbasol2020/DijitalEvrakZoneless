import { HttpClient, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { FlexiGridModule } from 'flexi-grid';
import { Router, RouterLink } from '@angular/router';
import { FlexiToastService } from 'flexi-toast';
import { FormsModule } from '@angular/forms';
import GenericModel from '../../../../components/generic-model/generic-model';
import { CommonModule } from '@angular/common';
import { EnvelopeModel, EnvelopeStatus, EnvelopeStatusBadgeClass, EnvelopeStatusIcon, EnvelopeStatusLabels, envelopeTargetName, isEnvelopeClosed } from '../../../models/envelope.model';
import { ZimmetStateService } from '../../../services/zimmet-state-service';
import { EnvelopeService } from '../../../services/envelope';
import { Common } from '../../../services/common';
import { RoleService } from '../../../services/role-service';
import { Department, DepartmentModel } from '../../../services/department';
import { EnvelopeDocumentService } from '../../../services/envelopedocument';
import { OutgoingDocumentShipmentService } from '../../../services/outgoingdocumentshipment';
import { CargoCompanyLabels, OutgoingDocumentShipmentItemModel, OutgoingDocumentShipmentModel, ShipmentStatusLabels } from '../../../models/shipment.model';
import { firstValueFrom } from 'rxjs';

type EnvelopeRow = EnvelopeModel & { departmentName: string; targetName: string; statusLabel: string | number };


@Component({
  imports: [
    GenericModel,
    FlexiGridModule,
    FormsModule,
    CommonModule
  ],
  templateUrl: './envelope.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Envelopes {
  readonly #common = inject(Common);
  readonly #roleService = inject(RoleService);
  // Yönetici ve Giden Evrak rolündeki kullanıcılar hiçbir filtre göndermez
  // (tüm zarfları görür); diğer kullanıcılar kendi departmentId'siyle
  // sınırlanır, böylece aynı birimdeki herkesin oluşturduğu zarfları görür
  // (sadece kendi oluşturduklarını değil).
  readonly result = httpResource<EnvelopeModel[]>(() => {
    const departmentId = this.#roleService.hasAny(['Yönetici', 'Giden Evrak']) ? undefined : this.#common.user()?.departmentId;
    return departmentId
      ? `api/Envelopes/GetAll?departmentId=${encodeURIComponent(departmentId)}`
      : "api/Envelopes/GetAll";
  });
  readonly #departmentService = inject(Department);
  readonly departments = signal<DepartmentModel[]>([]);

  // "Ekleyen" sütunu için departmentId -> ad eşlemesi.
  readonly departmentNameMap = computed(() => {
    const map: Record<string, string> = {};
    for (const d of this.departments()) map[d.id] = d.name;
    return map;
  });

  // Şablonda enum değerleriyle karşılaştırma yapabilmek için dışa açılıyor.
  readonly EnvelopeStatus = EnvelopeStatus;
  // Teslim edilmiş ya da kargoya verilmiş zarf: detay ekranına gidilmez.
  readonly isEnvelopeClosed = isEnvelopeClosed;
  readonly statusBadgeClassMap: Record<number, string> = EnvelopeStatusBadgeClass;
  readonly statusIconMap: Record<number, string> = EnvelopeStatusIcon;

  readonly data = computed<EnvelopeRow[]>(() => {
    const deptMap = this.departmentNameMap();
    const departments = this.departments();
    return [...(this.result.value() ?? [])]
      .sort((a, b) => new Date(b.createdDate ?? 0).getTime() - new Date(a.createdDate ?? 0).getTime())
      .map(e => ({
        ...e,
        departmentName: (e.departmentId && deptMap[e.departmentId]) || '-',
        // "Gideceği Yer": kurum içi birim, yabancı misyon ya da dış kurum adı
        targetName: envelopeTargetName(e, departments) || '-',
        // Durum sütunu, filtre ve Excel dışa aktarımı ham sayı yerine etiketi kullansın.
        statusLabel: (e.status != null && EnvelopeStatusLabels[e.status]) || (e.status ?? '-')
      }));
  });
  readonly loading = computed(() => this.result.isLoading());
  readonly isBirimEvrakSorumlusu = computed(() => this.#roleService.has('Birim Evrak Sorumlusu'));
  // Giden Evrak rolündeki kullanıcılar tüm birimlerin zarflarını görebildiği için,
  // kendi biriminin kaydetmediği bir zarfta "Zarfı Teslim Et" yerine "Teslim Al"
  // ikonu gösteriliyor.
  readonly isGidenEvrakUser = computed(() => this.#roleService.has('Giden Evrak'));
  readonly ownDepartmentId = computed(() => this.#common.user()?.departmentId);
  readonly #toast = inject(FlexiToastService);
  readonly #http = inject(HttpClient);
  readonly #envelopeService = inject(EnvelopeService);
  readonly #envelopeDocumentService = inject(EnvelopeDocumentService);
  readonly #shipmentService = inject(OutgoingDocumentShipmentService);
  // Modal veya filtre açma durumu
  showFilters = false;

  // ---- Kargo Bilgisi popup'ı (Kargoya Verildi durumundaki zarflar) ----
  // Kargo kaydı zarfa değil dağıtım satırlarına bağlı olduğundan kayıt zarfın
  // evrakları üzerinden bulunur: evrakların kargo kayıtları çekilir ve zarfın
  // evraklarını en çok kapsayan (eşitlikte en son gönderilen) paket seçilir.
  readonly shipmentEnvelope = signal<EnvelopeRow | null>(null);
  readonly shipment = signal<OutgoingDocumentShipmentModel | null>(null);
  readonly shipmentLoading = signal(false);
  readonly shipmentError = signal<string | null>(null);
  readonly trackingCopied = signal(false);
  // Zarf Bilgileri bölümü; popup her açıldığında kapalı başlar.
  readonly envelopeInfoOpen = signal(false);
  // Paketteki evrakların ekranda kullanılan evrak numarası (QR kodu). Kargo
  // yanıtındaki documentNumber evrağın orijinal (karşı taraf) numarasıdır ve
  // çoğu kayıtta boştur; QR numarası zarfın evrak listesinden eşleştirilir.
  readonly shipmentDocNumbers = signal<Record<string, string>>({});

  // Paketteki Evraklar bölümü; popup her açıldığında kapalı başlar ve içerik
  // ilk açılışta GetById ile çekilir (sonraki açılışlarda aynı veri kullanılır).
  readonly packageOpen = signal(false);
  readonly packageLoading = signal(false);
  readonly packageError = signal<string | null>(null);
  readonly packageItems = signal<OutgoingDocumentShipmentItemModel[] | null>(null);

  async togglePackage(): Promise<void> {
    const open = !this.packageOpen();
    this.packageOpen.set(open);
    if (!open || this.packageItems() || this.packageLoading()) return;

    const shipmentId = this.shipment()?.id;
    if (!shipmentId) return;

    this.packageLoading.set(true);
    this.packageError.set(null);
    try {
      const fresh = await firstValueFrom(this.#shipmentService.getById(shipmentId));
      if (this.shipment()?.id !== shipmentId) return;
      this.packageItems.set(fresh?.items ?? []);
    } catch (err) {
      console.error('Paket içeriği alınamadı:', err);
      if (this.shipment()?.id === shipmentId) this.packageError.set('Paketteki evraklar alınamadı.');
    } finally {
      if (this.shipment()?.id === shipmentId) this.packageLoading.set(false);
    }
  }

  shipmentDocNo(outgoingDocumentId: string, fallback?: string | null): string {
    return this.shipmentDocNumbers()[outgoingDocumentId?.toLowerCase()] || fallback || '-';
  }
  readonly shipmentStatusLabels: Record<number, string> = ShipmentStatusLabels;
  readonly cargoCompanyLabels: Record<number, string> = CargoCompanyLabels;

  async openShipmentInfo(row: EnvelopeRow): Promise<void> {
    this.shipmentEnvelope.set(row);
    this.shipment.set(null);
    this.shipmentError.set(null);
    this.trackingCopied.set(false);
    this.envelopeInfoOpen.set(false);
    this.shipmentDocNumbers.set({});
    this.packageOpen.set(false);
    this.packageLoading.set(false);
    this.packageError.set(null);
    this.packageItems.set(null);
    this.shipmentLoading.set(true);

    try {
      const docs = await this.#envelopeDocumentService.getEnvelopeDocumentsByEnvelopeId(row.id);
      const docIds = new Set(docs.map(d => d.documentId?.toLowerCase()).filter(Boolean));
      const numbers: Record<string, string> = {};
      for (const d of docs) {
        if (d.documentId && d.qrCode) numbers[d.documentId.toLowerCase()] = d.qrCode;
      }
      if (this.shipmentEnvelope()?.id === row.id) this.shipmentDocNumbers.set(numbers);

      let best: OutgoingDocumentShipmentModel | null = null;
      let bestScore = -1;
      // Genellikle ilk evrak yeterlidir; kaydı olmayan evrakta sıradakine geçilir.
      for (const doc of docs) {
        if (!doc.documentId) continue;
        const list = await firstValueFrom(this.#shipmentService.getByOutgoingDocumentId(doc.documentId)).catch(() => []);
        for (const s of list ?? []) {
          const score = (s.items ?? []).filter(i => docIds.has(i.outgoingDocumentId?.toLowerCase())).length;
          const newer = best && new Date(s.sentDate).getTime() > new Date(best.sentDate).getTime();
          if (score > bestScore || (score === bestScore && newer)) {
            best = s;
            bestScore = score;
          }
        }
        if (best) break;
      }

      // Popup bu arada kapatılmış ya da başka zarfa geçilmiş olabilir.
      if (this.shipmentEnvelope()?.id !== row.id) return;
      if (best) {
        this.shipment.set(best);
      } else {
        this.shipmentError.set(docs.length ? 'Bu zarfa ait kargo kaydı bulunamadı.' : 'Zarfta evrak bulunamadı.');
      }
    } catch (err) {
      console.error('Kargo bilgisi alınamadı:', err);
      if (this.shipmentEnvelope()?.id === row.id) this.shipmentError.set('Kargo bilgisi alınamadı.');
    } finally {
      if (this.shipmentEnvelope()?.id === row.id) this.shipmentLoading.set(false);
    }
  }

  // Paketteki evrağın kaydına gider; popup kapanır.
  goToOutgoingDocument(outgoingDocumentId: string): void {
    if (!outgoingDocumentId) return;
    this.closeShipmentInfo();
    this.router.navigate(['/gidenevrak/outgoing/create', outgoingDocumentId]);
  }

  // ---- Kargo bilgisi yazdırma ----
  // Popup'taki bilgilerden (kargo, zarf, paketteki evraklar) sade bir A4 sayfası
  // oluşturulup yeni pencerede yazdırılır. Paket içeriği kargo kaydıyla birlikte
  // geldiği için ek istek atılmaz; pencere tıklama anında açılır, engellenmez.
  printShipment(): void {
    const env = this.shipmentEnvelope();
    const s = this.shipment();
    if (!env || !s) return;

    const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
    const fmt = (d?: string | null) => {
      if (!d) return '-';
      const date = new Date(d);
      return isNaN(date.getTime()) ? '-' : date.toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    };
    const row = (label: string, value: unknown, empty = '-') =>
      `<tr><th>${esc(label)}</th><td>${value ? esc(value).replace(/\n/g, '<br>') : `<span class="muted">${esc(empty)}</span>`}</td></tr>`;

    const items = this.packageItems() ?? s.items ?? [];
    const docRows = items.map((i, idx) => `
      <tr>
        <td class="num">${idx + 1}</td>
        <td class="mono">${esc(this.shipmentDocNo(i.outgoingDocumentId, i.documentNumber))}</td>
        <td>${esc(i.subject || '-')}</td>
      </tr>`).join('');

    const html = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<title>Kargo Bilgisi - ${esc(env.envelopeNo)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1e293b; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 10px; border-bottom: 2px solid #1c2b4a; }
  .head h1 { margin: 0; font-size: 18px; color: #1c2b4a; }
  .head .sub { margin-top: 2px; font-size: 12px; color: #475569; letter-spacing: .04em; }
  .head .meta { text-align: right; font-size: 11px; color: #64748b; }
  h2 { margin: 18px 0 6px; font-size: 13px; color: #115b87; }
  table { width: 100%; border-collapse: collapse; }
  .info th { width: 34%; text-align: left; font-weight: 600; color: #64748b; }
  .info th, .info td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .info td { font-weight: 600; }
  .docs th { text-align: left; font-size: 11px; color: #475569; background: #f1f5f9; }
  .docs th, .docs td { padding: 6px 8px; border: 1px solid #e2e8f0; vertical-align: top; }
  .num { width: 36px; text-align: center; }
  .mono { font-variant-numeric: tabular-nums; letter-spacing: .03em; white-space: nowrap; }
  .muted { color: #94a3b8; font-weight: 400; font-style: italic; }
  .foot { margin-top: 28px; font-size: 10px; color: #94a3b8; text-align: right; }
</style>
</head>
<body onload="window.print(); window.close();">
  <div class="head">
    <div>
      <h1>Kargo Bilgisi</h1>
      <div class="sub">${esc(env.envelopeNo)}</div>
    </div>
    <div class="meta">Yazdırma: ${esc(fmt(new Date().toISOString()))}</div>
  </div>

  <h2>Kargo Bilgileri</h2>
  <table class="info">
    ${row('Kargo Firması', s.cargoCompanyName || this.cargoCompanyLabels[s.cargoCompany])}
    ${row('Takip Numarası', s.trackingNumber)}
    ${row('Gönderim Tarihi', fmt(s.sentDate))}
    ${row('Kargoya Veren', s.sentUserFullName)}
    ${s.externalInstitutionName ? row('Paket Alıcısı', s.externalInstitutionName) : ''}
    ${s.deliveredDate ? row('Teslim Tarihi', fmt(s.deliveredDate)) : ''}
  </table>

  <h2>Zarf Bilgileri</h2>
  <table class="info">
    ${row('Gönderen', env.departmentName)}
    ${row('Alıcı Kurum', env.targetName)}
    ${row('Alıcı Birim/Kişi', env.unitName, 'Girilmedi')}
    ${row('Adres', env.address, 'Girilmedi')}
  </table>

  <h2>Paketteki Evraklar (${items.length})</h2>
  ${items.length ? `<table class="docs">
    <thead><tr><th class="num">#</th><th>Evrak No</th><th>Konu</th></tr></thead>
    <tbody>${docRows}</tbody>
  </table>` : '<div class="muted">Pakette evrak bulunamadı.</div>'}

  <div class="foot">Dijital Evrak Takip Sistemi</div>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=820,height=900');
    if (!win) {
      this.#toast.showToast('Uyarı', 'Yazdırma penceresi açılamadı. Tarayıcının açılır pencere engelini kontrol edin.', 'warning');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  closeShipmentInfo(): void {
    this.shipmentEnvelope.set(null);
    this.shipment.set(null);
    this.shipmentError.set(null);
    this.shipmentLoading.set(false);
  }

  // Takip numarası kargo firmasının sitesinde aranmak üzere kopyalanır; sonuç
  // butonun kendisinde gösterilir (ayrı bir bildirim çıkmaz).
  async copyTrackingNumber(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      this.trackingCopied.set(true);
      setTimeout(() => this.trackingCopied.set(false), 1500);
    } catch {
      this.#toast.showToast('Uyarı', 'Takip numarası kopyalanamadı', 'warning');
    }
  }

  constructor(
    private router: Router,
    private state: ZimmetStateService) {
    this.loadDepartments();
  }

  private loadDepartments(): void {
    this.#departmentService.getDepartments().subscribe({
      next: (res) => this.departments.set(res),
      error: (err) => {
        console.error(err);
        this.#toast.showToast('Hata', 'Birimler yüklenemedi', 'error');
      }
    });
  }

  // Teslim edilmiş zarf: salt okunur Teslim Bilgisi ekranı.
  goToGidenZimmet(envelopeId: string) {
    this.state.setEnvelopeId(envelopeId);
    this.router.navigate(['/gidenzimmet']);
  }

  // Teslim Al / Teslim Et: QR okutma ekranına gidilir; etiket numarası query param
  // ile taşınarak zarf orada otomatik aranır ve ilgili sekme (Teslim Al = self,
  // Teslim Et = external) seçili gelir.
  goToZimmetScan(envelopeNo: string, mode: 'self' | 'external') {
    this.router.navigate(['/gidenevrak/zimmet'], { queryParams: { envelopeNo, mode } });
  }

  goToDetail(envelopeId: string) {
    this.#envelopeService.setSelectedEnvelope(envelopeId);
    this.router.navigate(['/ticket']);
  }

  // Ticket sayfası seçili zarf yoksa "Etiket Oluştur" formuyla açılır;
  // önceki bir "Detaya Git" seçimi kalmış olmasın diye önce temizlenir.
  goToCreate() {
    this.#envelopeService.clearSelectedEnvelope();
    this.router.navigate(['/ticket']);
  }
  deleteEnvelope(id: string) {
    this.#http.delete(`api/envelopes/${id}`).subscribe(() => {
      this.result.reload();
      this.#toast.showToast(
        'Bilgi',
        'Zarf Silindi.',
        'info'
      );
    });
  }
}