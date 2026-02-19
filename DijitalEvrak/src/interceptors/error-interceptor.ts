import { HttpErrorResponse, HttpInterceptorFn } from "@angular/common/http";
import { inject } from "@angular/core";
import { catchError, throwError } from "rxjs";
import { ErrorService } from "../services/error"; // isim çakışmasın diye Error değil ErrorService diyelim

export const ErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const errorService = inject(ErrorService);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      errorService.handle(err);

      // Hata uygulamada üst katmanlara (component, service vs.) da iletilsin:
      return throwError(() => err);
    })
  );
};
