import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DocumentAllocationModel } from '../../../models/documentallocation.model';

@Component({
  selector: 'app-allocation-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './allocation-card.html'
})
export class AllocationCardComponent {
  @Input() item!: DocumentAllocationModel;

  get source(): 'EvrakTakip' | 'Atlas' {
    const raw = this.item.source;
    if (raw === 'Atlas' || raw === 'EvrakTakip') return raw;
    // Backend bu alanı şu an sayısal bir enum olarak gönderiyor; gözlemlenen
    // tek değer olan 1, EvrakTakip'e karşılık geliyor (bkz. model dosyasındaki not).
    if (typeof raw === 'number') return raw === 1 ? 'EvrakTakip' : 'Atlas';
    return 'EvrakTakip';
  }

  get isDelivered(): boolean {
    return this.item.status === 3;
  }

  get dotClass(): string {
    if (this.isDelivered) return 'is-delivered';
    return this.item.isActive ? 'is-active' : 'is-past';
  }

  get dotIcon(): string {
    if (this.isDelivered) return 'hand_package';
    return this.item.isActive ? 'person' : 'person_off';
  }

  get statusLabel(): string {
    if (this.isDelivered) return 'Teslim Edildi';
    return this.item.isActive ? 'Aktif Zimmet' : 'Devredildi';
  }

  get statusBadgeClass(): string {
    if (this.isDelivered) return 'bg-primary-subtle text-primary border border-primary-subtle';
    return this.item.isActive
      ? 'bg-success-subtle text-success border border-success-subtle'
      : 'bg-secondary-subtle text-secondary border border-secondary-subtle';
  }

  get sourceLabel(): string {
    return this.source === 'Atlas' ? 'Atlas' : 'Evrak Takip';
  }

  get metaLine(): string {
    return this.item.isPreRegistered ? 'Ön Kayıt' : '';
  }
}
