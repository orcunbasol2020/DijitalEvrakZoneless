import { Routes } from "@angular/router";
import { canDeactivateCreate } from "./create/create";
import { roleGuard } from "../../guards/role-guard";

const routes: Routes = [
    {
        path: '',
        loadComponent: () => import('./users')
    },
    {
        path: 'create',
        loadComponent: () => import('./create/create'),
        canDeactivate: [canDeactivateCreate]
    },
    {
        path: 'edit/:id',
        loadComponent: () => import('./create/create'),
        canDeactivate: [canDeactivateCreate]
    },
    {
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