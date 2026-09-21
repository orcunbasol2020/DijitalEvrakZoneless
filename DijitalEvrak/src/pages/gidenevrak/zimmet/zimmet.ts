import { ChangeDetectionStrategy, Component, computed, effect, inject, OnInit, signal, ViewEncapsulation } from '@angular/core';
import GenericModel from '../../../../components/generic-model/generic-model';
import { FlexiToastService } from 'flexi-toast';
import { EnvelopeDocumentService } from '../../../services/envelopedocument';
import { EnvelopeService } from '../../../services/envelope';
import { CommonModule } from '@angular/common';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { httpResource } from '@angular/common/http';
import { ChangeDetectorRef } from '@angular/core';
import { IncomingDocumentPreRegisterModel } from '../../../models/incoming-document/incomingdocument-pregister.model';
import { IncomingDocumentService } from '../../../services/incomingdocument';
import { Common } from '../../../services/common';
import { forkJoin } from 'rxjs';
import { EnvelopeModel, envelopeStatusForZimmetMode } from '../../../models/envelope.model';
import { ExternalInstitution, ExternalInstitutionModel } from '../../../services/external-institution';
import { ExternalUserService, ExternalUserModel, initialExternalUser } from '../../../services/external-user';
import { UserModel } from '../../users/users';
import { SimpleAutocompleteComponent } from '../../simpleautocomplete/simpleautocomplete';
import { QRCodeComponent } from 'angularx-qrcode';

type ZimmetMode = 'self' | 'internal' | 'external';
type PersonListItem = { id: string; name: string; surname: string; identityNo?: string; email?: string };

