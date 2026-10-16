import { DepartmentId } from '../models/ids';
import { Injectable, inject, signal } from '@angular/core';
import { HttpContext } from '@angular/common/http';
import { HttpService } from './http';
import { UserModel } from '../pages/users/users';
import { SKIP_ERROR_TOAST } from '../interceptors/error-interceptor';
import { KeycloakCode } from './keycloak-auth';

/** Sunucuda açık olan giriş yolları (canlıda Keycloak ya da Windows, yerelde form da) */
export interface LoginOptions {
    formLoginEnabled: boolean;
    windowsLoginEnabled: boolean;
    keycloakEnabled?: boolean;
    /** Keycloak realm adresi; yalnızca keycloakEnabled iken dolu */
    keycloakAuthority?: string | null;
    keycloakClientId?: string | null;
}

/** Users/GetAll süzgeçleri */
export interface UserListFilter {
    /** Ad, soyad ya da kullanıcı adında arama */
    search?: string | null;
    /** Yalnızca bu sistemde rolü olanlar */
    onlyWithRoles?: boolean;
    departmentId?: DepartmentId | null;
    /** departmentId ile birlikte: parentId zinciriyle bağlı tüm alt birimlerin kullanıcıları da gelir */
    includeSubDepartments?: boolean;
    roleId?: string | null;
}

// Giriş ekranı hataları kendisi gösterir (ör. 401 hatalı şifre, 403 tanımsız kullanıcı); genel toast çıkmaz
const quiet = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

@Injectable({ providedIn: 'root' })
export class UserService {
    private httpService = inject(HttpService);
    private baseUrl = 'api/Users/';

    /** Geliştirme girişi (yalnızca formLoginEnabled iken): şifresiz, AD kullanıcı adıyla */
    login(userName: string, password: string) {
        const body = { userName, password };

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
     * Keycloak dönüşündeki kodla giriş; sunucu kodu Keycloak'ta token'a çevirir (client secret sunucuda)
     * ve Login ile aynı cevabı döner. 401: kod / token geçersiz, 403: kullanıcı tanımsız / pasif.
     */
    keycloakLogin(body: KeycloakCode) {
        return this.httpService.post<UserModel>(`${this.baseUrl}KeycloakLogin`, body, { context: quiet() });
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