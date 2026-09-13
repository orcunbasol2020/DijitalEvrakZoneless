import { ChangeDetectionStrategy, Component, inject, OnInit, OnDestroy, signal, ViewEncapsulation, computed } from '@angular/core';
import GenericModel from '../../../components/generic-model/generic-model';
import { QRCodeComponent } from 'angularx-qrcode';
import { CommonModule } from '@angular/common';
import { FlexiToastService } from 'flexi-toast';
import { FormsModule } from '@angular/forms';
import { DocumentAllocation } from '../../services/documentallocation';
import { Common } from '../../services/common';
import { IncomingDocumentService } from '../../services/incomingdocument';
import { AllocationFlowComponent } from '../dynamics/allocation-flow/allocation-flow';
import { DocumentAllocationModel } from '../../models/documentallocation.model';
import { httpResource } from '@angular/common/http';
import { UserModel } from '../users/users';


@Component({
  standalone: true,
  imports: [
    GenericModel,
    QRCodeComponent,
    CommonModule,
    FormsModule,
    AllocationFlowComponent
  ],
  templateUrl: './zimmet.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Zimmet implements OnInit, OnDestroy {

  // === QR READER FIX ===
  private buffer: string = '';
  private keydownHandler: any;
  allocations = signal<DocumentAllocationModel[]>([]);
  documentDetail = signal<any | null>(null);
  securityDegreeMap: Record<number, string> = {
    1: 'Hizmete Özel',
    2: 'Gizli',
    3: 'Çok Gizli',
    4: 'Kripto'
  };

  securityDegreeStyle: Record<number, string> = {
    1: 'bg-warning-subtle text-warning border border-warning-subtle',
    2: 'bg-warning text-dark',
    3: 'bg-danger',
    4: 'bg-dark'
  };

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
  selectedPersonId: string | null = null;
  currentUserName = this.user()?.name + ' ' + this.user()?.surname;

  readonly usersResult = httpResource<UserModel[]>(() => "api/Users/GetAll");
  readonly personList = computed(() =>
    (this.usersResult.value() ?? [])
      .filter(x => !x.isDeleted && x.isActive)
  );

  // Aktif zimmet zaten giriş yapan kullanıcının üzerindeyse
  // "Zimmeti Devir Al" seçeneği anlamsız olduğundan gizlenir.
  readonly isActiveOnCurrentUser = computed(() => {
    const currentUserId = this.user()?.id;
    if (!currentUserId) return false;
    return this.allocations().some(a => a.isActive && a.userId === currentUserId);
  });

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

    // Önce belgeyi bul
    this.incomingDocumentService.GetByQrCode(documentNumber)
      .subscribe(doc => {

        if (!doc?.id) {
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
      });
  }

  private Zimmetle(documentNumber: string, userId: string, createdUserId: string, status: string) {
    const documentId = this.currentDocumentNo();
    if (!documentId) {
      console.error("Belge numarası bulunamadı");
      return;
    }
    this.allocationService.createAllocation({
      incomingDocumentId: documentId,
      userId: userId,
      createdUserId: createdUserId,
      status: status,
      userType: 1,
    }).subscribe({
      next: () => {
        this.#toast.showToast('Başarılı', 'Zimmetleme tamamlandı', 'success');
        this.loadAllocations(documentId);
      },
      error: () => {
        this.#toast.showToast('Hata', 'Zimmetleme başarısız', 'error');
      }
    });
  }

  getir(id: string) {
    this.incomingDocumentService.getIncomingDocumentByDocumentId(id)
      .subscribe(doc => {

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


      });

    // this.incomingDocumentService.getDocumentById(id).subscribe(docs => {
    //   if (!docs) return;
    //   this.doc.set(docs.id);
    //   this.scannedDocumentNo.set(this.doc());
    // });
  }

  backToQrScan() {
    this.detailsVisible.set(false);
    this.saveModalVisible.set(false);
    this.scannedDocumentNo.set(null);
    this.incomingDocumentService.clearZimmetIncomingDocument();
    this.alertVisible.set(true);
    this.backButtonVisible.set(false);
    this.saveModalDetailVisible.set(false);
    this.id = null;
  }

  saveZimmet(status: string) {
    const user = this.user();
    if (!user?.id) {
      console.error("Kullanıcı bulunamadı");
      return;
    }

    let personId: string;

    if (this.zimmetType === 'self') {
      personId = user.id;
    } else {
      if (!this.selectedPersonId) {
        this.#toast.showToast('Hata', 'Lütfen personel seçiniz.', 'error');
        return;
      }
      personId = this.selectedPersonId;
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
