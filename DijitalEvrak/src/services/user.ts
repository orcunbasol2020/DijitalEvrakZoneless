import { Injectable, inject, signal } from '@angular/core';
import { HttpContext } from '@angular/common/http';
import { HttpService } from './http';
import { UserModel } from '../pages/users/users';
import { SKIP_ERROR_TOAST } from '../interceptors/error-interceptor';

/** Sunucuda açık olan giriş yolları (canlıda yalnızca Windows, yerelde ikisi de) */
export interface LoginOptions {
    formLoginEnabled: boolean;
    windowsLoginEnabled: boolean;
}

// Giriş ekranı hataları kendisi gösterir (ör. 401 hatalı şifre, 403 tanımsız kullanıcı); genel toast çıkmaz
const quiet = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

@Injectable({ providedIn: 'root' })
export class UserService {
    private httpService = inject(HttpService);
    private baseUrl = 'api/Users/';

    getUserByUsername(user: string, password: string) {
        const body = {
            userName: user,
            password: password
        };

        return this.httpService.post<UserModel>(`${this.baseUrl}Login`, body, { context: quiet() });
    }

    getLoginOptions() {
        return this.httpService.get<LoginOptions>(`${this.baseUrl}GetLoginOptions`, { context: quiet() });
    }

    /**
     * Windows oturumundaki hesapla (Kerberos) şifresiz giriş; cevap Login ile aynıdır. withCredentials
     * olmadan tarayıcı Windows kimliğini göndermez. 401: kimlik doğrulanamadı, 403: kullanıcı tanımsız / pasif.
     */
    windowsLogin() {
        return this.httpService.post<UserModel>(`${this.baseUrl}WindowsLogin`, null, { context: quiet(), withCredentials: true });
    }

    // Rolleriyle birlikte tüm kullanıcılar (roles yalnızca GetAll'da dolu gelir)
    getAll() {
        return this.httpService.get<UserModel[]>(`${this.baseUrl}GetAll`);
    }

    getById(id: string) {
        return this.httpService.get<UserModel>(
            `${this.baseUrl}GetById?id=${encodeURIComponent(id)}`
        );
    }

    create(body: Partial<UserModel>) {
        return this.httpService.post<UserModel>(`${this.baseUrl}Create`, body);
    }

    update(body: Partial<UserModel> & { id: string }) {
        return this.httpService.post(`${this.baseUrl}Update`, body);
    }

}