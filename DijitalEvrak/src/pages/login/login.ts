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
import {
  isKeycloakCallback,
  KeycloakCallbackResult,
  KeycloakOptions,
  readKeycloakCallback,
  startKeycloakLogin
} from '../../services/keycloak-auth';
import { UserModel } from '../users/users';
import { APP_VERSION } from '../../app-version';

/**
 * checking:        giriş seçenekleri alınıyor / otomatik (Windows ya da Keycloak) giriş deneniyor
 * form:            kullanıcı adı + şifre (yerelde)
 * denied:          kimlik doğrulandı ama kullanıcı sistemde yok / silinmiş / pasif (403)
 * windows-failed:  Windows kimliği doğrulanamadı (401 / ağ hatası) ve form girişi kapalı
 * keycloak-failed: Keycloak girişi tamamlanamadı (Keycloak'a ulaşılamadı, token geçersiz, ağ hatası)
 * signed-out:      kullanıcı çıkış yaptı; otomatik girilmez, düğmeyle yeniden girilir
 * unavailable:     sunucuda hiçbir giriş yolu açık değil
 */
type LoginMode = 'checking' | 'form' | 'denied' | 'windows-failed' | 'keycloak-failed' | 'signed-out' | 'unavailable';

/** Otomatik giriş yolu; ekran metinleri ve "Tekrar dene" buna göre değişir */
type AutoLogin = 'windows' | 'keycloak';

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
  /** Sunucuda Keycloak girişi açıksa adresi ve client kimliği; kapalıysa null */
  readonly keycloak = signal<KeycloakOptions | null>(null);
  readonly autoLogin = signal<AutoLogin>('windows');

  readonly isLoading = signal(false);
  readonly windowsLoading = signal(false);
  readonly submitted = signal(false);
  readonly showPassword = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly version = APP_VERSION;

  /** Marka bloğu: başlık ve alt başlık harf harf dağıtılarak bakanlık adıyla aynı genişliğe yayılır. */
  readonly titleChars = 'DİJİTAL EVRAK'.split('').map((ch, i) => ({ ch, accent: i > 7 }));
  readonly subtitleChars = 'TAKİP SİSTEMİ'.split('');

  constructor() {
    // Oturum zaten açıksa login ekranını gösterme, doğrudan ana sayfaya (ya da istenen sayfaya) geç.
    if (readStoredUser()) {
      this.#router.navigateByUrl(this.#returnUrl());
      return;
    }
    // Keycloak giriş sayfasından /login?code=...&state=... ile dönüldü
    const query = new URLSearchParams(location.search);
    if (isKeycloakCallback(query)) {
      // Kod tek kullanımlık: yenilemede ya da geri tuşunda yeniden işlenmesin
      history.replaceState(history.state, '', '/login');
      this.#finishKeycloakLogin(query);
      // Hata ekranındaki düğmeler için seçenekler; otomatik giriş yeniden başlatılmaz (döngü olmasın)
      this.#loadOptions(false);
      return;
    }
    this.#loadOptions();
  }

  // ---- Giriş yolu seçimi (GetLoginOptions) ----
  #loadOptions(autoStart = true): void {
    this.#userService.getLoginOptions().subscribe({
      next: (options) => {
        this.formEnabled.set(!!options?.formLoginEnabled);
        this.windowsEnabled.set(!!options?.windowsLoginEnabled);
        this.keycloak.set(
          options?.keycloakEnabled && options.keycloakAuthority && options.keycloakClientId
            ? { authority: options.keycloakAuthority, clientId: options.keycloakClientId }
            : null
        );
        if (!autoStart) return;
        this.autoLogin.set(this.keycloak() ? 'keycloak' : 'windows');

        if (this.formEnabled()) {
          // Yerel geliştirme: başka kullanıcılarla test edilebilsin diye otomatik giriş yapılmaz
          this.showForm();
        } else if (this.keycloak()) {
          if (wasSignedOut()) this.mode.set('signed-out');
          else this.signInWithKeycloak();
        } else if (this.windowsEnabled()) {
          if (wasSignedOut()) this.mode.set('signed-out');
          else this.signInWithWindows();
        } else {
          this.mode.set('unavailable');
        }
      },
      // Uç noktayı bilmeyen eski sunucu ya da ağ hatası: bugünkü form
      error: () => {
        if (!autoStart) return;
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

  /** "Tekrar dene" / "... ile gir" düğmeleri: sunucunun açtığı otomatik giriş yolu */
  retryAutoLogin(): void {
    if (this.autoLogin() === 'keycloak') this.signInWithKeycloak();
    else this.signInWithWindows();
  }

  // ---- Keycloak girişi ----
  signInWithKeycloak(): void {
    const options = this.keycloak();
    if (!options) return;
    this.autoLogin.set('keycloak');
    this.errorMessage.set(null);
    this.mode.set('checking');
    // Sayfa Keycloak'a gider; yalnızca yönlendirme hazırlanamazsa (ör. https olmayan adreste crypto.subtle yok) hata
    startKeycloakLogin(options, this.#returnUrl()).catch(() => this.mode.set('keycloak-failed'));
  }

  #finishKeycloakLogin(query: URLSearchParams): void {
    this.autoLogin.set('keycloak');
    this.mode.set('checking');

    let callback: KeycloakCallbackResult;
    try {
      callback = readKeycloakCallback(query);
    } catch {
      this.mode.set('keycloak-failed');
      return;
    }

    this.#userService.keycloakLogin(callback.code).subscribe({
      next: (res) => {
        if (!res?.isActive) {
          this.mode.set('denied');
          return;
        }
        this.#complete(res, 'keycloak', true, callback.returnUrl);
      },
      error: (err: HttpErrorResponse) => this.mode.set(err.status === 403 ? 'denied' : 'keycloak-failed')
    });
  }

  // ---- Windows girişi ----
  signInWithWindows(): void {
    if (this.windowsLoading()) return;
    this.autoLogin.set('windows');
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
  /** "ad.soyad@mfa.gov.tr" girildiyse alan adını atıp sadece kullanıcı adını döndürür ("HITIT\" önekini sunucu atar). */
  private normalizeUserName(raw: string): string {
    const value = (raw ?? '').trim();
    return value.replace(/@mfa\.gov\.tr$/i, '');
  }

  clearError() {
    if (this.errorMessage()) this.errorMessage.set(null);
  }

  signIn(form: NgForm) {
    this.submitted.set(true);
    this.errorMessage.set(null);

    if (!form.valid) return;

    const userName = this.normalizeUserName(form.value['userName']);
    const password: string = form.value['password'];

    this.isLoading.set(true);

    this.#userService.login(userName, password).subscribe({
      next: (res) => {
        this.isLoading.set(false);

        if (!res) {
          this.errorMessage.set('Kullanıcı bulunamadı. Kurumsal kullanıcı adınızı kontrol edin.');
          return;
        }

        if (!res.isActive) {
          this.errorMessage.set('Hesabınız pasif durumda. Giriş yapmaya yetkiniz yok.');
          return;
        }

        this.#complete(res, 'form', false);
      },
      error: (err: HttpErrorResponse) => {
        this.isLoading.set(false);
        if (err.status === 401) {
          this.errorMessage.set('Kullanıcı adı ya da şifre hatalı, veya hesap pasif.');
        } else if (err.status === 404) {
          // Sunucuda form girişi kapatılmış (canlı)
          this.errorMessage.set('Kullanıcı adıyla giriş kapalı. Windows hesabınızla giriş yapın.');
        } else {
          this.errorMessage.set('Sunucuya ulaşılamadı. Lütfen daha sonra tekrar deneyin.');
        }
      }
    });
  }

  /** returnUrl: Keycloak dönüşünde adreste yoktur, yönlendirme öncesi saklanan değer verilir */
  #complete(user: UserModel, method: LoginMethod, remember: boolean, returnUrl = this.#returnUrl()): void {
    storeUser(user, method, remember);
    // Girişteki hatırlatma popup'ı (zimmet onayları, birim teslim bekleyenler) her girişte
    // yalnızca bir kez açılır; popup bu bayrağı okuyup siler (bkz. LoginReminder).
    sessionStorage.setItem('loginReminderPopup', '1');
    this.#router.navigateByUrl(this.#safeUrl(returnUrl));
  }

  /** Guard'ın verdiği dönüş adresi */
  #returnUrl(): string {
    return this.#safeUrl(this.#route.snapshot.queryParamMap.get('returnUrl'));
  }

  /** Yalnızca uygulama içi yollar kabul edilir */
  #safeUrl(url: string | null): string {
    return url && url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/login') ? url : '/';
  }
}
