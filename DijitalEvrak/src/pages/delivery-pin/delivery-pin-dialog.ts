import { ChangeDetectionStrategy, Component, ElementRef, OnInit, ViewChild, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FlexiToastService } from 'flexi-toast';
import { DeliveryPinService } from '../../services/delivery-pin';
import { DELIVERY_PIN_MAX_LENGTH, DELIVERY_PIN_MIN_LENGTH, DeliveryPinStatus } from '../../models/allocationrequest.model';

/**
 * Kişisel teslim PIN'i belirleme / değiştirme penceresi. Kişi kendi oturumunda olduğu için eski PIN sorulmaz;
 * PIN evrak biriminde zimmeti memurun ekranında yerinde teslim alırken girilir.
 */
@Component({
  selector: 'app-delivery-pin-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './delivery-pin-dialog.html',
  styleUrls: ['../in-person-delivery/in-person-delivery.css', './delivery-pin-dialog.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeliveryPinDialogComponent implements OnInit {
  private readonly pinService = inject(DeliveryPinService);
  readonly #toast = inject(FlexiToastService);

  /** Kapanınca; PIN kaydedildiyse true */
  readonly closed = output<boolean>();

  readonly pinMinLength = DELIVERY_PIN_MIN_LENGTH;
  readonly pinMaxLength = DELIVERY_PIN_MAX_LENGTH;

  readonly status = signal<DeliveryPinStatus | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly pin = signal('');
  readonly confirm = signal('');
  readonly errorText = signal<string | null>(null);

  readonly lockedUntil = computed(() => {
    const value = this.status()?.lockedUntilUtc;
    const date = value ? new Date(value) : null;
    return date && date > new Date() ? date : null;
  });

  readonly canSave = computed(() =>
    !this.saving() && this.pin().length >= DELIVERY_PIN_MIN_LENGTH && this.confirm().length >= DELIVERY_PIN_MIN_LENGTH);

  @ViewChild('pinInput') private pinInput?: ElementRef<HTMLInputElement>;

  ngOnInit(): void {
    this.pinService.getStatus().subscribe({
      next: status => {
        this.status.set(status);
        this.loading.set(false);
        setTimeout(() => this.pinInput?.nativeElement.focus());
      },
      error: err => {
        console.error('Teslim PIN durumu alınamadı:', err);
        this.loading.set(false);
        setTimeout(() => this.pinInput?.nativeElement.focus());
      }
    });
  }

  onInput(event: Event, target: 'pin' | 'confirm'): void {
    const el = event.target as HTMLInputElement;
    const digits = el.value.replace(/\D/g, '').slice(0, DELIVERY_PIN_MAX_LENGTH);
    if (el.value !== digits) el.value = digits;
    (target === 'pin' ? this.pin : this.confirm).set(digits);
    this.errorText.set(null);
  }

  save(): void {
    if (!this.canSave()) return;

    if (this.pin() !== this.confirm()) {
      this.errorText.set('İki PIN birbirini tutmuyor');
      return;
    }

    this.saving.set(true);
    this.pinService.set(this.pin()).subscribe({
      next: res => {
        this.saving.set(false);
        if (res?.data?.saved) {
          this.#toast.showToast('Başarılı', res.message || "Teslim PIN'iniz kaydedildi", 'success');
          this.closed.emit(true);
        } else {
          this.errorText.set(res?.message || 'PIN kaydedilemedi');
        }
      },
      error: err => {
        this.saving.set(false);
        console.error('Teslim PIN kaydedilemedi:', err);
        this.errorText.set('PIN kaydedilemedi. Lütfen tekrar deneyin.');
      }
    });
  }

  close(): void {
    if (!this.saving()) this.closed.emit(false);
  }
}
