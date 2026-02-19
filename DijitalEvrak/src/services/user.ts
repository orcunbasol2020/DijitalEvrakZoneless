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

}