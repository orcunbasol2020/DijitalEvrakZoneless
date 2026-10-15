import { ChangeDetectionStrategy, Component, DestroyRef, NgZone, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FlexiToastService } from 'flexi-toast';
import { AppSettingsService, SESSION_TIMEOUT_KEY } from '../../../services/app-settings';
import { Common } from '../../../services/common';

/** Ayar sunucuda yoksa ya da okunamazsa kullanılan süre */
const DEFAULT_TIMEOUT_MINUTES = 30;
/** Kapanmadan bu kadar önce uyarı penceresi açılır */
const WARNING_SECONDS = 60;
const CHECK_INTERVAL_MS = 1000;
/** Fare hareketi gibi sık olaylar en fazla bu aralıkla kaydedilir */
const ACTIVITY_THROTTLE_MS = 5000;
/** Son işlem zamanı tüm sekmelerde ortak: bir sekmede çalışan kullanıcı diğerinde de oturumda kalır */
const LAST_ACTIVITY_KEY = 'lastActivity';
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'];

/**
 * Boşta kalan oturumu kapatır. Süre Uygulama Ayarları'ndaki SessionTimeoutMinutes'tan
 * okunur (0: kapanmaz). Son dakikada geri sayımlı uyarı açılır; kullanıcı "Devam Et"
 * derse ya da herhangi bir sekmede işlem yaparsa süre baştan başlar.
 */
@Component({
  selector: 'app-session-timeout',
  templateUrl: './session-timeout.html',
  styleUrl: './session-timeout.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SessionTimeout {
  readonly #common = inject(Common);
  readonly #router = inject(Router);
  readonly #toast = inject(FlexiToastService);
  readonly #zone = inject(NgZone);

  readonly warningOpen = signal(false);
  readonly secondsLeft = signal(WARNING_SECONDS);

  #timeoutMs = DEFAULT_TIMEOUT_MINUTES * 60 * 1000;
  #lastWrite = 0;

  constructor() {
    inject(AppSettingsService).getAll().subscribe({
      next: settings => {
        const raw = settings?.find(s => s.key === SESSION_TIMEOUT_KEY)?.value;
        const minutes = raw != null && raw.trim() !== '' ? Number(raw) : NaN;
        if (Number.isFinite(minutes) && minutes >= 0) this.#timeoutMs = minutes * 60 * 1000;
      },
      error: () => { /* varsayılan süre kullanılır */ }
    });

    this.#markActivity(true);

    const onActivity = () => {
      // Uyarı açıkken yalnızca "Devam Et" süreyi yeniler; fare kıpırtısı pencereyi kapatmasın
      if (!this.warningOpen()) this.#markActivity();
    };

    // Olaylar ve sayaç değişiklik algılamayı tetiklemesin; yalnızca sinyaller ekranı günceller
    let timer: ReturnType<typeof setInterval>;
    this.#zone.runOutsideAngular(() => {
      for (const event of ACTIVITY_EVENTS) window.addEventListener(event, onActivity, { passive: true, capture: true });
      timer = setInterval(() => this.#check(), CHECK_INTERVAL_MS);
    });

    inject(DestroyRef).onDestroy(() => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity, { capture: true });
      clearInterval(timer);
    });
  }

  stayLoggedIn(): void {
    this.warningOpen.set(false);
    this.#markActivity(true);
  }

  logoutNow(): void {
    this.warningOpen.set(false);
    this.#common.logout();
    this.#router.navigateByUrl('/login');
  }

  #check(): void {
    if (this.#timeoutMs <= 0) {
      if (this.warningOpen()) this.warningOpen.set(false);
      return;
    }

    const idleMs = Date.now() - this.#readLastActivity();
    const leftMs = this.#timeoutMs - idleMs;

    if (leftMs <= 0) {
      this.#zone.run(() => this.#expire());
    } else if (leftMs <= WARNING_SECONDS * 1000) {
      this.secondsLeft.set(Math.ceil(leftMs / 1000));
      if (!this.warningOpen()) this.warningOpen.set(true);
    } else if (this.warningOpen()) {
      // Başka sekmede işlem yapıldı
      this.warningOpen.set(false);
    }
  }

  #expire(): void {
    this.warningOpen.set(false);
    // Başka sekme zaten çıkış yaptıysa yalnızca giriş ekranına gidilir
    if (this.#common.user()) {
      this.#common.logout();
      this.#toast.showToast('Oturum Kapandı', 'Uzun süre işlem yapılmadığı için oturumunuz kapatıldı.', 'info');
    }
    this.#router.navigateByUrl('/login');
  }

  #markActivity(force = false): void {
    const now = Date.now();
    if (!force && now - this.#lastWrite < ACTIVITY_THROTTLE_MS) return;
    this.#lastWrite = now;
    try {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
    } catch { /* localStorage kapalıysa yalnız bu sekmenin zamanı kullanılır */ }
  }

  #readLastActivity(): number {
    try {
      const value = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
      if (value > 0) return Math.max(value, this.#lastWrite);
    } catch { /* bkz. #markActivity */ }
    return this.#lastWrite;
  }
}
