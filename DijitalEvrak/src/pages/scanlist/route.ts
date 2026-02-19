import { Routes } from "@angular/router"
const route: Routes = [
        {
                path: '',
                loadComponent: () => import('./scanlist')
        },
        {
                path: "create",
                loadComponent: () => import('./create/create')
        }
]

export default route;