@Component({
  imports: [
    GenericModel,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SimpleAutocompleteComponent,
    QRCodeComponent
  ],
  templateUrl: './zimmet.html',
  styleUrls: ['./zimmet.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Zimmet implements OnInit {

  private keydownHandler: any;
  detailsVisible = signal(false);
  readonly #toast = inject(FlexiToastService);
  private buffer: string = '';
  private envelopeDocumentService = inject(EnvelopeDocumentService);
  private incomingDocumentService = inject(IncomingDocumentService);
  private envelopeService = inject(EnvelopeService);
  private externalUserService = inject(ExternalUserService);
  private externalInstitutionService = inject(ExternalInstitution);
  private cdr = inject(ChangeDetectorRef);
  readonly #common = inject(Common);
  readonly user = computed(() => this.#common.user());

  ngOnInit(): void {
    this.keydownHandler = (e: KeyboardEvent) => {
      this.handleKeydown(e);
    };
    window.addEventListener('keydown', this.keydownHandler);
  }
  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.keydownHandler);
  }
  private handleKeydown(e: KeyboardEvent) {
    if (!this.detailsVisible()) {
      if (e.key === 'Enter') {
        this.onQrScanned(this.buffer.trim());
        this.buffer = '';
      } else {
        this.buffer += e.key;
      }
    }
  }
  documents: any[] = [];
  loading = false;
  alertVisible = true;
  currentItem: {
    type: 'envelope' | 'document';
    code: string;
  } | null = null;
  // Zarf okutulduğunda etiket popup'ında gösterebilmek için zarf verisini burada tutuyoruz.
  previewEnvelope: EnvelopeModel | null = null;
  envelopeLabelVisible = false;

  searchTerm = '';
  searchVisible = false;
  sortField: 'qrCode' | 'createdDate' = 'createdDate';
  sortDirection: 'asc' | 'desc' = 'desc';

  get filteredDocuments() {
    const term = this.searchTerm.trim().toLowerCase();
    const filtered = term
      ? this.documents.filter(doc => doc.qrCode?.toLowerCase().includes(term))
      : this.documents;

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

  // ---- Zimmetle paneli: toplanan evrakları bir kişiye zimmetlemek için ----
  readonly mode = signal<ZimmetMode>('self');
  readonly selectedPersonId = signal<string | null>(null);
  readonly personSearch = signal('');
  readonly selectedInstitutionId = signal<string | null>(null);

  readonly usersResult = httpResource<UserModel[]>(() => "api/Users/GetAll");
  readonly internalUserList = computed<PersonListItem[]>(() =>
    (this.usersResult.value() ?? []).filter((x): x is UserModel & { id: string } => !!x.id && !x.isDeleted && x.isActive)
  );

  readonly institutionsResult = httpResource<ExternalInstitutionModel[]>(() => "api/ExternalInstitutions/GetAll");
  readonly institutionList = computed(() =>
    (this.institutionsResult.value() ?? []).filter(x => !x.isDeleted)
  );

  // Kurumlar parentId ile hiyerarşik olabildiğinden, autocomplete listesinde
  // üst kurumun hemen altına alt kurumlar girintili şekilde sıralanır.
  readonly institutionOptions = computed(() => {
    const list = this.institutionList();
    const byParent = new Map<string | null, ExternalInstitutionModel[]>();

    for (const inst of list) {
      const key = list.some(p => p.id === inst.parentId) ? inst.parentId! : null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(inst);
    }
    for (const group of byParent.values()) {
      group.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    }

    const result: { id: string; name: string; level: number }[] = [];
    const addChildren = (parentId: string | null, level: number) => {
      for (const inst of byParent.get(parentId) ?? []) {
        result.push({ id: inst.id, name: inst.name, level });
        addChildren(inst.id, level + 1);
      }
    };
    addChildren(null, 0);

    return result;
  });
  readonly institutionControl = new FormControl<{ id: string, name: string } | null>(null);

  readonly externalUsersResult = httpResource<ExternalUserModel[]>(() => "api/ExternalUsers/GetAll");
  readonly externalPersonList = computed<PersonListItem[]>(() => {
    const institutionId = this.selectedInstitutionId();
    if (!institutionId) return [];

    return (this.externalUsersResult.value() ?? [])
      .filter(x => !x.isDeleted && x.isActive && x.externalInstitutionId === institutionId);
  });

  readonly currentPersonList = computed<PersonListItem[]>(() =>
    this.mode() === 'internal' ? this.internalUserList() : this.externalPersonList()
  );

  readonly filteredPersonList = computed(() => {
    const term = this.personSearch().trim().toLocaleLowerCase('tr');
    const list = this.currentPersonList();
    if (!term) return list;

    return list.filter(p =>
      `${p.name} ${p.surname}`.toLocaleLowerCase('tr').includes(term) ||
      (p.identityNo ?? '').toLocaleLowerCase('tr').includes(term)
    );
  });

  readonly quickAddModalVisible = signal(false);
  readonly quickAddSaving = signal(false);
  quickAddForm: ExternalUserModel = { ...initialExternalUser };

  constructor() {
    // "Kendim" modundayken seçili kişi her zaman oturum açan kullanıcı olsun
    // (kullanıcı bilgisi ilk yüklendiğinde de senkron kalsın).
    effect(() => {
      if (this.mode() === 'self') {
        this.selectedPersonId.set(this.user()?.id ?? null);
      }
    });

    // Belgenin kurumu değiştiğinde arama kutusunda gösterilen seçimi de eşitle.
    effect(() => {
      const id = this.selectedInstitutionId();
      const match = id ? this.institutionOptions().find(o => o.id === id) ?? null : null;
      if (this.institutionControl.value?.id !== match?.id) {
        this.institutionControl.setValue(match, { emitEvent: false });
      }
    });

    this.institutionControl.valueChanges.subscribe(value => {
      this.selectInstitution(value?.id ?? null);
    });
  }

  setMode(mode: ZimmetMode): void {
    if (this.mode() === mode) return;
    this.mode.set(mode);
    this.selectedPersonId.set(mode === 'self' ? this.user()?.id ?? null : null);
    this.selectedInstitutionId.set(null);
    this.personSearch.set('');
  }

  selectInstitution(id: string | null): void {
    this.selectedInstitutionId.set(id);
    this.selectedPersonId.set(null);
  }

  selectPerson(id: string): void {
    this.selectedPersonId.set(this.selectedPersonId() === id ? null : id);
  }

  initials(p: PersonListItem): string {
    return `${p.name?.charAt(0) ?? ''}${p.surname?.charAt(0) ?? ''}`.toLocaleUpperCase('tr');
  }

  get selfInitials(): string {
    const u = this.user();
    return `${u?.name?.charAt(0) ?? ''}${u?.surname?.charAt(0) ?? ''}`.toLocaleUpperCase('tr');
  }

  openQuickAddModal(): void {
    this.quickAddForm = { ...initialExternalUser, externalInstitutionId: this.selectedInstitutionId() };
    this.quickAddModalVisible.set(true);
  }

  closeQuickAddModal(): void {
    if (this.quickAddSaving()) return;
    this.quickAddModalVisible.set(false);
  }

  saveQuickAddPerson(): void {
    if (!this.quickAddForm.name?.trim() || !this.quickAddForm.surname?.trim()) {
      this.#toast.showToast('Uyarı', 'Ad ve soyad zorunludur', 'warning');
      return;
    }

    if (!this.quickAddForm.email?.trim()) {
      this.#toast.showToast('Uyarı', 'E-posta zorunludur', 'warning');
      return;
    }

    if (!this.quickAddForm.externalInstitutionId) {
      this.#toast.showToast('Hata', 'Kurum bilgisi bulunamadı', 'error');
      return;
    }

    this.quickAddSaving.set(true);

    const body: Partial<ExternalUserModel> = {
      name: this.quickAddForm.name,
      surname: this.quickAddForm.surname,
      email: this.quickAddForm.email,
      identityNo: this.quickAddForm.identityNo,
      userType: this.quickAddForm.userType,
      externalInstitutionId: this.quickAddForm.externalInstitutionId,
      isActive: true
    };

    this.externalUserService.create(body).subscribe({
      next: () => {
        this.#toast.showToast('Başarılı', 'Personel eklendi', 'success');
        this.quickAddSaving.set(false);
        this.quickAddModalVisible.set(false);
        this.externalUsersResult.reload();
      },
      error: () => {
        this.quickAddSaving.set(false);
        this.#toast.showToast('Hata', 'Personel eklenemedi', 'error');
      }
    });
  }

  async onQrScanned(result: string) {

    if (this.loading) return;

    if (!result) {
      this.showToast('Bilgi', 'QR okutunuz', 'warning');
      return;
    }

    this.loading = true;
    // QR okuyucu, native window 'keydown' olayı üzerinden tetiklendiğinde
    // OnPush bileşen otomatik olarak işaretlenmiyor; loading spinner'ının
    // hemen görünmesi için burada elle bildiriyoruz.
    this.cdr.markForCheck();

    try {

      // ZARF KONTROLÜ (prefix ile)
      if (result.startsWith('ZRF')) {
        this.currentItem = {
          type: 'envelope',
          code: result
        };
        const envelope = await this.envelopeService.getEnvelopeByNo(result);

        if (!envelope) {
          this.documents = [];
          this.previewEnvelope = null;
          this.showToast('Bilgi', 'Zarf bulunamadı.', 'warning');
          return;
        }

        this.previewEnvelope = envelope;

        // GetByNo, GetById gibi kurum adını (externalInstitutionName) join'lemeden
        // dönebiliyor; yalnızca id geldiyse burada ayrıca çekiyoruz.
        if (!envelope.externalInstitutionName && envelope.externalInstitutionId) {
          this.externalInstitutionService.getExternalInstitutionById(envelope.externalInstitutionId).subscribe({
            next: (institution: ExternalInstitutionModel) => {
              if (this.previewEnvelope === envelope) {
                this.previewEnvelope = { ...envelope, externalInstitutionName: institution.name };
                this.cdr.markForCheck();
              }
            }
          });
        }

        const docs = await this.envelopeDocumentService
          .getEnvelopeDocumentsByEnvelopeId(envelope.id);

        if (docs.length > 0) {
          this.documents = docs;
          this.alertVisible = false;
        } else {
          this.documents = [];
          this.showToast('Bilgi', 'Zarf içinde evrak yok.', 'warning');
        }

        return;
      }
      else {
        this.currentItem = {
          type: 'document',
          code: result
        };
        this.previewEnvelope = null;
        const isValidDocument = /^20\d{2}/.test(result);
        if (!isValidDocument) {
          this.showToast(
            'Hata',
            'Lütfen geçerli bir evrak numarasını girin.' + "( geçersiz : " + result + ")",
            'warning'
          );
          return;
        }
        //  BELGE AKIŞI
        const exists = this.documents.some(x => x.qrCode === result);

        if (exists) {
          this.showToast('Bilgi', 'Bu belge zaten eklendi', 'info');
          return;
        }

        // ( burada backend doğrulama gelecek)

        this.documents = [
          ...this.documents,
          {
            qrCode: result,
            createdDate: new Date()
          }
        ];

        this.alertVisible = false;
      }

    } catch (err) {
      console.error(err);
      this.showToast('Hata', 'Bir hata oluştu', 'error');
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }
  private toastVisible = false;
  private showToast(title: string, message: string, type: 'info' | 'warning' | 'error') {
    if (this.toastVisible) return;
    this.toastVisible = true;
    this.#toast.showToast(title, message, type);
    setTimeout(() => this.toastVisible = false, 2000);
  }
  getCaptionTitle(): string {
    if (!this.currentItem) {
      return 'Belgeler';
    }

    return this.currentItem.type === 'envelope'
      ? 'Zarf İçindeki Belgeler'
      : 'Eklenen Evrak ';
  }

  reset() {
    this.documents = [];
    this.buffer = '';
    this.loading = false;
    this.alertVisible = true;
    this.currentItem = null;
    this.previewEnvelope = null;
    this.envelopeLabelVisible = false;
    this.searchTerm = '';
    this.searchVisible = false;
    this.mode.set('self');
    this.selectedPersonId.set(this.user()?.id ?? null);
    this.selectedInstitutionId.set(null);
    this.personSearch.set('');
  }

  addZimmet() {
    const personId = this.selectedPersonId();
    if (!personId) {
      this.#toast.showToast('Hata', 'Personel seçilmedi', 'error');
      return;
    }

    const userType = this.mode() === 'external' ? 2 : 1;

    // reset() zarf bilgisini temizlediği için zarf durumu güncellemesi için önceden saklanır.
    const envelopeId = this.currentItem?.type === 'envelope' ? this.previewEnvelope?.id ?? null : null;
    const envelopeStatus = envelopeStatusForZimmetMode(this.mode());

    const requests = this.documents.map(doc => {
      const model: IncomingDocumentPreRegisterModel = {
        id: "",
        qrCode: doc.qrCode,
        userId: personId,
        userType,
        documentDirection: 2,
        isDeleted: false,
        createdDate: new Date()
      };

      return this.incomingDocumentService.createIncomingDocumentPreRegister(model);
    });

    forkJoin(requests).subscribe({
      next: (results) => {
        let successCount = 0;
        let alreadyCount = 0;

        for (const res of results) {
          if (!res) continue;

          if (res.id != "") successCount++;
          else alreadyCount++;
        }

        if (successCount > 0) {
          this.#toast.showToast('Başarılı', `${successCount} evrak zimmetlendi`, 'info');

          // Evraklar zimmetlendiyse zarfın durumu da moda göre güncellenir
          // (Teslim Al / Zimmetle: Evrak Birimde, Teslim Et: Teslim Edildi).
          if (envelopeId) {
            this.updateEnvelopeStatus(envelopeId, envelopeStatus);
          }

          // TEMİZLEME
          this.reset();
          this.cdr.detectChanges();
        }

        if (alreadyCount > 0) {
          this.#toast.showToast('Bilgi', `${alreadyCount} kayıt zaten vardı.`, 'warning');
        }
      },
      error: () => {
        this.#toast.showToast('Hata', 'Kayıtlar oluşturulamadı', 'error');
      }
    });
  }

  // Zarf durumu güncellenemezse zimmetler zaten kaydedilmiş olduğundan yalnızca uyarı verilir.
  private updateEnvelopeStatus(envelopeId: string, status: ReturnType<typeof envelopeStatusForZimmetMode>) {
    this.envelopeService.updateEnvelopeStatus(envelopeId, status).subscribe({
      error: (err) => {
        console.error('Zarf durumu güncellenemedi:', err);
        this.#toast.showToast('Uyarı', 'Evraklar zimmetlendi ancak zarf durumu güncellenemedi', 'warning');
      }
    });
  }

}
