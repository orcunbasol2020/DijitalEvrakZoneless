import { ChangeDetectionStrategy, Component, inject, OnInit, OnDestroy, signal, ViewEncapsulation, computed } from '@angular/core';
import GenericModel from '../../../components/generic-model/generic-model';
import { QRCodeComponent } from 'angularx-qrcode';
import { CommonModule } from '@angular/common';
import { FlexiToastService } from 'flexi-toast';
import { FormsModule, FormControl, ReactiveFormsModule } from '@angular/forms';
import { DocumentAllocation } from '../../services/documentallocation';
import { Common } from '../../services/common';
import { IncomingDocumentService } from '../../services/incomingdocument';
import { AllocationFlowComponent } from '../dynamics/allocation-flow/allocation-flow';
import { DocumentAllocationModel } from '../../models/documentallocation.model';
import { AllocationStatusEnum } from '../../models/allocationstatus.model';
import { httpResource } from '@angular/common/http';
import { UserModel } from '../users/users';
import { SimpleAutocompleteComponent } from '../simpleautocomplete/simpleautocomplete';
import { SecurityDegreeLabels, SecurityDegreeBadgeClass } from '../../models/securitydegree.model';
import { actionRequiredLabel, actionRequiredBadgeClass } from '../../models/actionrequired.model';


