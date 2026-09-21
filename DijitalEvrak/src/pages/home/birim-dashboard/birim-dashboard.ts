import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { Common } from '../../../services/common';
import { IncomingDocumentService } from '../../../services/incomingdocument';
import { OutgoingDocumentService } from '../../../services/outgoingdocument';
import { DocumentAllocation } from '../../../services/documentallocation';
import { IncomingDocumentTodayStats } from '../../../models/dashboard/IncomingDocumentTodayStats.model';
import { UserModel } from '../../users/users';

const AVATAR_CLASSES = ['avatar-indigo', 'avatar-teal', 'avatar-orange', 'avatar-rose', 'avatar-blue'];

@Component({
  selector: 'app-birim-dashboard',
  standalone: true,
  imports: [CommonModule, DecimalPipe, RouterLink],
  templateUrl: './birim-dashboard.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class BirimDashboard implements OnInit {
  private readonly common = inject(Common);
  private readonly incomingDocumentService = inject(IncomingDocumentService);
  private readonly outgoingDocumentService = inject(OutgoingDocumentService);
  private readonly documentAllocation = inject(DocumentAllocation);

  readonly user = computed(() => this.common.user());

  readonly statsSignal = signal<IncomingDocumentTodayStats>({ todayCount: 0, changePercent: 0 });

  readonly outgoingResult = this.outgoingDocumentService.getAll();
  readonly outgoingCount = computed(() => this.outgoingResult.value()?.length ?? 0);

  readonly zimmetCount = signal<number>(0);

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
      .sort((a, b) => `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`, 'tr'));
  });
  readonly departmentActiveUserCount = computed(() => this.departmentUsers().filter(u => u.isActive).length);

  ngOnInit() {
    this.loadAll();
  }

  getInitials(u: UserModel): string {
    const first = (u.name ?? '').trim().charAt(0);
    const last = (u.surname ?? '').trim().charAt(0);
    return `${first}${last}`.toLocaleUpperCase('tr');
  }

  getAvatarClass(u: UserModel): string {
    const key = u.id ?? u.userName ?? '';
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
    return AVATAR_CLASSES[Math.abs(hash) % AVATAR_CLASSES.length];
  }

  isCurrentUser(u: UserModel): boolean {
    return !!u.id && u.id === this.user()?.id;
  }

  loadAll() {
    const userId = this.user()?.id;

    this.incomingDocumentService.loadTodayStats().then(stats => {
      if (stats) this.statsSignal.set(stats);
    });

    this.outgoingResult.reload();
    this.usersResult.reload();

    if (userId) {
      this.documentAllocation.getActiveByUserId(userId).subscribe(list => this.zimmetCount.set(list?.length ?? 0));
    }
  }
}
