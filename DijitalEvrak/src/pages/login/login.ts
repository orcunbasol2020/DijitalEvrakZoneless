import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
  ViewEncapsulation
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { UserService } from '../../services/user';
import { LoginMethod, readStoredUser, storeUser, wasSignedOut } from '../../services/login-session';
import { UserModel } from '../users/users';

/**
 * checking:       giriş seçenekleri alınıyor / otomatik Windows girişi deneniyor
 * form:           kullanıcı adı + şifre (yerelde; Windows girişi açıksa yanında düğmesi)
 * denied:         Windows kimliği doğrulandı ama kullanıcı sistemde yok / silinmiş / pasif (403)
 * windows-failed: Windows kimliği doğrulanamadı (401 / ağ hatası) ve form girişi kapalı
 * signed-out:     kullanıcı çıkış yaptı; otomatik girilmez, düğmeyle yeniden girilir
 * unavailable:    sunucuda iki giriş yolu da kapalı
 */
type LoginMode = 'checking' | 'form' | 'denied' | 'windows-failed' | 'signed-out' | 'unavailable';

@Component({
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Login {
  readonly #router = inject(Router);
  readonly #route = inject(ActivatedRoute);
  readonly #userService = inject(UserService);
  readonly #injector = inject(Injector);

  readonly userNameInput = viewChild<ElementRef<HTMLInputElement>>('userNameInput');

  readonly mode = signal<LoginMode>('checking');
  readonly formEnabled = signal(true);
  readonly windowsEnabled = signal(false);

  readonly isLoading = signal(false);
  readonly windowsLoading = signal(false);
  readonly submitted = signal(false);
  readonly showPassword = signal(false);
  readonly capsLockOn = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly version = 'v1.0.0';

  /** Marka bloğu: başlık ve alt başlık harf harf dağıtılarak bakanlık adıyla aynı genişliğe yayılır. */
  readonly titleChars = 'DİJİTAL EVRAK'.split('').map((ch, i) => ({ ch, accent: i > 7 }));
  readonly subtitleChars = 'TAKİP SİSTEMİ'.split('');

  constructor() {
    // Oturum zaten açıksa login ekranını gösterme, doğrudan ana sayfaya (ya da istenen sayfaya) geç.
    if (readStoredUser()) {
      this.#router.navigateByUrl(this.#returnUrl());
      return;
    }
    this.#loadOptions();
  }

  // ---- Giriş yolu seçimi (GetLoginOptions) ----
  #loadOptions(): void {
    this.#userService.getLoginOptions().subscribe({
      next: (options) => {
        this.formEnabled.set(!!options?.formLoginEnabled);
        this.windowsEnabled.set(!!options?.windowsLoginEnabled);

        if (this.formEnabled()) {
          // Yerel geliştirme: başka kullanıcılarla test edilebilsin diye otomatik Windows girişi yapılmaz
          this.showForm();
        } else if (this.windowsEnabled()) {
          if (wasSignedOut()) this.mode.set('signed-out');
          else this.signInWithWindows();
        } else {
          this.mode.set('unavailable');
        }
      },
      // Uç noktayı bilmeyen eski sunucu ya da ağ hatası: bugünkü form
      error: () => {
        this.formEnabled.set(true);
        this.windowsEnabled.set(false);
        this.showForm();
      }
    });
  }

  showForm(): void {
    this.mode.set('form');
    afterNextRender(() => this.userNameInput()?.nativeElement.focus(), { injector: this.#injector });
  }

  // ---- Windows girişi ----
  signInWithWindows(): void {
    if (this.windowsLoading()) return;
    this.errorMessage.set(null);
    this.windowsLoading.set(true);
    // Form ekranındaki düğmeden denenirken form yerinde kalır; diğer durumlarda bekleme ekranı görünür
    if (this.mode() !== 'form') this.mode.set('checking');

    this.#userService.windowsLogin().subscribe({
      next: (res) => {
        this.windowsLoading.set(false);
        if (!res?.isActive) {
          this.mode.set('denied');
          return;
        }
        // Her açılışta zaten otomatik girildiği için oturum sekmeler arasında paylaşılır
        this.#complete(res, 'windows', true);
      },
      error: (err: HttpErrorResponse) => {
        this.windowsLoading.set(false);
        if (err.status === 403) {
          this.mode.set('denied');
        } else if (this.formEnabled()) {
          this.showForm();
          this.errorMessage.set('Windows oturumunuz doğrulanamadı. Kullanıcı adı ve şifrenizle giriş yapabilirsiniz.');
        } else {
          this.mode.set('windows-failed');
        }
      }
    });
  }

  // ---- Kullanıcı adı / şifre ----
  /** "ad.soyad@mfa.gov.tr" girildiyse alan adını atıp sadece kullanıcı adını döndürür. */
  private normalizeUserName(raw: string): string {
    const value = (raw ?? '').trim();
    return value.replace(/@mfa\.gov\.tr$/i, '');
  }

  togglePassword() {
    this.showPassword.update(v => !v);
  }

  /** Şifre alanında Caps Lock açık mı diye bakar (keydown/keyup üzerinden). */
  checkCapsLock(event: KeyboardEvent) {
    this.capsLockOn.set(event.getModifierState?.('CapsLock') ?? false);
  }

  clearError() {
    if (this.errorMessage()) this.errorMessage.set(null);
  }

  signIn(form: NgForm) {
    this.submitted.set(true);
    this.errorMessage.set(null);

    if (!form.valid) return;

    const userName = this.normalizeUserName(form.value['userName']);
    const password = form.value['password'];
    const rememberMe = !!form.value['rememberMe'];

    this.isLoading.set(true);

    this.#userService.getUserByUsername(userName, password).subscribe({
      next: (res) => {
        this.isLoading.set(false);

        if (!res) {
          this.errorMessage.set('Kullanıcı adı ya da şifre hatalı. Lütfen tekrar deneyin.');
          return;
        }

        if (!res.isActive) {
          this.errorMessage.set('Hesabınız pasif durumda. Giriş yapmaya yetkiniz yok.');
          return;
        }

        this.#complete(res, 'form', rememberMe);
      },
      error: (err: HttpErrorResponse) => {
        this.isLoading.set(false);
        if (err.status === 401) {
          this.errorMessage.set('Kullanıcı adı ya da şifre hatalı. Lütfen tekrar deneyin.');
        } else if (err.status === 404) {
          // Sunucuda form girişi kapatılmış (canlı)
          this.errorMessage.set('Kullanıcı adı ve şifreyle giriş kapalı. Windows hesabınızla giriş yapın.');
        } else {
          this.errorMessage.set('Sunucuya ulaşılamadı. Lütfen daha sonra tekrar deneyin.');
        }
      }
    });
  }

  #complete(user: UserModel, method: LoginMethod, remember: boolean): void {
    storeUser(user, method, remember);
    // Girişteki hatırlatma popup'ı (zimmet onayları, birim teslim bekleyenler) her girişte
    // yalnızca bir kez açılır; popup bu bayrağı okuyup siler (bkz. LoginReminder).
    sessionStorage.setItem('loginReminderPopup', '1');
    this.#router.navigateByUrl(this.#returnUrl());
  }

  /** Guard'ın verdiği dönüş adresi; yalnızca uygulama içi yollar kabul edilir */
  #returnUrl(): string {
    const url = this.#route.snapshot.queryParamMap.get('returnUrl');
    return url && url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/login') ? url : '/';
  }
}
