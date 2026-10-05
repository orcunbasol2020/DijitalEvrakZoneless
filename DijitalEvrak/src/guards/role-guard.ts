import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { FlexiToastService } from 'flexi-toast';
import { RoleService } from '../services/role-service';

export const roleGuard: CanActivateFn = (route) => {
  const requiredRoles = route.data['roles'] as string[] | undefined;
  // Menüdeki excludeRoles ile aynı anlam: bu rollerden biri olan kullanıcı sayfayı açamaz
  const excludeRoles = route.data['excludeRoles'] as string[] | undefined;

  const roleService = inject(RoleService);

  const allowed = (!requiredRoles?.length || roleService.hasAny(requiredRoles))
    && !(excludeRoles?.length && roleService.hasAny(excludeRoles));

  if (allowed) {
    return true;
  }

  const router = inject(Router);
  const toast = inject(FlexiToastService);

  toast.showToast("Hata", "Bu sayfaya erişim yetkiniz yok", "error");
  router.navigateByUrl("/");
  return false;
};