@Component({
  standalone: true,
  imports: [
    GenericModel,
    QRCodeComponent,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AllocationFlowComponent,
    SimpleAutocompleteComponent
  ],
  templateUrl: './zimmet.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Zimmet implements OnInit, OnDestroy {
  // Şablondaki Zimmetle / Teslim Et butonları için.
  readonly AllocationStatus = AllocationStatusEnum;

  // === QR READER FIX ===
  private buffer: string = '';
  private keydownHandler: any;
  allocations = signal<DocumentAllocationModel[]>([]);
  documentDetail = signal<any | null>(null);
  securityDegreeMap: Record<number, string> = SecurityDegreeLabels;
  securityDegreeStyle: Record<number, string> = SecurityDegreeBadgeClass;
  readonly actionRequiredLabel = actionRequiredLabel;
  readonly actionRequiredBadgeClass = actionRequiredBadgeClass;

  documents = Array.from({ length: 1 }, (_, i) => `2025/2525567/${i + 1}`);
  readonly #toast = inject(FlexiToastService);
  readonly #common = inject(Common);
  readonly user = computed(() => this.#common.user());
  private allocationService = inject(DocumentAllocation);
  private incomingDocumentService = inject(IncomingDocumentService);

  detailsVisible = signal(false);
  alertVisible = signal(true);
  backButtonVisible = signal(false);
  saveModalVisible = signal(false);
  saveModalDetailVisible = signal(false);
  scannedDocumentNo = signal<string | null>(null);
  currentDocumentNo = signal<string | null>(null);
  id!: string | null;
  doc = signal<string>('');
  manualEntryValue = signal<string>('');
  zimmetType: 'self' | 'other' = 'other';
  currentUserName = this.user()?.name + ' ' + this.user()?.surname;

  // Belge aranırken (QR/manuel) ve zimmetleme kaydedilirken gösterilecek yükleniyor durumları
  loading = signal(false);
  saving = signal(false);
  // Belge bulunamadı vb. durumlarda kullanıcıya toast'a ek olarak ekranda da gösterilecek mesaj
  lookupErrorMessage = signal<string | null>(null);

  readonly personControl = new FormControl<{ id: string, name: string } | null>(null);

  readonly usersResult = httpResource<UserModel[]>(() => "api/Users/GetAll");
  readonly personList = computed(() =>
    (this.usersResult.value() ?? [])
      .filter(x => !x.isDeleted && x.isActive)
  );
  readonly personOptions = computed(() =>
    this.personList()
      .filter((p): p is UserModel & { id: string } => !!p.id)
      .map(p => ({
        id: p.id,
        name: `${p.name} ${p.surname} (${p.departmentShortName})`
      }))
  );

  // Aktif zimmet zaten giriş yapan kullanıcının üzerindeyse
  // "Zimmeti Devir Al" seçeneği anlamsız olduğundan gizlenir.
  readonly isActiveOnCurrentUser = computed(() => {
    const currentUserId = this.user()?.id;
    if (!currentUserId) return false;
    return this.allocations().some(a => a.isActive && a.userId === currentUserId);
  });

  // Evrağın şu anki zimmet sahibi; kullanıcı işlem yapmadan önce bunu görebilsin diye üstte gösterilir.
  readonly activeAllocation = computed(() =>
    this.allocations().find(a => a.isActive) ?? null
  );

  ngOnInit() {
    this.id = this.incomingDocumentService.currentZimmetDocumentId;

    if (this.id) {
      this.detailsVisible.set(true);
      this.saveModalVisible.set(true);
      this.alertVisible.set(false);
      this.backButtonVisible.set(true);
      this.saveModalDetailVisible.set(false);

      this.getir(this.id);
    }
    // === QR READER SETUP ===
    this.keydownHandler = (e: KeyboardEvent) => {
      this.handleKeydown(e);
    };

    window.addEventListener('keydown', this.keydownHandler);
  }

  ngOnDestroy() {
    // === QR CLEANUP ===
    window.removeEventListener('keydown', this.keydownHandler);
  }

  private handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      this.onQrScanned(this.buffer.trim());
      this.buffer = '';
    } else {
      this.buffer += e.key;
    }
  }

  // Manuel giriş alanındaki "Zimmetleme Ekranına Geç" butonu için
  submitManualEntry() {
    const documentNumber = this.manualEntryValue().trim();
    this.onQrScanned(documentNumber);
    this.manualEntryValue.set('');
    this.buffer = '';
  }

  // QR kod okunduğunda tetiklenecek fonksiyon
  private onQrScanned(documentNumber: string) {

    if (!documentNumber) {
      this.#toast.showToast('Uyarı', 'Geçersiz QR', 'warning');
      return;
    }

    const currentUserId = this.user()?.id;

    if (!currentUserId) {
      this.#toast.showToast('Hata', 'Kullanıcı bulunamadı', 'error');
      return;
    }

    this.lookupErrorMessage.set(null);
    this.loading.set(true);

    // Önce belgeyi bul
    this.incomingDocumentService.GetByQrCode(documentNumber)
      .subscribe({
        next: doc => {
          this.loading.set(false);

          if (!doc?.id) {
            const message = `"${documentNumber}" numaralı belge bulunamadı. Lütfen numarayı kontrol edip tekrar deneyin.`;
            this.lookupErrorMessage.set(message);
            this.#toast.showToast('Hata', 'Belge bulunamadı', 'error');
            return;
          }
          const documentId = doc.id;
          this.documentDetail.set(doc); // dokuman detaylari eklendi
          this.currentDocumentNo.set(documentId);
          this.loadAllocations(documentId);
          this.scannedDocumentNo.set(documentNumber);
          this.saveModalVisible.set(false);
          this.detailsVisible.set(true);
          this.alertVisible.set(false);
          this.saveModalDetailVisible.set(false);
          this.id = null;
          this.backButtonVisible.set(true);
        },
        error: () => {
          this.loading.set(false);
          this.lookupErrorMessage.set('Belge sorgulanırken bir hata oluştu. Lütfen tekrar deneyin.');
          this.#toast.showToast('Hata', 'Belge sorgulanamadı', 'error');
        }
      });
  }

  private Zimmetle(documentNumber: string, userId: string, createdUserId: string, status: AllocationStatusEnum) {
    const documentId = this.currentDocumentNo();
    if (!documentId) {
      console.error("Belge numarası bulunamadı");
      return;
    }
    this.saving.set(true);
    this.allocationService.createAllocation({
      incomingDocumentId: documentId,
      userId: userId,
      createdUserId: createdUserId,
      status: status,
      userType: 1,
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.#toast.showToast('Başarılı', 'Zimmetleme tamamlandı', 'success');
        this.personControl.setValue(null);
        this.zimmetType = 'other';
        this.loadAllocations(documentId);
      },
      error: () => {
        this.saving.set(false);
        this.#toast.showToast('Hata', 'Zimmetleme başarısız', 'error');
      }
    });
  }

  getir(id: string) {
    this.loading.set(true);
    this.incomingDocumentService.getIncomingDocumentByDocumentId(id)
      .subscribe({
        next: doc => {
          this.loading.set(false);

          if (!doc?.id) {
            this.#toast.showToast('Hata', 'Belge bulunamadı', 'error');
            return;
          }
          const documentId = doc.id;
          this.documentDetail.set(doc); // dokuman detaylari eklendi
          this.currentDocumentNo.set(documentId);
          this.loadAllocations(documentId);
          this.scannedDocumentNo.set(doc.qrCode ?? null);
          this.saveModalVisible.set(false);
          this.detailsVisible.set(true);
          this.alertVisible.set(false);
          this.saveModalDetailVisible.set(false);
          this.id = null;
        },
        error: () => {
          this.loading.set(false);
          this.#toast.showToast('Hata', 'Belge bulunamadı', 'error');
        }
      });
  }

  backToQrScan() {
    this.detailsVisible.set(false);
    this.saveModalVisible.set(false);
    this.scannedDocumentNo.set(null);
    this.incomingDocumentService.clearZimmetIncomingDocument();
    this.alertVisible.set(true);
    this.backButtonVisible.set(false);
    this.saveModalDetailVisible.set(false);
    this.lookupErrorMessage.set(null);
    this.personControl.setValue(null);
    this.zimmetType = 'other';
    this.id = null;
  }

  saveZimmet(status: AllocationStatusEnum) {
    const user = this.user();
    if (!user?.id) {
      console.error("Kullanıcı bulunamadı");
      return;
    }

    let personId: string;

    if (this.zimmetType === 'self') {
      personId = user.id;
    } else {
      const selectedPerson = this.personControl.value;
      if (!selectedPerson) {
        this.#toast.showToast('Hata', 'Lütfen personel seçiniz.', 'error');
        return;
      }
      personId = selectedPerson.id;
    }

    const documentNumber = this.scannedDocumentNo();
    if (!documentNumber) {
      console.error("Belge numarası bulunamadı");
      return;
    }
    this.Zimmetle(
      documentNumber,
      personId,
      user.id,
      status
    );
  }

  loadAllocations(documentId: string) {
    this.allocationService
      .getByDocumentId(documentId)
      .subscribe({
        next: (res) => {
          //console.log('API raw response:', res);
          const filtered = res?.filter(x => !x.isDeleted) ?? [];
          this.allocations.set(filtered); // signal ile değişiklik bildir
          //console.log('Filtered allocations:', this.allocations);
        },
        error: (err) => {
          console.error('Allocation API error:', err);
        }
      });
  }
}
