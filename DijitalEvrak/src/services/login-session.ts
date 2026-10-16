import { UserModel } from '../pages/users/users';

// Oturum, giriş cevabıyla (Login / WindowsLogin / KeycloakLogin: token ve tokenExpiration dahil) "user"
// anahtarında tutulur; Windows ve Keycloak girişi localStorage'a, form girişi sessionStorage'a yazar.
const USER_KEY = 'user';
// Kullanıcı çıkış yaptıysa giriş ekranı otomatik (Windows / Keycloak) giriş yapmaz, "Oturumunuz kapatıldı" gösterir
const SIGNED_OUT_KEY = 'loginSignedOut';

export type LoginMethod = 'form' | 'windows' | 'keycloak';

export interface StoredUser extends UserModel {
  token?: string | null;
  /** UTC; Windows / Keycloak oturumunda süresi dolunca giriş ekranı yeniden otomatik girer */
  tokenExpiration?: string | null;
  loginMethod?: LoginMethod;
}

/**
 * Geçerli oturum; yoksa null. Süresi dolmuş Windows / Keycloak oturumu silinir ve null döner (giriş ekranı
 * yeni token'ı kendiliğinden alır). Form oturumları bugünkü gibi süreye bakılmadan geçerli kalır.
 */
export function readStoredUser(): StoredUser | null {
  const raw = localStorage.getItem(USER_KEY) ?? sessionStorage.getItem(USER_KEY);
  if (!raw) return null;

  let user: StoredUser;
  try {
    user = JSON.parse(raw);
  } catch {
    clearStoredUser();
    return null;
  }

  if ((user.loginMethod === 'windows' || user.loginMethod === 'keycloak') && isExpired(user.tokenExpiration)) {
    clearStoredUser();
    return null;
  }
  // Birimler kaynak sisteme (ComDepartment) geçmeden önce açılmış oturumda birim kimliği Guid'dir;
  // yeni kimlikle eşleşmeyeceği için yeniden giriş istenir
  if (typeof user.departmentId === 'string') {
    clearStoredUser();
    return null;
  }
  return user;
}

export function storeUser(user: StoredUser, method: LoginMethod, remember: boolean): void {
  clearStoredUser();
  (remember ? localStorage : sessionStorage).setItem(USER_KEY, JSON.stringify({ ...user, loginMethod: method }));
  sessionStorage.removeItem(SIGNED_OUT_KEY);
}

export function clearStoredUser(): void {
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(USER_KEY);
}

/** Çıkış: oturum silinir, giriş ekranı bu sekmede otomatik Windows girişi yapmaz */
export function signOut(): void {
  clearStoredUser();
  sessionStorage.setItem(SIGNED_OUT_KEY, '1');
}

export function wasSignedOut(): boolean {
  return sessionStorage.getItem(SIGNED_OUT_KEY) === '1';
}

function isExpired(expiration: string | null | undefined): boolean {
  if (!expiration) return false;
  // Sunucu UTC yazar; saat dilimi eki yoksa UTC kabul edilir
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(expiration) ? expiration : `${expiration}Z`;
  const time = new Date(iso).getTime();
  return !isNaN(time) && time <= Date.now();
}
