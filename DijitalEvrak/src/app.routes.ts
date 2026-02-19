import { Routes } from '@angular/router';
import { authGuard } from './guards/auth-guard';

export const routes: Routes = [
    {
        path: "login",
        loadComponent: () => import("./pages/login/login")
    },
    {
        path: "",
        loadComponent: () => import("./pages/layouts/layouts"),
        canActivateChild: [authGuard],
        children: [
            {
                path: "",
                loadComponent: () => import("./pages/home/home")
            },
            {
                path: "onkayit",
                loadComponent: () => import("./pages/onkayit/onkayit")
            },
            {
                path: "qrokut",
                loadComponent: () => import("./pages/qrokut/qrokut")
            },
            {
                path: "qrlist",
                loadComponent: () => import("./pages/qrlist/qrlist")
            },
            {
                path: "zimmet",
                loadComponent: () => import("./pages/zimmet/zimmet")
            },
            {
                path: 'scanlist',
                loadChildren: () => import('./pages/scanlist/route')
            },
            {
                path: "ocrtakip",
                loadComponent: () => import("./pages/ocrtakip/ocrtakip")
            },
            {
                path: 'users',
                loadChildren: () => import('./pages/users/route')
            },
            {
                path: 'evrakkayit',
                loadComponent: () => import('./pages/evrakkayit/evrakkayit')
            },
            {
                path: 'havale',
                loadComponent: () => import('./pages/havale/havale')
            },
            {
                path: 'surecler',
                loadComponent: () => import('./pages/surecler/surecler')
            },
            {
                path: 'birimler',
                loadComponent: () => import('./pages/parameters/departments/departments')
            }
            /*
            {
                path: 'evrakkayit/:id',
                loadComponent: () => import('./pages/evrakkayit/evrakkayit')
            } 
            */

        ]
    }
];

