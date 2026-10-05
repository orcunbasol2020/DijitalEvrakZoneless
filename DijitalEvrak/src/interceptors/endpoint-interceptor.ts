import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../environments/environment';

// "api/..." ile başlayan istekler backend kök adresine yönlendirilir (bkz. environments)
export const endpointInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('api/')) {
    return next(req);
  }
  return next(req.clone({ url: environment.apiUrl + req.url }));
};
