// actionRequired: true = Gereği, false = Bilgi

export function actionRequiredLabel(value: boolean | null | undefined): string {
  if (value === true) return 'Gereği';
  if (value === false) return 'Bilgi';
  return '-';
}

export function actionRequiredBadgeClass(value: boolean | null | undefined): string {
  if (value === true) return 'bg-warning text-dark';
  if (value === false) return 'bg-info-subtle text-info border border-info-subtle';
  return 'bg-secondary-subtle text-secondary border border-secondary-subtle';
}

export const actionRequiredOptions = [
  { value: true, label: 'Gereği' },
  { value: false, label: 'Bilgi' }
];
