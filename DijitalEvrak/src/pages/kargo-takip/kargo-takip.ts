import { ChangeDetectionStrategy, Component, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { FlexiGridModule } from 'flexi-grid';
import { firstValueFrom } from 'rxjs';
import GenericModel from '../../../components/generic-model/generic-model';
import { Common } from '../../services/common';
import { RoleService } from '../../services/role-service';
import { OutgoingDocumentShipmentService } from '../../services/outgoingdocumentshipment';
import {
  CargoCompanyLabels,
  OutgoingDocumentShipmentModel,
  ShipmentStatusEnum,
  ShipmentStatusLabels
} from '../../models/shipment.model';

type ShipmentRow = OutgoingDocumentShipmentModel & {
  companyLabel: string;
  recipientLabel: string;
  statusLabel: string;
  documentCount: number;
};

const STATUS_BADGE: Record<number, string> = {
  [ShipmentStatusEnum.KargoyaVerildi]: 'badge-soft-info',
  [ShipmentStatusEnum.Yolda]: 'badge-soft-primary',
  [ShipmentStatusEnum.TeslimEdildi]: 'badge-soft-success',
  [ShipmentStatusEnum.Iade]: 'badge-soft-danger',
};

const STATUS_ICON: Record<number, string> = {
  [ShipmentStatusEnum.KargoyaVerildi]: 'inventory_2',
  [ShipmentStatusEnum.Yolda]: 'local_shipping',
  [ShipmentStatusEnum.TeslimEdildi]: 'task_alt',
  [ShipmentStatusEnum.Iade]: 'undo',
};

/** <input type="datetime-local"> değeri (yerel saat, saniyesiz) */
function toLocalInput(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

/**
 * Kargo Takip: kargoya / postaya verilmiş giden evrak paketlerinin listesi ve durumlarının
 * (Yolda, Teslim Edildi, İade) güncellenmesi. Teslim ve iade backend'de evrak işlem
 * geçmişine yazıldığından bu iki durum son durumdur; sonrasında paket yalnızca görüntülenir.
 */
@Component({
  imports: [GenericModel, FlexiGridModule, FormsModule, DatePipe],
  templateUrl: './kargo-takip.html',
  styleUrl: './kargo-takip.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class KargoTakip {
  readonly #shipments = inject(OutgoingDocumentShipmentService);
  readonly #common = inject(Common);
  readonly #roles = inject(RoleService);
  readonly #router = inject(Router);

  readonly Status = ShipmentStatusEnum;
  readonly statusLabels: Record<number, string> = ShipmentStatusLabels;
  readonly statusBadge = STATUS_BADGE;
  readonly statusIcon = STATUS_ICON;
  readonly statusOptions = [
    ShipmentStatusEnum.KargoyaVerildi,
    ShipmentStatusEnum.Yolda,
    ShipmentStatusEnum.TeslimEdildi,
    ShipmentStatusEnum.Iade,
  ];

  // ---- Liste ----
  readonly shipments = signal<OutgoingDocumentShipmentModel[]>([]);
  readonly loading = signal(false);
  /** GetAll uç noktası backend'de henüz yok (404 / 405): liste yerine bilgi kutusu gösterilir */
  readonly listUnavailable = signal(false);
  readonly listFailed = signal(false);
  /** 0: tüm durumlar */
  readonly statusFilter = signal<number>(0);
  showFilters = false;

  readonly rows = computed<ShipmentRow[]>(() =>
    [...this.shipments()]
      .sort((a, b) => new Date(b.sentDate ?? 0).getTime() - new Date(a.sentDate ?? 0).getTime())
      .map(s => ({
        ...s,
        companyLabel: s.cargoCompanyName || CargoCompanyLabels[s.cargoCompany] || '-',
        recipientLabel: s.externalInstitutionName || s.recipientName || '-',
        statusLabel: s.statusName || ShipmentStatusLabels[s.status] || '-',
        documentCount: s.items?.length ?? 0,
      }))
  );

  readonly filteredRows = computed(() => {
    const status = this.statusFilter();
    return status ? this.rows().filter(r => r.status === status) : this.rows();
  });

  readonly counts = computed(() => {
    const counts: Record<number, number> = {};
    for (const r of this.rows()) counts[r.status] = (counts[r.status] ?? 0) + 1;
    return counts;
  });

  constructor() {
    this.load();
  }

  // Yönetici, Giden Evrak ve Gelen Evrak tüm paketleri; diğer roller kendi biriminin paketlerini görür
  load(): void {
    const departmentId = this.#roles.hasAny(['Yönetici', 'Giden Evrak', 'Gelen Evrak'])
      ? undefined
      : this.#common.user()?.departmentId || undefined;

    this.loading.set(true);
    this.listFailed.set(false);
    this.#shipments.getAll(departmentId).subscribe({
      next: list => {
        this.shipments.set(list ?? []);
        this.listUnavailable.set(false);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.shipments.set([]);
        this.listUnavailable.set(err.status === 404 || err.status === 405);
        this.listFailed.set(!this.listUnavailable());
        this.loading.set(false);
      }
    });
  }

  // ---- Takip numarasıyla arama ----
  readonly trackingQuery = signal('');
  readonly trackingSearching = signal(false);
  readonly trackingNotFound = signal(false);

  async searchTracking(): Promise<void> {
    const query = this.trackingQuery().trim();
    if (!query) return;

    // Listede varsa sunucuya gitmeden açılır
    const local = this.rows().find(r => r.trackingNumber?.toLocaleLowerCase('tr') === query.toLocaleLowerCase('tr'));
    if (local) {
      this.trackingNotFound.set(false);
      this.open(local);
      return;
    }

    this.trackingSearching.set(true);
    this.trackingNotFound.set(false);
    try {
      const found = await firstValueFrom(this.#shipments.findByTrackingNumber(query));
      if (found) this.open(found);
      else this.trackingNotFound.set(true);
    } catch {
      this.trackingNotFound.set(true);
    } finally {
      this.trackingSearching.set(false);
    }
  }

  // ---- Detay / durum güncelleme popup'ı ----
  readonly selected = signal<OutgoingDocumentShipmentModel | null>(null);
  readonly formStatus = signal<number>(ShipmentStatusEnum.KargoyaVerildi);
  readonly formDeliveredDate = signal('');
  readonly formCost = signal<number | null>(null);
  readonly formNotes = signal('');
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);

  /** Teslim Edildi ve İade son durumlardır; paket yalnızca görüntülenir */
  readonly isFinal = computed(() => {
    const s = this.selected();
    return !!s && (s.status === ShipmentStatusEnum.TeslimEdildi || s.status === ShipmentStatusEnum.Iade);
  });

  readonly selectedCompany = computed(() => {
    const s = this.selected();
    return s ? (s.cargoCompanyName || CargoCompanyLabels[s.cargoCompany] || '-') : '';
  });

  open(shipment: OutgoingDocumentShipmentModel): void {
    // Eski kayıtlarda items boş gelebilir
    this.selected.set({ ...shipment, items: shipment.items ?? [] });
    this.formStatus.set(shipment.status);
    this.formDeliveredDate.set(shipment.deliveredDate ? toLocalInput(new Date(shipment.deliveredDate)) : '');
    this.formCost.set(shipment.cost ?? null);
    this.formNotes.set(shipment.notes ?? '');
    this.saveError.set(null);
  }

  close(): void {
    this.selected.set(null);
  }

  onStatusChange(status: number): void {
    this.formStatus.set(Number(status));
    // Teslim tarihi boşsa şimdiki zamanla doldurulur; kullanıcı değiştirebilir
    if (Number(status) === ShipmentStatusEnum.TeslimEdildi && !this.formDeliveredDate()) {
      this.formDeliveredDate.set(toLocalInput(new Date()));
    }
  }

  async save(): Promise<void> {
    const s = this.selected();
    if (!s || this.isFinal() || this.saving()) return;

    const status = this.formStatus();
    if (status === ShipmentStatusEnum.TeslimEdildi && !this.formDeliveredDate()) {
      this.saveError.set('Teslim tarihini girin.');
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);
    try {
      const updated = await firstValueFrom(this.#shipments.update({
        id: s.id,
        status: status !== s.status ? status : null,
        deliveredDate: status === ShipmentStatusEnum.TeslimEdildi
          ? new Date(this.formDeliveredDate()).toISOString()
          : null,
        cost: this.formCost(),
        notes: this.formNotes(),
        updatedUserId: this.#common.user()?.id ?? null,
      }));
      this.shipments.update(list => list.map(x => x.id === updated.id ? updated : x));
      this.close();
    } catch (err) {
      // Genel hata toast'ı interceptor'dan gelir; popup açık kalır
      const body = (err as HttpErrorResponse)?.error;
      const message = body?.message ?? body?.errorMessages?.[0];
      this.saveError.set(typeof message === 'string' && message ? message : 'Kargo kaydı güncellenemedi.');
    } finally {
      this.saving.set(false);
    }
  }

  goToOutgoingDocument(outgoingDocumentId: string): void {
    if (!outgoingDocumentId) return;
    this.close();
    this.#router.navigate(['/gidenevrak/outgoing/create', outgoingDocumentId]);
  }
}
