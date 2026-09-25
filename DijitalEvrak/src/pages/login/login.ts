import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
  ViewEncapsulation
} from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { UserService } from '../../services/user';

@Component({
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Login {
  readonly #router = inject(Router);
  readonly #userService = inject(UserService);

  readonly userNameInput = viewChild<ElementRef<HTMLInputElement>>('userNameInput');

  readonly isLoading = signal(false);
  readonly submitted = signal(false);
  readonly showPassword = signal(false);
  readonly capsLockOn = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly version = 'v1.0.0';

  constructor() {
    // Oturum zaten açıksa login ekranını gösterme, doğrudan ana sayfaya geç.
    const existing = localStorage.getItem('user') ?? sessionStorage.getItem('user');
    if (existing) {
      this.#router.navigateByUrl('/');
      return;
    }

    afterNextRender(() => this.userNameInput()?.nativeElement.focus());
  }

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

        localStorage.removeItem('user');
        sessionStorage.removeItem('user');

        const storage = rememberMe ? localStorage : sessionStorage;
        storage.setItem('user', JSON.stringify(res));
        this.#router.navigateByUrl('/');
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set('Sunucuya ulaşılamadı. Lütfen daha sonra tekrar deneyin.');
      }
    });
  }
}
