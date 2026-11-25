import { UserModel } from '../pages/users/users';

// Profil resimleri backend'den gelir (bkz. UserPhotoService, app-user-photo).

// Profil resmi olmayan kullanıcılar için ad-soyad baş harfleri (avatar yerine gösterilir).
export function getUserInitials(user: Partial<Pick<UserModel, 'name' | 'surname'>> | null | undefined): string {
  const first = (user?.name ?? '').trim().charAt(0);
  const last = (user?.surname ?? '').trim().charAt(0);
  return `${first}${last}`.toLocaleUpperCase('tr') || '?';
}
