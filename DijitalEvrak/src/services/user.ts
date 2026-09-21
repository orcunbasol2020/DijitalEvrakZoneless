import { Injectable, inject, signal } from '@angular/core';
import { HttpService } from './http';
import { UserModel } from '../pages/users/users';

@Injectable({ providedIn: 'root' })
export class UserService {
    private httpService = inject(HttpService);
    private baseUrl = 'api/Users/';

    getUserByUsername(user: string, password: string) {
        const body = {
            userName: user,
            password: password
        };

        return this.httpService.post<UserModel>(`${this.baseUrl}Login`, body);
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