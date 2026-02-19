import { Routes } from "@angular/router";

const routes: Routes = [
    {
        path: '',
        loadComponent: () => import('./users')
    },
    {
        path: 'create',
        loadComponent: () => import('./create/create')
    },
    {
        path: 'edit/:id',
        loadComponent: () => import('./create/create')
    },
    {
        path: 'profile',
        loadComponent: () => import('./profile/profile')
    },
    {
        path: 'role',
        loadComponent: () => import('./role/role')
    }
]

export default routes;