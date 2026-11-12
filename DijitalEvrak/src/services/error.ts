import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { FlexiToastService } from 'flexi-toast';

/**
 * Aynı hata bu süre içinde bir kez gösterilir. Sayfa açılışında birden çok istek aynı anda hata verince
 * (ör. sunucu kapalı) her biri için ayrı toast çıkmasın.
 */
const DUPLICATE_WINDOW_MS = 5000;

@Injectable({ providedIn: 'root' })
export class ErrorService {
  /** Son gösterilen hatalar: "başlık|metin" → gösterildiği an */
  readonly #lastShown = new Map<string, number>();
  /** 401'de girişe bir kez yönlendirilir; aynı anda düşen diğer 401'ler tekrar yönlendirmez */
  #redirectingToLogin = false;

  constructor(private toast: FlexiToastService, private router: Router) {}

  handle(error: HttpErrorResponse) {
    switch (error.status) {
      // Sunucuya hiç ulaşılamadı (ağ kesik, sunucu kapalı, CORS)
      case 0:
        this.#show("Bağlantı Hatası", "Sunucuya ulaşılamadı, bağlantınızı kontrol edip tekrar deneyin.");
        break;

      case 400:
        this.#show("Geçersiz İstek", "Eksik veya hatalı bilgi gönderildi.");
        break;

      // Giriş istekleri bu toast'ı atlar (SKIP_ERROR_TOAST); buraya düşen 401 oturumun geçersiz olduğunu gösterir
      case 401:
        this.#show("Oturum Sona Erdi", "Oturumunuzun süresi doldu, lütfen tekrar giriş yapın.");
        if (!this.#redirectingToLogin) {
          this.#redirectingToLogin = true;
          this.router.navigate(['/login']).finally(() => this.#redirectingToLogin = false);
        }
        break;

      case 403:
        this.#show("Yetkisiz İşlem", "Bu işlemi yapmaya yetkiniz yok.");
        break;

      case 404:
        break;

      case 408:
      case 504:
        this.#show("Zaman Aşımı", "Sunucu yanıt vermedi, lütfen tekrar deneyin.");
        break;

      case 409:
        this.#show("Çakışma", "Bu kayıt zaten mevcut.");
        break;

      case 500:
      case 502:
      case 503:
        this.#show("Sunucu Hatası", "Sistem geçici olarak hizmet veremiyor.");
        break;

      default:
        this.#show("Bilinmeyen Hata", "Beklenmeyen bir hata oluştu.");
        break;
    }

    console.error('HTTP Error:', error);
  }

  #show(title: string, text: string) {
    const key = `${title}|${text}`;
    const now = Date.now();
    const last = this.#lastShown.get(key);
    if (last !== undefined && now - last < DUPLICATE_WINDOW_MS) return;
    this.#lastShown.set(key, now);
    this.toast.showToast(title, text, "error");
  }
}
