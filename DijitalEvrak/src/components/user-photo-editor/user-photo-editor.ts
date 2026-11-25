import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, HostListener, inject, input, output, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FlexiToastService } from 'flexi-toast';
import { UserPhoto } from '../user-photo/user-photo';
import { UserPhotoService } from '../../services/user-photo';
import { getUserInitials } from '../../services/user-avatar';
import { incomingErrorMessage } from '../../services/incomingdocument';
import { UserModel } from '../../pages/users/users';

export type UserPhotoEditorUser = Pick<UserModel, 'name' | 'surname'> & Partial<Pick<UserModel, 'id' | 'userName' | 'photoVersion'>>;

/** Kırpma alanının kenarı (px) */
const STAGE = 280;
/** Sunucuya giden resmin kenarı (px); sunucu en fazla 512 KB kabul eder, 256×256 JPEG ~20-40 KB */
const OUTPUT = 256;
const JPEG_QUALITY = 0.85;
const MAX_ZOOM = 4;
/** Seçilen dosya en fazla bu kadar olabilir (tarayıcıda küçültüleceği için sunucu sınırından büyük) */
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Profil resmi seçme / kırpma / kaldırma penceresi. Resim tarayıcıda kare kırpılıp 256×256 JPEG'e küçültülerek
 * gönderilir; canvas'tan yeniden üretildiği için EXIF (konum vb.) bilgisi de atılır.
 * self: kendi resmi (userId gönderilmez); değilse yalnızca Yönetici kullanabilir (backend 403 döner).
 */
