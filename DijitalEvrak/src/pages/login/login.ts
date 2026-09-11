import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, ViewEncapsulation } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { FlexiToastService } from 'flexi-toast';
import { UserModel } from '../users/users';
import { UserService } from '../../services/user';
import { CommonModule } from '@angular/common';

@Component({
  imports: [
    FormsModule,
    CommonModule
  ],
  templateUrl: './login.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Login {
  readonly #http = inject(HttpClient);
  readonly #toast = inject(FlexiToastService);
  readonly #router = inject(Router);
  private userService = inject(UserService);

  isLoading = false;

  signIn(form: NgForm) {
    if (!form.valid) return;
    this.isLoading = true;
    const userName = form.value['userName'];
    const password = form.value['password'];
    const rememberMe = !!form.value['rememberMe'];

    this.userService.getUserByUsername(userName, password).subscribe({
      next: (res) => {
        this.isLoading = false;

        if (!res) {
          this.#toast.showToast("Hata", "Kullanıcı adı ya da şifre hatalı", "error");
          return;
        }

        if (!res.isActive) {
          this.#toast.showToast("Hata", "Giriş yapmaya yetkiniz yok", "error");
          return;
        }

        const storage = rememberMe ? localStorage : sessionStorage;
        storage.setItem("user", JSON.stringify(res));
        this.#router.navigateByUrl("/");
      },
      error: () => {
        this.isLoading = false;
        this.#toast.showToast("Hata", "Bir hata oluştu", "error");
      }
    });
  }
}
