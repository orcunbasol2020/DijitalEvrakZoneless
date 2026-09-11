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
                path: 'documentlist',
                loadChildren: () => import('./pages/documentlist/route')
            },
            {
                path: 'zimmetlerim',
                loadComponent: () => import('./pages/zimmetlerim/zimmetlerim')
            },
            {
                path: 'scanneddocument',
                loadComponent: () => import('./pages/scanneddocument/scanneddocument')
            },
            {
                path: "ocrtakip",
                loadComponent: () => import("./pages/ocrtakip/ocrtakip")
            },
            {
                path: "dijitallestirme-takip",
                loadComponent: () => import("./pages/dijitallestirme-takip/dijitallestirme-takip")
            },
            {
                path: 'users',
                loadChildren: () => import('./pages/users/route')
            },
            {
                path: 'externaluser',
                loadComponent: () => import('./pages/users/externaluser/externaluser')
            },
            {
                path: 'externaluser/:id/zimmetler',
                loadComponent: () => import('./pages/users/externaluser/externaluser-zimmetleri/externaluser-zimmetleri')
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
            },
            {
                path: 'parameters/languages',
                loadComponent: () => import('./pages/parameters/languages/languages')
            },
                        {
                path: 'externalinstitution',
                loadComponent: () => import('./pages/parameters/external-institutions/external-institutions')
            },
            {
                path: 'gidenevrak/outgoing',
                loadComponent: () => import('./pages/gidenevrak/outgoing/outgoing')
            },
            {
                path: 'gidenevrak/zimmet',
                loadComponent: () => import('./pages/gidenevrak/zimmet/zimmet')
            },
            {
                path: 'gidenevrak/outgoingzimmet',
                loadComponent: () => import('./pages/gidenevrak/outgoingzimmet/outgoingzimmet')
            },
            {
                path: 'envelope',
                loadComponent: () => import('./pages/envelope/envelope/envelope')
            },
                        {
                path: 'gidenzimmet',
                loadComponent: () => import('./pages/gidenevrak/gidenzimmet/gidenzimmet')
            },
            {
                path: 'ticket',
                loadComponent: () => import('./pages/envelope/ticket/ticket')
            },
            {
                path: 'settings',
                loadComponent: () => import('./pages/settings/settings')
            },
            {
                path: 'support',
                loadComponent: () => import('./pages/support/support')
            },
            {
                path: 'documents',
                loadComponent: () => import('./pages/documents/documents')
            },
            {
                path: 'reports',
                loadComponent: () => import('./pages/reports/reports')
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

