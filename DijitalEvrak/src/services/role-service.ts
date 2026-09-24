import { Injectable } from '@angular/core';
import { navigations, NavigationModel } from '../navigation';

/** Backend'de bozuk Türkçe karakterle kayıtlı rol adlarının uygulama içindeki karşılıkları. */
const ROLE_NAME_FIXES: Record<string, string> = {
  'Ön Kayit': 'Ön Kayıt',
};

/** Rol adını uygulama içi yazıma çevirir (ör. "Ön Kayit" → "Ön Kayıt"); bilinmeyen adlar aynen döner. */
export function normalizeRoleName(role: string): string {
  return ROLE_NAME_FIXES[role] ?? role;
}

@Injectable({ providedIn: 'root' })
export class RoleService {

  /** Kullanıcının rolleri; bozuk yazımlar düzeltilmiş halde döner. */
  get roles(): string[] {
    const user = localStorage.getItem("user") ?? sessionStorage.getItem("user");

    if (!user) {
      return [];
    }

    try {
      const parsed = JSON.parse(user);
      const roles: unknown = parsed.roles;
      return Array.isArray(roles) ? roles.map(normalizeRoleName) : [];
    } catch {
      return [];
    }
  }

  /** Sorgulanan ad da normalize edilir; böylece backend'den gelen "Ön Kayit" ile de eşleşir. */
  has(role: string): boolean {
    return this.roles.includes(normalizeRoleName(role));
  }

  hasAny(roles: string[]): boolean {
    const current = this.roles;
    return roles.some(r => current.includes(normalizeRoleName(r)));
  }

  getMenu(): NavigationModel[] {
    const result: NavigationModel[] = [];

    let pendingCategory: string | null = null;

    for (const nav of navigations) {

      if (nav.category) {
        pendingCategory = nav.category;
        continue;
      }

      const isVisible = (!nav.roles?.length || this.hasAny(nav.roles))
        && !(nav.excludeRoles?.length && this.hasAny(nav.excludeRoles));

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