import {
  ApplicationConfig,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { registerLocaleData } from '@angular/common';
import localeTr from '@angular/common/locales/tr';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { endpointInterceptor } from './interceptors/endpoint-interceptor';
import { ErrorInterceptor } from './interceptors/error-interceptor';

//import { provideNgxMask } from 'ngx-mask';
//import { endpointInterceptor } from './interceptors/endpoint-interceptor';
//import { errorInterceptor } from './interceptors/error-interceptor';

registerLocaleData(localeTr);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([endpointInterceptor, ErrorInterceptor])),
    provideHttpClient(),
    //provideNgxMask(),
    { provide: LOCALE_ID, useValue: 'tr'}
  ],
};
