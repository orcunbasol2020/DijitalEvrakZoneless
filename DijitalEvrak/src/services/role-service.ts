import { Injectable } from '@angular/core';
import { LIMITED_ROLES, navigations, NavigationModel } from '../navigation';

/** Backend'de bozuk Türkçe karakterle kayıtlı rol adlarının uygulama içindeki karşılıkları. */
const ROLE_NAME_FIXES: Record<string, string> = {
  'Ön Kayit': 'Ön Kayıt',
};

/** Rol adını uygulama içi yazıma çevirir (ör. "Ön Kayit" → "Ön Kayıt"); bilinmeyen adlar aynen döner. */
export function normalizeRoleName(role: string): string {
  return ROLE_NAME_FIXES[role] ?? role;
}

/** Rol rozetlerinin simgeleri; listede olmayan roller varsayılan simgeyle gösterilir. */
const ROLE_ICONS: Record<string, string> = {
  'Admin': 'admin_panel_settings',
  'Yönetici': 'shield_person',
  'Birim Yöneticisi': 'supervisor_account',
  'Birim Evrak Sorumlusu': 'badge',
  'Gelen Evrak': 'move_to_inbox',
  'Giden Evrak': 'outbox',
  'Ön Kayıt': 'app_registration',
  'Misyon Yetkilisi': 'flag',
  'Misyon Evrak Sorumlusu': 'public',
  'Kurye': 'local_shipping',
};

/** Rol rozetinde gösterilecek Material simgesi. */
export function roleIcon(name: string): string {
  return ROLE_ICONS[name] ?? 'verified_user';
}

/**
 * Rol atama ekranında rol adının altında gösterilen kısa açıklamalar (navigation.ts'deki menü yetkilerinden).
 * Uygulamada henüz ekranı olmayan roller (Misyon, Kurye) açıklamasız gösterilir.
 */
const ROLE_DESCRIPTIONS: Record<string, string> = {
  'Yönetici': 'Tüm gelen evraklar, kullanıcılar, roller, giriş / hata kayıtları ve uygulama ayarları',
  'Birim Yöneticisi': 'Birim evrak sorumlusu yetkileri; ana sayfada birim paneli',
  'Birim Evrak Sorumlusu': 'Birimine gelen evraklar, zimmet ve zarf işlemleri',
  'Gelen Evrak': 'Evrak kaydı, gelen ve taranmış evraklar, zimmet, kullanıcı yönetimi',
  'Giden Evrak': 'Giden evraklar, zarflar, teslim alma / zimmetleme ve kargo takibi',
  'Ön Kayıt': 'Ön kayıt ve evrak kaydı, zimmet, zarf ve kargo işlemleri',
};

/** Rol atama ekranında ve rol süzgecinde gösterilmeyen roller (kullanımda değil). */
const HIDDEN_ROLES = new Set(['Admin']);

/** Rol atama ekranında ve rol süzgecinde gösterilir mi. */
export function isRoleVisible(name: string): boolean {
  return !HIDDEN_ROLES.has(name);
}

/** Menü ve sayfa yetkilerinde adıyla geçen roller; silinirse ya da adı değişirse ekran yetkileri bozulur. */
const SYSTEM_ROLES = new Set([
  ...navigations.flatMap(n => [...(n.roles ?? []), ...(n.excludeRoles ?? [])]),
  ...LIMITED_ROLES,
]);

export function isSystemRole(name: string): boolean {
  return SYSTEM_ROLES.has(normalizeRoleName(name));
}

/** Rolün kısa açıklaması; tanımsızsa boş döner. */
export function roleDescription(name: string): string {
  return ROLE_DESCRIPTIONS[name] ?? '';
}

/** Birim düzeyindeki evrak rolleri. Birim Yöneticisi şimdilik yalnızca ana sayfa panelinde ayrışır. */
const BIRIM_EVRAK_ROLES = ['Birim Evrak Sorumlusu', 'Birim Yöneticisi'];

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

  /** Birim Evrak Sorumlusu ya da Birim Yöneticisi; ikisi şimdilik aynı menü ve yetkilere sahiptir. */
  hasBirimEvrakRole(): boolean {
    return this.hasAny(BIRIM_EVRAK_ROLES);
  }

  /** Havale (AI), parametre sayfaları ve Raporlar'ı açabilir mi; bkz. LIMITED_ROLES. */
  canViewLimitedPages(): boolean {
    return !this.hasAny(LIMITED_ROLES);
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