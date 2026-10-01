import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal, ViewEncapsulation } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { Common } from '../../../services/common';
import { IncomingDocumentService } from '../../../services/incomingdocument';
import { OutgoingDocumentService } from '../../../services/outgoingdocument';
import { DocumentAllocation } from '../../../services/documentallocation';
import { AllocationRequestService } from '../../../services/allocationrequest';
import { IncomingDocumentTodayStats } from '../../../models/dashboard/IncomingDocumentTodayStats.model';
import { UserModel } from '../../users/users';
import { normalizeRoleName, roleIcon } from '../../../services/role-service';

@Component({
  selector: 'app-birim-dashboard',
  standalone: true,
  imports: [CommonModule, DatePipe, DecimalPipe, RouterLink],
  templateUrl: './birim-dashboard.html',
  styleUrl: '../dashboard.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class BirimDashboard implements OnInit {
  private readonly common = inject(Common);
  private readonly incomingDocumentService = inject(IncomingDocumentService);
  private readonly outgoingDocumentService = inject(OutgoingDocumentService);
  private readonly documentAllocation = inject(DocumentAllocation);

  readonly user = computed(() => this.common.user());

  /** Üst şerit başlığı; Birim Yöneticisi paneli kendi başlığını verir. */
  readonly heading = input('Birim Evrak Paneli');

  // Üst şerit
  readonly today = new Date();
  readonly lastUpdated = signal(new Date());

  readonly statsSignal = signal<IncomingDocumentTodayStats>({ todayCount: 0, changePercent: 0 });

  readonly outgoingResult = this.outgoingDocumentService.getAll();
  readonly outgoingCount = computed(() => this.outgoingResult.value()?.length ?? 0);

  readonly zimmetCount = signal<number>(0);

  // Bekleyenler: zimmet onayı bekleyenler ortak listeden (zil menüsüyle birlikte güncellenir),
  // teslim bekleyenler Birim Gelen Evrakları ekranındaki süzgeçle aynı sayım
  private readonly allocationRequests = inject(AllocationRequestService);
  readonly approvalCount = computed(() => this.allocationRequests.pendingForMe().length);
  readonly deliveryPendingCount = signal<number>(0);
  readonly pendingTotal = computed(() => this.approvalCount() + this.deliveryPendingCount());

  // Birimdeki kullanıcılar: Users/GetAll opsiyonel departmentId parametresiyle
  // sunucu tarafında birime göre filtrelenir. departmentId yoksa istek atılmaz.
  readonly usersResult = httpResource<UserModel[]>(() => {
    const departmentId = this.user()?.departmentId;
    return departmentId ? `api/Users/GetAll?departmentId=${encodeURIComponent(departmentId)}` : undefined;
  });
  readonly usersLoading = computed(() => this.usersResult.isLoading());
  readonly departmentUsers = computed<UserModel[]>(() => {
    const departmentId = this.user()?.departmentId;
    if (!departmentId) return [];
    return (this.usersResult.value() ?? [])
      .filter(u => !u.isDeleted)
      .map(u => ({ ...u, roles: (u.roles ?? []).map(r => ({ ...r, name: normalizeRoleName(r.name) })) }))
      .sort((a, b) => this.roleRank(a) - this.roleRank(b)
        || `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`, 'tr'));
  });

  /** Liste sırası: önce Yönetici, sonra Birim Yöneticisi, ardından diğerleri. */
  private roleRank(u: UserModel): number {
    const names = (u.roles ?? []).map(r => r.name);
    if (names.includes('Yönetici')) return 0;
    if (names.includes('Birim Yöneticisi')) return 1;
    return 2;
  }
  readonly departmentActiveUserCount = computed(() => this.departmentUsers().filter(u => u.isActive).length);

  ngOnInit() {
    this.loadAll();
  }

  getInitials(u: UserModel): string {
    const first = (u.name ?? '').trim().charAt(0);
    const last = (u.surname ?? '').trim().charAt(0);
    return `${first}${last}`.toLocaleUpperCase('tr');
  }

  isAdmin(u: UserModel): boolean {
    return this.roleRank(u) === 0;
  }

  isUnitManager(u: UserModel): boolean {
    return this.roleRank(u) === 1;
  }

  roleIcon(name: string): string {
    return roleIcon(name);
  }

  isCurrentUser(u: UserModel): boolean {
    return !!u.id && u.id === this.user()?.id;
  }

  loadAll() {
    const userId = this.user()?.id;

    this.incomingDocumentService.loadTodayStats().then(stats => {
      if (stats) this.statsSignal.set(stats);
      this.lastUpdated.set(new Date());
    });

    this.outgoingResult.reload();
    this.usersResult.reload();

    if (userId) {
      this.documentAllocation.getActiveByUserId(userId).subscribe(list => this.zimmetCount.set(list?.length ?? 0));
      this.allocationRequests.refreshPendingForMe(userId).subscribe();
    }

    const departmentId = this.user()?.departmentId;
    if (departmentId) {
      this.incomingDocumentService.getDepartmentDeliveryStats(departmentId).subscribe({
        next: s => this.deliveryPendingCount.set(s.pending),
        error: err => console.error('Teslim bekleyen evraklar alınamadı:', err)
      });
    }
  }
}
