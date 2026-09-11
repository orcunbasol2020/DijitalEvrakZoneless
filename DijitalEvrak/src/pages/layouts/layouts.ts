import { ChangeDetectionStrategy, Component, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import Breadcrumb from './breadcrumb/breadcrumb';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { navigations } from '../../navigation';
import { SearchMenuPipe } from '../../pipes/search-menu-pipe';
import { FormsModule } from '@angular/forms';
import { Common } from '../../services/common';
import { initialUser } from '../users/users';
import { IncomingDocumentService } from '../../services/incomingdocument';
import { Sidebar } from './sidebar/sidebar/sidebar';
import { RoleService } from '../../services/role-service';
import { DocumentAllocation } from '../../services/documentallocation';


@Component({
  imports: [
    Breadcrumb,
    RouterLink,
    RouterLinkActive,
    Sidebar,
    FormsModule,
    RouterOutlet
  ],
  templateUrl: './layouts.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Layouts {
  readonly search = signal<string>("");
  readonly navigations = computed(() => navigations);
  readonly user = computed(() => this.#common.user());
  readonly #common = inject(Common);
  readonly #incomingDocumentService = inject(IncomingDocumentService);
  readonly pendingCount = signal<number>(0);
  private readonly router = inject(Router);
  readonly roleService = inject(RoleService);
  readonly isAdmin = computed(() => this.roleService.has('Yönetici'));
  readonly #allocationService = inject(DocumentAllocation);
  readonly transferredToMeCount = signal<number>(0);
  readonly transferCount = signal<number>(0);
  readonly totalNotificationCount = computed(() =>
    this.pendingCount() +
    this.transferredToMeCount() +
    this.transferCount()
  );

  constructor() {
    const userId = this.user()?.id;

    if (userId) {
      this.#incomingDocumentService
        .getPendingCount(userId)
        .subscribe(c => this.pendingCount.set(c));

      this.#allocationService
        .getActiveByUserId(userId)
        .subscribe(allocations => this.transferredToMeCount.set(allocations?.length ?? 0));

      this.#allocationService
        .getTransferCountByUserId(userId)
        .subscribe(c => this.transferCount.set(c));
    }
  }

  readonly userAvatar = computed(() => {
    const name = this.user()?.name ?? '';

    switch (name) {
      case 'Bülent':
        return 'assets/images/personel/bulent.jpg';
      case 'Tahsin':
        return 'assets/images/personel/tahsin.jpg';
      default:
        return 'assets/images/personel/oral.jpg';
    }
  });

public goToPendingScanList() {
  this.#incomingDocumentService.setIncomingDocumentSearchType('pending');
  this.router.navigateByUrl('/scanlist', { skipLocationChange: true }).then(() => {
    this.router.navigate(['/scanlist']);
  });
}


}
