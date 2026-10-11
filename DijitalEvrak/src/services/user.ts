import { DepartmentId } from '../models/ids';
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

/** Users/GetAll süzgeçleri */
export interface UserListFilter {
    /** Ad, soyad ya da kullanıcı adında arama */
    search?: string | null;
    /** Yalnızca bu sistemde rolü olanlar */
    onlyWithRoles?: boolean;
    departmentId?: DepartmentId | null;
    roleId?: string | null;
}

// Giriş ekranı hataları kendisi gösterir (ör. 401 hatalı şifre, 403 tanımsız kullanıcı); genel toast çıkmaz
const quiet = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

@Injectable({ providedIn: 'root' })
export class UserService {
    private httpService = inject(HttpService);
    private baseUrl = 'api/Users/';

    /** Geliştirme girişi (yalnızca formLoginEnabled iken): şifresiz, AD kullanıcı adıyla */
    getUserByUsername(user: string) {
        const body = { userName: user };

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

    /**
     * Rolleriyle birlikte kullanıcılar (roles yalnızca GetAll'da dolu gelir). Kaynakta ~10.000 kullanıcı var:
     * hiç süzgeç verilmezse sunucu en fazla 200 kayıt döner. İsim eşlemeleri için onlyWithRoles (bu sistemde
     * rolü olanlar), kişi seçicilerde search ya da departmentId kullanılmalı.
     */
    getAll(filter: UserListFilter = {}) {
        return this.httpService.get<UserModel[]>(this.listUrl(filter));
    }

    listUrl(filter: UserListFilter = {}): string {
        const params = Object.entries(filter)
            .filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== false)
            .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
        return `${this.baseUrl}GetAll${params.length ? '?' + params.join('&') : ''}`;
    }

    getById(id: string) {
        return this.httpService.get<UserModel>(
            `${this.baseUrl}GetById?id=${encodeURIComponent(id)}`
        );
    }

}