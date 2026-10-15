import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from "@angular/common/http";
import { inject } from "@angular/core";
import { catchError, throwError } from "rxjs";
import { ErrorService } from "../services/error"; // isim çakışmasın diye Error değil ErrorService diyelim

/**
 * Hata mesajını çağıran taraf kendisi gösterecekse (ör. backend'in Message alanı)
 * genel hata toast'ı atlanır; aksi halde ekranda iki toast çıkar.
 */
export const SKIP_ERROR_TOAST = new HttpContextToken<boolean>(() => false);

export const ErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const errorService = inject(ErrorService);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (!req.context.get(SKIP_ERROR_TOAST)) {
        errorService.handle(err);
      }

      // Hata uygulamada üst katmanlara (component, service vs.) da iletilsin:
      return throwError(() => err);
    })
  );
};
