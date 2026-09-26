// actionRequired: true = Gereği, false = Bilgi

export function actionRequiredLabel(value: boolean | null | undefined): string {
  if (value === true) return 'Gereği';
  if (value === false) return 'Bilgi';
  return '-';
}

// Rozet rengi: Gereği = mavi-turkuaz, Bilgi = yeşil (sınıflar styles.css'te)
export function actionRequiredBadgeClass(value: boolean | null | undefined): string {
  if (value === true) return 'ar-badge-geregi';
  if (value === false) return 'ar-badge-bilgi';
  return 'bg-secondary-subtle text-secondary border border-secondary-subtle';
}

// Rozet ikonu: Gereği = yapılacak iş (pending_actions), Bilgi = bilgilendirme (info)
export function actionRequiredIcon(value: boolean | null | undefined): string {
  if (value === true) return 'pending_actions';
  if (value === false) return 'info';
  return 'help';
}

export const actionRequiredOptions = [
  { value: true, label: 'Gereği' },
  { value: false, label: 'Bilgi' }
];
