import { UserModel } from '../pages/users/users';

// Kullanıcı adına göre statik profil resmi eşlemesi.
// Öncelik userName'dedir; eski kayıtlar için ad (name) ile de eşleşir.
const AVATARS_BY_USERNAME: Record<string, string> = {
  'gokce.gurkas': 'assets/images/personel/gokce.jpg',
};

const AVATARS_BY_NAME: Record<string, string> = {
  'Bülent': 'assets/images/personel/bulent.jpg',
  'Tahsin': 'assets/images/personel/tahsin.jpg',
};

export function getUserAvatar(user: UserModel | undefined, fallback: string | null = null): string | null {
  if (!user) return fallback;

  const byUserName = AVATARS_BY_USERNAME[(user.userName ?? '').toLocaleLowerCase('tr')];
  if (byUserName) return byUserName;

  return AVATARS_BY_NAME[user.name ?? ''] ?? fallback;
}
