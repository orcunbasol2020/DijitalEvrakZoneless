// Keycloak (OIDC, yetkilendirme kodu + PKCE) ile kurumsal giriş. Kullanıcı Keycloak'un giriş sayfasına
// yönlendirilir, domain hesabıyla girer ve /login?code=...&state=... adresine geri döner. Client gizli
// anahtarlı (confidential) olduğundan kod tarayıcıda token'a çevrilmez: kod, PKCE doğrulayıcısı ve dönüş
// adresi backend'e (Users/KeycloakLogin) verilir; token'ı backend alır ve kendi JWT'sini üretir.
// Keycloak adresi ve client kimliği derlemeye gömülmez, sunucudan (GetLoginOptions) gelir.

/** GetLoginOptions'tan gelen Keycloak bilgileri */
export interface KeycloakOptions {
  /** Realm adresi, ör. "https://keycloak.kurum.gov.tr/realms/KURUM" (sonunda "/" olmadan) */
  authority: string;
  clientId: string;
}

// Yönlendirme öncesi bilgiler; dönüşte state karşılaştırılır, code_verifier backend'e verilir
const PENDING_KEY = 'keycloakPending';

interface PendingLogin {
  state: string;
  verifier: string;
  redirectUri: string;
  returnUrl: string;
}

/** Users/KeycloakLogin gövdesi */
export interface KeycloakCode {
  code: string;
  codeVerifier: string;
  /** Yetkilendirme isteğindeki redirect_uri; Keycloak token isteğinde birebir aynısını ister */
  redirectUri: string;
}

export interface KeycloakCallbackResult {
  code: KeycloakCode;
  /** Giriş öncesi açılmak istenen sayfa */
  returnUrl: string;
}

/** Keycloak'a geri dönüş adresi; Keycloak client'ında "Valid redirect URIs" altında tanımlı olmalı */
function redirectUri(): string {
  return `${location.origin}/login`;
}

/** Tarayıcıyı Keycloak giriş sayfasına yönlendirir; sayfa değiştiği için dönen promise beklenmez */
export async function startKeycloakLogin(options: KeycloakOptions, returnUrl: string): Promise<void> {
  const authority = options.authority.replace(/\/+$/, '');
  const verifier = randomString(32);
  const pending: PendingLogin = {
    state: randomString(16),
    verifier,
    redirectUri: redirectUri(),
    returnUrl
  };
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));

  const params = new URLSearchParams({
    client_id: options.clientId,
    response_type: 'code',
    scope: 'openid',
    redirect_uri: pending.redirectUri,
    state: pending.state,
    code_challenge: await sha256Base64Url(verifier),
    code_challenge_method: 'S256'
  });
  location.assign(`${authority}/protocol/openid-connect/auth?${params}`);
}

/** Adres Keycloak dönüşü mü (başarılı ya da hatalı) */
export function isKeycloakCallback(query: URLSearchParams): boolean {
  return query.has('state') && (query.has('code') || query.has('error'));
}

/**
 * Keycloak dönüşünü okur. state tutmazsa ya da Keycloak hata döndüyse hata fırlatır. Bekleyen giriş
 * bilgisi her durumda silinir (kod tek kullanımlık).
 */
export function readKeycloakCallback(query: URLSearchParams): KeycloakCallbackResult {
  const raw = sessionStorage.getItem(PENDING_KEY);
  sessionStorage.removeItem(PENDING_KEY);
  const pending: PendingLogin | null = raw ? JSON.parse(raw) : null;

  if (!pending || pending.state !== query.get('state')) {
    throw new Error('Keycloak dönüşü bu oturumda başlatılan girişle eşleşmiyor');
  }
  if (query.has('error')) {
    throw new Error(`Keycloak hatası: ${query.get('error')} ${query.get('error_description') ?? ''}`);
  }

  return {
    code: { code: query.get('code')!, codeVerifier: pending.verifier, redirectUri: pending.redirectUri },
    returnUrl: pending.returnUrl
  };
}

function randomString(byteCount: number): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteCount)));
}

// crypto.subtle yalnızca güvenli bağlamda (https ya da localhost) vardır
async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