@Component({
  selector: 'app-user-photo-editor',
  imports: [UserPhoto],
  templateUrl: './user-photo-editor.html',
  styleUrl: './user-photo-editor.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserPhotoEditor {
  readonly user = input.required<UserPhotoEditorUser>();
  readonly self = input(false);
  readonly closed = output<void>();

  readonly #photos = inject(UserPhotoService);
  readonly #toast = inject(FlexiToastService);
  readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  readonly stage = STAGE;
  readonly maxZoom = MAX_ZOOM;
  readonly accept = ACCEPTED_TYPES.join(',');

  readonly fullName = computed(() => `${this.user().name ?? ''} ${this.user().surname ?? ''}`.trim());
  readonly initials = computed(() => getUserInitials(this.user()));
  readonly hasPhoto = computed(() => !!this.#photos.versionOf(this.user()));

  /** Seçilen dosyanın object URL'i; doluyken kırpma görünümü açıktır */
  readonly source = signal<string | null>(null);
  #image: HTMLImageElement | null = null;
  readonly #natural = signal({ w: 0, h: 0 });

  readonly zoom = signal(1);
  readonly x = signal(0);
  readonly y = signal(0);
  readonly saving = signal(false);
  readonly busy = computed(() => this.saving());

  /** Yakınlaştırma 1'deyken resmin kısa kenarı kırpma alanını tam doldurur */
  readonly #scale = computed(() => {
    const { w, h } = this.#natural();
    return w && h ? (STAGE / Math.min(w, h)) * this.zoom() : 1;
  });
  readonly displayW = computed(() => this.#natural().w * this.#scale());
  readonly displayH = computed(() => this.#natural().h * this.#scale());
  readonly transform = computed(() => `translate(${this.x()}px, ${this.y()}px)`);

  #drag: { pointerId: number; startX: number; startY: number; x: number; y: number } | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.#releaseSource());
  }

  @HostListener('document:keydown.escape')
  close(): void {
    if (this.busy()) return;
    this.closed.emit();
  }

  pickFile(): void {
    this.fileInput()?.nativeElement.click();
  }

  onFileChange(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = ''; // aynı dosya yeniden seçilebilsin
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      this.#toast.showToast('Uyarı', 'Yalnızca JPEG, PNG ya da WebP resim seçilebilir.', 'warning');
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      this.#toast.showToast('Uyarı', `Resim en fazla ${MAX_INPUT_BYTES / 1024 / 1024} MB olabilir.`, 'warning');
      return;
    }

    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      this.#releaseSource();
      this.#image = image;
      this.#natural.set({ w: image.naturalWidth, h: image.naturalHeight });
      this.zoom.set(1);
      this.source.set(url);
      // Ortala
      this.x.set((STAGE - this.displayW()) / 2);
      this.y.set((STAGE - this.displayH()) / 2);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      this.#toast.showToast('Hata', 'Resim açılamadı. Başka bir dosya deneyin.', 'error');
    };
    image.src = url;
  }

  cancelCrop(): void {
    this.#releaseSource();
  }

  setZoom(value: number): void {
    const next = Math.min(MAX_ZOOM, Math.max(1, value));
    // Kırpma alanının ortası yakınlaştırmada yerinde kalır
    const before = this.#scale();
    const cx = (STAGE / 2 - this.x()) / before;
    const cy = (STAGE / 2 - this.y()) / before;
    this.zoom.set(next);
    const after = this.#scale();
    this.#moveTo(STAGE / 2 - cx * after, STAGE / 2 - cy * after);
  }

  onWheel(event: WheelEvent): void {
    event.preventDefault();
    this.setZoom(this.zoom() * (event.deltaY < 0 ? 1.08 : 1 / 1.08));
  }

  onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.#drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: this.x(), y: this.y() };
  }

  onPointerMove(event: PointerEvent): void {
    const drag = this.#drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    this.#moveTo(drag.x + event.clientX - drag.startX, drag.y + event.clientY - drag.startY);
  }

  onPointerUp(event: PointerEvent): void {
    if (this.#drag?.pointerId === event.pointerId) this.#drag = null;
  }

  /** Klavye ile kaydırma (ok tuşları) ve yakınlaştırma (+ / -) */
  onStageKey(event: KeyboardEvent): void {
    const step = event.shiftKey ? 20 : 5;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step],
    };
    if (moves[event.key]) {
      const [dx, dy] = moves[event.key];
      this.#moveTo(this.x() + dx, this.y() + dy);
    } else if (event.key === '+' || event.key === '=') {
      this.setZoom(this.zoom() * 1.1);
    } else if (event.key === '-') {
      this.setZoom(this.zoom() / 1.1);
    } else {
      return;
    }
    event.preventDefault();
  }

  async save(): Promise<void> {
    const user = this.user();
    if (!this.#image || !user.id || this.busy()) return;

    let blob: Blob;
    try {
      blob = await this.#crop(this.#image);
    } catch {
      this.#toast.showToast('Hata', 'Resim hazırlanamadı.', 'error');
      return;
    }

    this.saving.set(true);
    this.#photos.upload(user.id, blob, this.self()).subscribe({
      next: res => {
        this.saving.set(false);
        if (res.data?.saved) {
          this.#toast.showToast('Başarılı', res.message || 'Profil resmi kaydedildi', 'success');
          this.closed.emit();
        } else {
          this.#toast.showToast('Uyarı', res.message || 'Profil resmi kaydedilemedi', 'warning');
        }
      },
      error: err => {
        this.saving.set(false);
        this.#toast.showToast('Hata', this.#errorMessage(err, 'Profil resmi kaydedilemedi'), 'error');
      }
    });
  }

  remove(): void {
    const user = this.user();
    if (!user.id || this.busy()) return;
    const whose = this.self() ? 'Profil resminiz' : `${this.fullName()} kişisinin profil resmi`;
    this.#toast.showSwal('Resmi Kaldır', `${whose} kaldırılsın mı?`, 'Kaldır', () => {
      this.saving.set(true);
      this.#photos.delete(user.id!).subscribe({
        next: () => {
          this.saving.set(false);
          this.#toast.showToast('Başarılı', 'Profil resmi kaldırıldı', 'success');
          this.closed.emit();
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          // 404: resim zaten yok
          if (err.status === 404) {
            this.#photos.markDeleted(user.id!);
            this.closed.emit();
            return;
          }
          this.#toast.showToast('Hata', this.#errorMessage(err, 'Profil resmi kaldırılamadı'), 'error');
        }
      });
    });
  }

  #errorMessage(err: unknown, fallback: string): string {
    const status = (err as HttpErrorResponse)?.status;
    if (status === 403) return 'Başka bir kullanıcının resmini yalnızca Yönetici değiştirebilir.';
    if (status === 401) return 'Oturumunuzun süresi dolmuş. Yeniden giriş yapın.';
    if (status === 413) return 'Resim çok büyük.';
    return incomingErrorMessage(err, fallback);
  }

  /** Resim kırpma alanını her zaman doldurur: boşluk kalacak kadar kaydırılamaz */
  #moveTo(x: number, y: number): void {
    this.x.set(Math.min(0, Math.max(STAGE - this.displayW(), x)));
    this.y.set(Math.min(0, Math.max(STAGE - this.displayH(), y)));
  }

  /** Kırpma alanında görünen kare, 256×256 JPEG olarak */
  #crop(image: HTMLImageElement): Promise<Blob> {
    const scale = this.#scale();
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return Promise.reject(new Error('canvas'));

    // Saydam PNG'ler JPEG'de siyah çıkmasın
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, OUTPUT, OUTPUT);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, -this.x() / scale, -this.y() / scale, STAGE / scale, STAGE / scale, 0, 0, OUTPUT, OUTPUT);

    return new Promise((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', JPEG_QUALITY));
  }

  #releaseSource(): void {
    const url = this.source();
    if (url) URL.revokeObjectURL(url);
    this.source.set(null);
    this.#image = null;
    this.#drag = null;
  }
}
