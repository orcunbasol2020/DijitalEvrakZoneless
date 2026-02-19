import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class RoleService {

  get roles(): string[] {
    const user = localStorage.getItem("user");
    if (!user) return [];
    return JSON.parse(user).roles || [];
  }

  has(role: string): boolean {
    return this.roles.includes(role);
  }

  hasAny(roles: string[]): boolean {
    return roles.some(r => this.roles.includes(r));
  }
}
