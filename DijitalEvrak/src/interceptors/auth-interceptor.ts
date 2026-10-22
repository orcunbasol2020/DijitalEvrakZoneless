import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Backend isteklerine oturumdaki JWT'yi ekler (Login / WindowsLogin / KeycloakLogin cevabındaki token).
 * [Authorize] ile korunan uç noktalar (ör. api/ErrorLogs) token olmadan 401 döner.
 * Windows girişi (withCredentials) Authorization başlığını Negotiate için kullandığından ona dokunulmaz.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('api/') || req.withCredentials || req.headers.has('Authorization')) {
    return next(req);
  }

  const token = readToken();
  return next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req);
};

/** Oturumu silmeden (readStoredUser'ın aksine) yalnızca token okunur. */
function readToken(): string | null {
  const raw = localStorage.getItem('user') ?? sessionStorage.getItem('user');
  if (!raw) return null;
  try {
    const token: unknown = JSON.parse(raw)?.token;
    return typeof token === 'string' && token ? token : null;
  } catch {
    return null;
  }
}
