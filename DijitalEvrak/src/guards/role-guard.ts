import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { FlexiToastService } from 'flexi-toast';
import { RoleService } from '../services/role-service';

export const roleGuard: CanActivateFn = (route) => {
  const requiredRoles = route.data['roles'] as string[] | undefined;

  const roleService = inject(RoleService);

  if (!requiredRoles?.length || roleService.hasAny(requiredRoles)) {
    return true;
  }

  const router = inject(Router);
  const toast = inject(FlexiToastService);

  toast.showToast("Hata", "Bu sayfaya erişim yetkiniz yok", "error");
  router.navigateByUrl("/");
  return false;
};
