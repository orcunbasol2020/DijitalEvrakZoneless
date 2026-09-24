import { Routes } from "@angular/router";
import { canDeactivateCreate } from "./create/create";
import { roleGuard } from "../../guards/role-guard";

// Kullanıcı yönetimi sayfalarına erişebilen roller
const USER_MANAGEMENT_ROLES = ["Gelen Evrak", "Yönetici"];

const routes: Routes = [
    {
        path: '',
        loadComponent: () => import('./users'),
        canActivate: [roleGuard],
        data: { roles: USER_MANAGEMENT_ROLES }
    },
    {
        path: 'create',
        loadComponent: () => import('./create/create'),
        canActivate: [roleGuard],
        canDeactivate: [canDeactivateCreate],
        data: { roles: USER_MANAGEMENT_ROLES }
    },
    {
        path: 'edit/:id',
        loadComponent: () => import('./create/create'),
        canActivate: [roleGuard],
        canDeactivate: [canDeactivateCreate],
        data: { roles: USER_MANAGEMENT_ROLES }
    },
    {
        // Kullanıcının kendi yetkilerini gördüğü sayfa; her oturum açmış kullanıcıya açık
        path: 'profile',
        loadComponent: () => import('./profile/profile')
    },
    {
        path: 'role',
        loadComponent: () => import('./role/role'),
        canActivate: [roleGuard],
        data: { roles: ["Yönetici"] }
    }
]

export default routes;