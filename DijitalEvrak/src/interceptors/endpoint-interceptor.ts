import { HttpInterceptorFn } from '@angular/common/http';

export const endpointInterceptor: HttpInterceptorFn = (req, next) => {
  const clone = req.clone({
    url: req.url.replace("api/", "https://localhost:7056/api/")
  });
  return next(clone);
};
