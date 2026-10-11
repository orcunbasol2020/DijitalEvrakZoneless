import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Common } from '../services/common';
import { readStoredUser } from '../services/login-session';

export const authGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const user = readStoredUser();

  if (!user) {
    // Giriş (canlıda otomatik Windows girişi) sonrası açılmak istenen sayfaya dönülür
    const returnUrl = state.url && state.url !== '/' ? state.url : null;
    return router.createUrlTree(['/login'], { queryParams: returnUrl ? { returnUrl } : {} });
  }

  inject(Common).user.set(user);
  return true;
};
