import { Injectable, inject } from '@angular/core';
import { HttpService } from './http';

@Injectable({ providedIn: 'root' })
export class UserRoleService {

  private httpService = inject(HttpService);
  private baseUrl = 'api/UserRole';

  getRolesByUserId(userId: string) {
    return this.httpService.get<string[]>(
      `${this.baseUrl}/GetRolesByUserId?UserId=${encodeURIComponent(userId)}`
    );
  }

  assignRoles(userId: string, roleIds: string[]) {
    return this.httpService.post(`${this.baseUrl}/AssignRoles`, { userId, roleIds });
  }

  removeRole(userId: string, roleId: string) {
    return this.httpService.delete(
      `${this.baseUrl}/RemoveRole?UserId=${encodeURIComponent(userId)}&RoleId=${encodeURIComponent(roleId)}`
    );
  }
}
