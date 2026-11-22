import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { AllocationRequestService } from '../../services/allocationrequest';
import {
  AllocationRequestActionResultEnum,
  AllocationRequestModel,
  DELIVERY_PIN_MAX_LENGTH,
  DELIVERY_PIN_MIN_LENGTH,
  DeliveryPinCheckResultEnum,
  InPersonPending,
  allocationRequestOperationLabel
} from '../../models/allocationrequest.model';
import { SimpleAutocompleteComponent } from '../simpleautocomplete/simpleautocomplete';

export interface InPersonPersonOption {
  id: string;
  name: string;
  hint?: string | null;
}

type Phase = 'pick' | 'loading' | 'ready' | 'empty' | 'noPin' | 'locked' | 'error' | 'success';

/**
 * Evrak biriminde yerinde teslim penceresi: teslim alan kişi, evrak memurunun ekranında kişisel
 * teslim PIN'ini girerek evrak biriminden bekleyen zimmetlerini onaylar. Kişi verilmezse önce seçilir
 * ("Teslim Ver"); zimmet sonrası açıldığında yalnızca o işlemde onaya gönderilen talepler işaretli gelir.
 */
@Component({
  selector: 'app-in-person-delivery',
  standalone: true,
  imports: [CommonModule, SimpleAutocompleteComponent],
  templateUrl: './in-person-delivery.html',
  styleUrl: './in-person-delivery.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InPersonDeliveryComponent implements OnInit, OnDestroy {
  private readonly allocationRequestService = inject(AllocationRequestService);

  /** Teslim alacak kişi; boşsa pencere kişi seçimiyle açılır */
  readonly receiverUserId = input<string | null>(null);
  /** Zimmet sonrası: yalnızca bu talepler işaretli gelir; boşsa bekleyenlerin tümü */
  readonly preselectedRequestIds = input<string[] | null>(null);
  /** Kişi seçimi için seçenekler (ör. rolü olan personel) */
  readonly personOptions = input<InPersonPersonOption[]>([]);
  readonly personsLoading = input(false);

  /** Pencere kapanınca; onaylanan evrak sayısıyla */
  readonly closed = output<number>();

  readonly pinMinLength = DELIVERY_PIN_MIN_LENGTH;
  readonly pinMaxLength = DELIVERY_PIN_MAX_LENGTH;
  readonly operationLabel = allocationRequestOperationLabel;

  readonly phase = signal<Phase>('pick');
  readonly pending = signal<InPersonPending | null>(null);
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly pin = signal('');
  readonly submitting = signal(false);
  readonly pinError = signal<string | null>(null);
  readonly errorText = signal<string | null>(null);
  readonly lockedUntil = signal<Date | null>(null);
  readonly approvedCount = signal(0);
  readonly failedMessages = signal<string[]>([]);

  readonly personControl = new FormControl<{ id: string; name: string } | null>(null);
  private readonly pickedPerson = toSignal(this.personControl.valueChanges, { initialValue: null });

  readonly requests = computed(() => this.pending()?.requests ?? []);
  readonly selectedCount = computed(() => this.selectedIds().size);
  readonly allSelected = computed(() =>
    this.requests().length > 0 && this.requests().every(r => this.selectedIds().has(r.id)));
  readonly canSubmit = computed(() =>
    !this.submitting() && this.selectedCount() > 0 && this.pin().length >= DELIVERY_PIN_MIN_LENGTH);

  @ViewChild('pinInput') private pinInput?: ElementRef<HTMLInputElement>;
  private autoCloseTimer: ReturnType<typeof setTimeout> | null = null;

  // Kişi seçilince bekleyen talepleri yükle
  private readonly onPick = effect(() => {
    const person = this.pickedPerson();
    if (person?.id) this.load(person.id);
  });

  ngOnInit(): void {
    const receiverId = this.receiverUserId();
    if (receiverId) this.load(receiverId);
  }

  ngOnDestroy(): void {
    if (this.autoCloseTimer) clearTimeout(this.autoCloseTimer);
  }

  private load(receiverUserId: string): void {
    this.phase.set('loading');
    this.errorText.set(null);
    this.pin.set('');
    this.pinError.set(null);

    this.allocationRequestService.getInPersonPending(receiverUserId).subscribe({
      next: res => {
        const data = res?.data ?? null;
        if (!data) {
          this.errorText.set(res?.message || 'Teslim bilgisi alınamadı');
          this.phase.set('error');
          return;
        }

        this.pending.set(data);

        const preselected = this.preselectedRequestIds();
        const ids = data.requests
          .map(r => r.id)
          .filter(id => !preselected?.length || preselected.some(p => p.toLowerCase() === id.toLowerCase()));
        this.selectedIds.set(new Set(ids.length ? ids : data.requests.map(r => r.id)));

        const locked = data.lockedUntilUtc ? new Date(data.lockedUntilUtc) : null;
        this.lockedUntil.set(locked);

        if (!data.requests.length) this.phase.set('empty');
        else if (!data.hasPin) this.phase.set('noPin');
        else if (locked && locked > new Date()) this.phase.set('locked');
        else {
          this.phase.set('ready');
          this.focusPinSoon();
        }
      },
      error: err => {
        console.error('Yerinde teslim bilgisi alınamadı:', err);
        this.errorText.set('Teslim bilgisi alınamadı. Lütfen tekrar deneyin.');
        this.phase.set('error');
      }
    });
  }

  changePerson(): void {
    this.personControl.setValue(null);
    this.pending.set(null);
    this.phase.set('pick');
  }

  toggle(request: AllocationRequestModel): void {
    this.selectedIds.update(set => {
      const next = new Set(set);
      if (next.has(request.id)) next.delete(request.id);
      else next.add(request.id);
      return next;
    });
  }

  toggleAll(): void {
    this.selectedIds.set(this.allSelected() ? new Set() : new Set(this.requests().map(r => r.id)));
  }

  isSelected(request: AllocationRequestModel): boolean {
    return this.selectedIds().has(request.id);
  }

  // Yalnızca rakam; en fazla 6 hane
  onPinInput(event: Event): void {
    const el = event.target as HTMLInputElement;
    const digits = el.value.replace(/\D/g, '').slice(0, DELIVERY_PIN_MAX_LENGTH);
    if (el.value !== digits) el.value = digits;
    this.pin.set(digits);
    this.pinError.set(null);
  }

  submit(): void {
    const data = this.pending();
    if (!data || !this.canSubmit()) return;

    this.submitting.set(true);
    this.pinError.set(null);

    this.allocationRequestService.approveInPerson(data.receiverUserId, [...this.selectedIds()], this.pin()).subscribe({
      next: res => {
        this.submitting.set(false);
        const result = res?.data;

        if (!result) {
          this.errorText.set(res?.message || 'Teslim yapılamadı');
          this.phase.set('error');
          return;
        }

        switch (Number(result.pinResult)) {
          case DeliveryPinCheckResultEnum.Dogru: {
            this.approvedCount.set(result.approvedCount);
            this.failedMessages.set((result.results ?? [])
              .filter(r => Number(r.result) !== AllocationRequestActionResultEnum.Basarili)
              .map(r => r.message));
            this.phase.set('success');
            // Sorunsuz teslimde pencere kendiliğinden kapanır; işlenemeyen evrak varsa okunsun diye açık kalır
            if (!this.failedMessages().length && result.approvedCount > 0)
              this.autoCloseTimer = setTimeout(() => this.close(), 2500);
            break;
          }
          case DeliveryPinCheckResultEnum.Tanimsiz:
            this.phase.set('noPin');
            break;
          case DeliveryPinCheckResultEnum.Kilitli:
            this.lockedUntil.set(result.lockedUntilUtc ? new Date(result.lockedUntilUtc) : null);
            this.phase.set('locked');
            break;
          default:
            this.pin.set('');
            if (this.pinInput) this.pinInput.nativeElement.value = '';
            this.pinError.set(`PIN hatalı. Kalan deneme hakkı: ${result.remainingAttempts ?? 0}`);
            this.focusPinSoon();
        }
      },
      error: err => {
        this.submitting.set(false);
        console.error('Yerinde teslim yapılamadı:', err);
        this.pinError.set('Teslim yapılamadı. Lütfen tekrar deneyin.');
      }
    });
  }

  close(): void {
    if (this.submitting()) return;
    if (this.autoCloseTimer) clearTimeout(this.autoCloseTimer);
    this.closed.emit(this.phase() === 'success' ? this.approvedCount() : 0);
  }

  requestLabel(r: AllocationRequestModel): string {
    return r.qrCode || r.orginalNo || '(numarasız)';
  }

  initials(fullName: string | null | undefined): string {
    const parts = (fullName ?? '').replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return `${parts[0].charAt(0)}${last}`.toLocaleUpperCase('tr');
  }

  private focusPinSoon(): void {
    setTimeout(() => this.pinInput?.nativeElement.focus());
  }
}
