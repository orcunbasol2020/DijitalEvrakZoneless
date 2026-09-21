import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { FlexiToastService } from 'flexi-toast';

@Injectable({ providedIn: 'root' })
export class ErrorService {
  constructor(private toast: FlexiToastService, private router: Router) {}

  handle(error: HttpErrorResponse) {
    switch (error.status) {
      case 400:
        this.toast.showToast("Geçersiz İstek", "Eksik veya hatalı bilgi gönderildi.", "error");
        break;

      case 401:
        this.toast.showToast("Hata", "Kullanıcı adı ya da şifre yanlış", "error");
        this.router.navigate(['/login']);
        break;

      case 403:
        this.toast.showToast("Yetkisiz İşlem", "Bu işlemi yapmaya yetkiniz yok.", "error");
        break;

      case 404:
        break;

      case 408:
      case 504:
        this.toast.showToast("Zaman Aşımı", "Sunucu yanıt vermedi, lütfen tekrar deneyin.", "error");
        break;

      case 409:
        this.toast.showToast("Çakışma", "Bu kayıt zaten mevcut.", "error");
        break;

      case 500:
      case 502:
      case 503:
        this.toast.showToast("Sunucu Hatası", "Sistem geçici olarak hizmet veremiyor.", "error");
        break;

      default:
        this.toast.showToast("Bilinmeyen Hata", error.message ?? "Beklenmeyen bir hata oluştu.", "error");
        break;
    }

    console.error('HTTP Error:', error);
  }
}
