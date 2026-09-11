import { Injectable } from '@angular/core';
import { navigations, NavigationModel } from '../navigation';

@Injectable({ providedIn: 'root' })
export class RoleService {

  private _roles: string[] = [];

  constructor() {
    const user = localStorage.getItem("user") ?? sessionStorage.getItem("user");

    if (!user) {
      this._roles = [];
      return;
    }

    try {
      const parsed = JSON.parse(user);
      this._roles = Array.isArray(parsed.roles) ? parsed.roles : [];
    } catch {
      this._roles = [];
    }
  }

  get roles(): string[] {
    return this._roles;
  }

  has(role: string): boolean {
    return this._roles.includes(role);
  }

  hasAny(roles: string[]): boolean {
    return roles.some(r => this._roles.includes(r));
  }

  getMenu(): NavigationModel[] {
    const result: NavigationModel[] = [];

    let pendingCategory: string | null = null;

    for (const nav of navigations) {

      if (nav.category) {
        pendingCategory = nav.category;
        continue;
      }

      const isVisible = !nav.roles?.length || this.hasAny(nav.roles);

      if (!isVisible) continue;

      if (pendingCategory) {
        result.push({ category: pendingCategory });
        pendingCategory = null;
      }

      result.push(nav);
    }

    return result;
  }
}