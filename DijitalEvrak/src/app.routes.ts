import { Routes } from '@angular/router';
import { authGuard } from './guards/auth-guard';
import { roleGuard } from './guards/role-guard';
import { LIMITED_ROLES } from './navigation';

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
                loadComponent: () => import("./pages/onkayit/onkayit"),
                canActivate: [roleGuard],
                data: { roles: ["Gelen Evrak", "Ön Kayıt"] }
            },
            {
                path: "onkayitlar",
                loadComponent: () => import("./pages/onkayitlar/onkayitlar"),
                canActivate: [roleGuard],
                data: { roles: ["Gelen Evrak", "Ön Kayıt", "Yönetici"] }
            },
            {
                path: "qrokut",
                loadComponent: () => import("./pages/qrokut/qrokut"),
                canActivate: [roleGuard],
                data: { roles: ["Gelen Evrak", "Ön Kayıt"] }
            },
            {
                path: "qrlist",
                loadComponent: () => import("./pages/qrlist/qrlist"),
                canActivate: [roleGuard],
                data: { roles: ["Gelen Evrak"] }
            },
            {
                path: "zimmet",
                loadComponent: () => import("./pages/zimmet/zimmet"),
                canActivate: [roleGuard],
                data: { roles: ["Gelen Evrak", "Birim Evrak Sorumlusu", "Birim Yöneticisi", "Ön Kayıt"] }
            },
            {
                path: 'scanlist',
                loadChildren: () => import('./pages/scanlist/route'),
                canActivate: [roleGuard],
                data: { roles: ["Gelen Evrak", "Ön Kayıt"] }
            },
            {
                // Birim Evrak Sorumlusu'nun "Gelen Evraklar"ı: kendi birimine gelen
                // evrakların salt okunur, hafif listesi (scanlist'in birim sürümü).
                path: 'incomingDepartmentDocument',
                loadComponent: () => import('./pages/incoming-department-document/incoming-department-document'),
                canActivate: [roleGuard],
                data: { roles: ["Birim Evrak Sorumlusu", "Birim Yöneticisi"] }
            },
            {
                path: 'documentlist',
                loadChildren: () => import('./pages/documentlist/route'),
                canActivate: [roleGuard],
                data: { roles: ["Yönetici"] }
            },
            {
                path: 'zimmetlerim',
                loadComponent: () => import('./pages/zimmetlerim/zimmetlerim')
            },
            {
                // Kurum içi Devir / Teslim talepleri: alıcı onaylar, devreden izler.
                // Her kullanıcıya evrak devredilebildiği için rol kısıtı yok.
                path: 'zimmet-onaylari',
                loadComponent: () => import('./pages/zimmet-onaylari/zimmet-onaylari')
            },
            {
                path: 'scanneddocument',
                loadComponent: () => import('./pages/scanneddocument/scanneddocument'),
                canActivate: [roleGuard],
                data: { roles: ["Gelen Evrak"] }
            },
            {
                path: "ocrtakip",
                loadComponent: () => import("./pages/ocrtakip/ocrtakip"),
                canActivate: [roleGuard],
                data: { roles: ["Gelen Evrak", "Yönetici"] }
            },
            {
                // Gelen Evrak panelindeki "Teslim Alınmayı Bekleyen Evraklar" kartının tüm birimleri
                path: "teslim-bekleyenler",
                loadComponent: () => import("./pages/teslim-bekleyenler/teslim-bekleyenler"),
                canActivate: [roleGuard],
                data: { roles: ["Gelen Evrak", "Yönetici"] }
            },
            {
                path: "dijitallestirme-takip",
                loadComponent: () => import("./pages/dijitallestirme-takip/dijitallestirme-takip"),
                canActivate: [roleGuard],
                data: { roles: ["Gelen Evrak", "Yönetici"] }
            },
            {
                // Rol koruması alt rotalarda: /users/profile her kullanıcıya açık,
                // kullanıcı listesi ve düzenleme sayfaları rol gerektirir (bkz. pages/users/route.ts).
                path: 'users',
                loadChildren: () => import('./pages/users/route')
            },
            {
                path: 'externaluser',
                loadComponent: () => import('./pages/users/externaluser/externaluser'),
                canActivate: [roleGuard],
                data: { roles: ["Gelen Evrak"] }
            },
            {
                path: 'externaluser/:id/zimmetler',
                loadComponent: () => import('./pages/users/externaluser/externaluser-zimmetleri/externaluser-zimmetleri'),
                canActivate: [roleGuard],
                data: { roles: ["Gelen Evrak"] }
            },
            {
                path: 'evrakkayit',
                loadComponent: () => import('./pages/evrakkayit/evrakkayit')
            },
            {
                path: 'havale',
                loadComponent: () => import('./pages/havale/havale'),
                canActivate: [roleGuard],
                data: { excludeRoles: LIMITED_ROLES }
            },
            {
                path: 'surecler',
                loadComponent: () => import('./pages/surecler/surecler')
            },
            {
                path: 'birimler',
                loadComponent: () => import('./pages/parameters/departments/departments'),
                canActivate: [roleGuard],
                data: { excludeRoles: LIMITED_ROLES }
            },
            {
                path: 'parameters/languages',
                loadComponent: () => import('./pages/parameters/languages/languages'),
                canActivate: [roleGuard],
                data: { excludeRoles: LIMITED_ROLES }
            },
                        {
                path: 'externalinstitution',
                loadComponent: () => import('./pages/parameters/external-institutions/external-institutions'),
                canActivate: [roleGuard],
                data: { excludeRoles: LIMITED_ROLES }
            },
            {
                path: 'gidenevrak/outgoing',
                loadComponent: () => import('./pages/gidenevrak/outgoing/outgoing')
            },
            {
                path: 'gidenevrak/outgoing/create',
                loadComponent: () => import('./pages/gidenevrak/outgoingcreate/outgoingcreate')
            },
            {
                path: 'gidenevrak/outgoing/create/:id',
                loadComponent: () => import('./pages/gidenevrak/outgoingcreate/outgoingcreate')
            },
            {
                path: 'gidenevrak/zimmet',
                loadComponent: () => import('./pages/gidenevrak/zimmet/zimmet'),
                canActivate: [roleGuard],
                data: { roles: ["Gelen Evrak", "Giden Evrak", "Ön Kayıt"] }
            },
            {
                path: 'gidenevrak/outgoingzimmet',
                loadComponent: () => import('./pages/gidenevrak/outgoingzimmet/outgoingzimmet')
            },
            {
                path: 'gidenevrak/outgoingteslim',
                loadComponent: () => import('./pages/gidenevrak/outgoingteslim/outgoingteslim')
            },
            {
                path: 'envelope',
                loadComponent: () => import('./pages/envelope/envelope/envelope'),
                canActivate: [roleGuard],
                data: { roles: ["Gelen Evrak", "Birim Evrak Sorumlusu", "Birim Yöneticisi", "Giden Evrak", "Ön Kayıt", "Yönetici"] }
            },
                        {
                path: 'gidenzimmet',
                loadComponent: () => import('./pages/gidenevrak/gidenzimmet/gidenzimmet'),
                // Zarflar ve Teslim Al / Zimmetle ekranlarından açılır; onların rolleri
                canActivate: [roleGuard],
                data: { roles: ["Gelen Evrak", "Birim Evrak Sorumlusu", "Birim Yöneticisi", "Giden Evrak", "Ön Kayıt", "Yönetici"] }
            },
            {
                // Kargoya verilmiş paketlerin listesi ve durum güncellemesi (Yolda / Teslim Edildi / İade)
                path: 'kargo-takip',
                loadComponent: () => import('./pages/kargo-takip/kargo-takip'),
                canActivate: [roleGuard],
                data: { roles: ["Gelen Evrak", "Giden Evrak", "Ön Kayıt", "Yönetici"] }
            },
            {
                path: 'ticket',
                loadComponent: () => import('./pages/envelope/ticket/ticket'),
                canActivate: [roleGuard],
                data: { roles: ["Gelen Evrak", "Birim Evrak Sorumlusu", "Birim Yöneticisi", "Giden Evrak", "Ön Kayıt"] }
            },
            {
                path: 'settings',
                loadComponent: () => import('./pages/settings/settings')
            },
            {
                // Uygulama ayarları (AppSettings): yalnızca yönetici görür ve değiştirir
                path: 'app-settings',
                loadComponent: () => import('./pages/app-settings/app-settings'),
                canActivate: [roleGuard],
                data: { roles: ["Yönetici"] }
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
                loadComponent: () => import('./pages/reports/reports'),
                canActivate: [roleGuard],
                data: { excludeRoles: LIMITED_ROLES }
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

