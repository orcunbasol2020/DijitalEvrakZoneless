import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, ViewEncapsulation } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { FlexiToastService } from 'flexi-toast';
import { UserModel } from '../users/users';
import { UserService } from '../../services/user';

@Component({
  imports: [
    FormsModule
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

  signIn(form: NgForm) {
    if (!form.valid) return;

    //const endpoint = `api/users?userName=${form.value['userName']}&password=${form.value['password']}`;
    const userName = form.value['userName'];
    const password = form.value['password'];

    this.userService.getUserByUsername(userName, password).subscribe({
      next: (res) => {
        if (!res) {
          this.#toast.showToast("Hata", "Kullanıcı adı ya da şifre hatalı", "error");
          return;
        }

        if (!res.isActive) {
          this.#toast.showToast("Hata", "Giriş yapmaya yetkiniz yok", "error");
          return;
        }

        localStorage.setItem("user", JSON.stringify(res));
        this.#router.navigateByUrl("/");
      }
    });

  }
}
