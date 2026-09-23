import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import GenericModel from '../../../../components/generic-model/generic-model';
import { FlexiToastService } from 'flexi-toast';
import { EnvelopeDocumentService } from '../../../services/envelopedocument';
import { ZimmetStateService } from '../../../services/zimmet-state-service';
import { EnvelopeModel, EnvelopeStatus, EnvelopeStatusBadgeClass, EnvelopeStatusLabels } from '../../../models/envelope.model';
import { EnvelopeService } from '../../../services/envelope';
import { ExternalInstitution, ExternalInstitutionModel } from '../../../services/external-institution';
import { OutgoingDocumentAllocation } from '../../../services/outgoingdocumentallocation';
import { OutgoingDocumentAllocationModel } from '../../../models/outgoingdocumentallocation.model';
import { Common } from '../../../services/common';
import { FormsModule } from '@angular/forms';
import { QRCodeComponent } from 'angularx-qrcode';

// Teslim Bilgisi ekranı: yalnızca "Teslim Edildi" durumundaki zarflar için
// açılır ve salt okunurdur. Zarftaki evraklar, teslim alan/eden kişi, teslim
// tarihi ve ıslak imzalı zimmet formu gösterilir; burada zimmetleme yapılmaz
// (zimmetleme Giden Evrak Teslim Al ekranında QR okutularak yapılır).
@Component({
  imports: [
    GenericModel,
    CommonModule,
    FormsModule,
    QRCodeComponent
  ],
  templateUrl: './gidenzimmet.html',
  // Görsel dil Giden Evrak Teslim Al (zimmet) ekranıyla ortak; zm-* sınıfları oradan gelir.
  styleUrls: ['../zimmet/zimmet.css', './gidenzimmet.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Gidenzimmet implements OnInit {
  private envelopeService = inject(EnvelopeService);
  private externalService = inject(ExternalInstitution);
  private state = inject(ZimmetStateService);
  private envelopeDocumentService = inject(EnvelopeDocumentService);
  private allocationService = inject(OutgoingDocumentAllocation);
  private toast = inject(FlexiToastService);
  private router = inject(Router);
  readonly #common = inject(Common);
  readonly user = computed(() => this.#common.user());

  readonly previewEnvelope = signal<EnvelopeModel | null>(null);
  readonly documents = signal<any[]>([]);
  readonly externalName = signal<string | null>(null);
  readonly loading = signal(false);
  readonly envelopeLabelVisible = signal(false);

  searchTerm = '';
  sortField: 'qrCode' | 'createdDate' = 'createdDate';
  sortDirection: 'asc' | 'desc' = 'desc';

  get filteredDocuments() {
    const term = this.searchTerm.trim().toLowerCase();
    const docs = this.documents();
    const filtered = term
      ? docs.filter(doc => doc.qrCode?.toLowerCase().includes(term))
      : docs;

    const dir = this.sortDirection === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (this.sortField === 'qrCode') {
        return a.qrCode.localeCompare(b.qrCode) * dir;
      }
      return (new Date(a.createdDate).getTime() - new Date(b.createdDate).getTime()) * dir;
    });
  }

  toggleSort(field: 'qrCode' | 'createdDate') {
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDirection = 'asc';
    }
  }

  // Geri butonu: geldiği ekrana göre metin.
  get backButtonLabel(): string {
    return this.state.getReturnUrl() ? 'Okutma Ekranına Dön' : 'Zarflara Dön';
  }

  // Sol paneldeki zarf özetinde gösterilen durum rozeti (Zarflar listesiyle aynı stil).
  get envelopeStatusLabel(): string {
    const status = this.previewEnvelope()?.status;
    return (status != null && EnvelopeStatusLabels[status]) || '-';
  }

  get envelopeStatusClass(): string {
    const status = this.previewEnvelope()?.status;
    return (status != null && EnvelopeStatusBadgeClass[status]) || '';
  }

  // Zarf "Teslim Edildi" durumunda değilse bu ekranda gösterilecek bilgi yoktur;
  // kullanıcı teslim işlemi için okutma ekranına yönlendirilir.
  readonly isDelivered = computed(() => this.previewEnvelope()?.status === EnvelopeStatus.TeslimEdildi);

  // Teslim bilgileri, zarftaki ilk evrağın aktif zimmet kaydından okunur
  // (zarftaki tüm evraklar aynı işlemde aynı kişiye teslim edilir).
  readonly deliveredPersonName = signal<string | null>(null);
  readonly deliveredByPersonName = signal<string | null>(null);
  readonly deliveredDate = signal<string | Date | null>(null);
  // Sağ panel; zarf, evraklar ve zimmet kaydı üçü de gelene kadar tek bir
  // yükleme durumunda kalır. Aksi halde zarf gelir gelmez boş kartlar çizilip
  // ardından spinner ve gerçek bilgiler gösteriliyor, ekran titriyordu.
  readonly infoLoading = signal(true);

  // Islak imzalı belge (taranmış, imzalı zimmet formu) bilgileri
  readonly wetSignedAllocationId = signal<string | null>(null);
  readonly wetSignedFileName = signal<string | null>(null);
  readonly wetSignedUploadDate = signal<string | Date | null>(null);
  readonly wetSignedUploadedBy = signal<string | null>(null);
  readonly wetSignedUploading = signal(false);

  // Zarftaki evraklar ayrı ayrı zimmetleniyor; ıslak imzalı belge, teslim
  // durumu takibinde kullanılan ilk evrağın allocation kaydına bağlanıyor.
  readonly primaryDocumentId = computed(() => this.documents()[0]?.documentId ?? null);

  ngOnInit(): void {
    const envelopeId = this.state.getEnvelopeId();

    if (!envelopeId) {
      this.toast.showToast('Hata', 'Zarf bilgisi bulunamadı', 'error');
      this.router.navigate(['/envelope']);
      return;
    }

    this.envelopeService.getEnvelopeById(envelopeId).subscribe({
      next: (res: EnvelopeModel) => {
        if (!res) {
          this.infoLoading.set(false);
          return;
        }

        this.previewEnvelope.set(res);
        this.loadDocuments(envelopeId);

        // Alıcı kurum adı GetById'de join'lenmeden gelebiliyor; ayrıca çekiliyor.
        if (res.externalInstitutionName) {
          this.externalName.set(res.externalInstitutionName);
        } else if (res.externalInstitutionId) {
          this.externalService.getExternalInstitutionById(res.externalInstitutionId).subscribe({
            next: (result: ExternalInstitutionModel) => this.externalName.set(result.name)
          });
        }
      },
      error: () => {
        this.infoLoading.set(false);
        this.toast.showToast('Hata', 'Zarf bilgisi yüklenemedi', 'error');
      }
    });
  }

  private async loadDocuments(envelopeId: string) {
    this.loading.set(true);

    try {
      const docs = await this.envelopeDocumentService
        .getEnvelopeDocumentsByEnvelopeId(envelopeId);
      docs.sort((a, b) => new Date(a.createdDate ?? 0).getTime() - new Date(b.createdDate ?? 0).getTime());
      this.documents.set(docs);
      this.loadDeliveryInfo(docs[0]?.documentId ?? null);
    } catch {
      this.infoLoading.set(false);
      this.toast.showToast('Hata', 'Evraklar yüklenemedi', 'error');
    } finally {
      this.loading.set(false);
    }
  }

  // İlk evrağın aktif zimmet kaydından teslim alan/eden, tarih ve ıslak imzalı
  // belge bilgilerini doldurur.
  private loadDeliveryInfo(documentId: string | null): void {
    // Teslim edilmemiş zarf ya da evraksız zarf için zimmet kaydı aranmaz.
    if (!documentId || !this.isDelivered()) {
      this.applyAllocation(null);
      this.infoLoading.set(false);
      return;
    }

    this.allocationService.getActiveByDocumentId(documentId).subscribe({
      next: (allocation) => {
        this.applyAllocation(allocation?.isActive ? allocation : null);
        this.infoLoading.set(false);
      },
      error: () => {
        this.applyAllocation(null);
        this.infoLoading.set(false);
      }
    });
  }

  private applyAllocation(allocation: OutgoingDocumentAllocationModel | null): void {
    this.deliveredPersonName.set(allocation?.fullName ?? null);
    this.deliveredByPersonName.set(allocation?.createdFullName ?? null);
    this.deliveredDate.set(allocation?.createdDate ?? null);
    this.applyWetSignedInfo(allocation);
  }

  // Bir allocation kaydındaki ıslak imzalı belge bilgilerini state'e yansıtır.
  private applyWetSignedInfo(allocation: OutgoingDocumentAllocationModel | null): void {
    this.wetSignedAllocationId.set(allocation?.id ?? null);
    this.wetSignedFileName.set(allocation?.wetSignedDocumentFileName ?? null);
    this.wetSignedUploadDate.set(allocation?.wetSignedDocumentUploadDate ?? null);
    this.wetSignedUploadedBy.set(allocation?.wetSignedDocumentUploadedByFullName ?? null);
  }

  private refreshWetSignedInfo(documentId: string): void {
    this.allocationService.getActiveByDocumentId(documentId).subscribe({
      next: (allocation) => this.applyWetSignedInfo(allocation),
      error: () => this.applyWetSignedInfo(null)
    });
  }

  // Zimmet (QR okutma) ekranından yönlendirilmişse oraya, aksi halde Zarflar listesine dönülür.
  goBack() {
    const returnUrl = this.state.getReturnUrl() ?? '/envelope';
    this.state.clear();
    this.router.navigate([returnUrl]);
  }

  // Teslim edilmemiş bir zarf için: etiket numarası taşınarak okutma ekranı açılır,
  // zarf orada otomatik aranır.
  goToZimmetScan() {
    const envelopeNo = this.previewEnvelope()?.envelopeNo;
    this.state.clear();
    this.router.navigate(['/gidenevrak/zimmet'], envelopeNo ? { queryParams: { envelopeNo } } : undefined);
  }

  private static readonly wetSignedAllowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.tif', '.tiff'];
  private static readonly wetSignedMaxSizeBytes = 20 * 1024 * 1024;

  onWetSignedFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    // Aynı dosyanın tekrar seçilebilmesi için input'u temizle
    input.value = '';

    if (!file) return;

    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!Gidenzimmet.wetSignedAllowedExtensions.includes(extension)) {
      this.toast.showToast('Hata', 'Desteklenmeyen dosya türü. İzin verilenler: PDF, JPG, PNG, TIFF', 'error');
      return;
    }

    if (file.size > Gidenzimmet.wetSignedMaxSizeBytes) {
      this.toast.showToast('Hata', "Dosya boyutu 20 MB'ı geçemez", 'error');
      return;
    }

    const documentId = this.primaryDocumentId();
    if (!documentId) {
      this.toast.showToast('Hata', 'Evrak bilgisi bulunamadı', 'error');
      return;
    }

    this.wetSignedUploading.set(true);
    this.allocationService.uploadWetSignedDocument(documentId, file, this.user()?.id).subscribe({
      next: (res) => {
        this.wetSignedUploading.set(false);

        // Backend, iş kuralı ihlallerinde (ör. evrak henüz zimmetlenmedi) de
        // HTTP 200 dönüp hatayı mesaj gövdesinde iletiyor; bu yüzden gerçekten
        // kaydedilip kaydedilmediğini mesaj içeriğinden anlamamız gerekiyor.
        const message = res?.message ?? '';
        if (message.includes('başarıyla')) {
          this.toast.showToast('Başarılı', message, 'success');
          this.refreshWetSignedInfo(documentId);
        } else {
          this.toast.showToast('Uyarı', message || 'Islak imzalı belge yüklenemedi', 'warning');
        }
      },
      error: () => {
        this.wetSignedUploading.set(false);
        this.toast.showToast('Hata', 'Islak imzalı belge yüklenemedi', 'error');
      }
    });
  }

  downloadWetSignedDocument(): void {
    const allocationId = this.wetSignedAllocationId();
    if (!allocationId) return;

    window.open(this.allocationService.getWetSignedDownloadUrl(allocationId), '_blank');
  }
}
