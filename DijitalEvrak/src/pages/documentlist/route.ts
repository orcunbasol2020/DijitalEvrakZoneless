import { Routes } from "@angular/router"
const route: Routes = [
        {
                path: '',
                loadComponent: () => import('./documentlist')
        }
]

export default route;