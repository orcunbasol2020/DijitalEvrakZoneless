import { DocumentTransactionModel } from './documenttransaction.model';

// Gelen evrak süreç akışı (işlem geçmişi) kuralları: Süreçler sayfası ve Gelen Evraklar
// listesindeki Süreç popup'ı aynı adım gruplamasını, ikonları ve renkleri kullanır.

export type ProcessTone = 'info' | 'success' | 'warning' | 'neutral' | 'publish';

// Sürecin kilometre taşı sayılan adımları; diğer adımlardan daha belirgin çizilir.
export type ProcessMilestone = 'publish' | 'deliver' | 'archive';

// Zaman çizelgesindeki bir satır: ana işlem + ona bağlı alt işlemler.
export interface ProcessStep {
  t: DocumentTransactionModel;
  children: DocumentTransactionModel[];
}

// İşlem türüne göre zaman çizelgesi düğümünün ikonu ve rengi.
// 1 Ön Kayıt, 6 Zimmet, 7 Teslim, 8 OCR, 9 Birim Arşivi, 17 Şerhli Kabul; diğerleri varsayılan.
const TYPE_STYLE: Record<number, { icon: string; tone: ProcessTone }> = {
  1: { icon: 'app_registration', tone: 'info' },
  6: { icon: 'contract_edit', tone: 'info' },
  7: { icon: 'task_alt', tone: 'success' },
  8: { icon: 'document_scanner', tone: 'warning' },
  9: { icon: 'assured_workload', tone: 'neutral' },
  17: { icon: 'rule', tone: 'warning' },
};

// Yayınlama adımının işlem türü numarası frontend'de bilinmiyor; bu yüzden kilometre
// taşları hem bilinen tür numarasından hem de backend'in gönderdiği işlem adından
// (transactionTypeName) tanınır. Adı "yayın" içeren her işlem yayınlama sayılır.
const MILESTONE_BY_TYPE: Record<number, ProcessMilestone> = {
  7: 'deliver',
  9: 'archive',
};

const MILESTONE_BY_NAME: Array<{ pattern: RegExp; kind: ProcessMilestone }> = [
  { pattern: /yay[ıi]n/i, kind: 'publish' },
  { pattern: /teslim/i, kind: 'deliver' },
  { pattern: /ar[şs]iv/i, kind: 'archive' },
];

const MILESTONE_STYLE: Record<ProcessMilestone, { icon: string; tone: ProcessTone }> = {
  publish: { icon: 'verified', tone: 'publish' },
  deliver: { icon: 'task_alt', tone: 'success' },
  archive: { icon: 'assured_workload', tone: 'neutral' },
};

const ZIMMET_TYPE = 6;
const UPDATED_TYPE = 3;

// Yayınlamanın hemen ardından bu süre içinde oluşan zimmet, yayınlama ile birlikte
// otomatik açılmış sayılır ve ayrı bir adım yerine yayınlamanın alt adımı olarak çizilir.
const AUTO_ZIMMET_WINDOW_MS = 5 * 60 * 1000;

// Adımın kilometre taşı türü; kilometre taşı değilse null.
export function processMilestoneKind(t: DocumentTransactionModel): ProcessMilestone | null {
  const byType = MILESTONE_BY_TYPE[t.transactionType];
  if (byType) return byType;
  const name = t.transactionTypeName ?? '';
  return MILESTONE_BY_NAME.find(m => m.pattern.test(name))?.kind ?? null;
}

export function processTypeIcon(t: DocumentTransactionModel): string {
  const kind = processMilestoneKind(t);
  if (kind) return MILESTONE_STYLE[kind].icon;
  return TYPE_STYLE[t.transactionType]?.icon ?? 'radio_button_checked';
}

export function processTypeTone(t: DocumentTransactionModel): ProcessTone {
  const kind = processMilestoneKind(t);
  if (kind) return MILESTONE_STYLE[kind].tone;
  return TYPE_STYLE[t.transactionType]?.tone ?? 'neutral';
}

// Kişi satırındaki küçük etiket: işlem türüne göre rolü.
export function processPersonLabel(t: DocumentTransactionModel): string {
  if (processMilestoneKind(t) === 'publish') return 'Yayınlayan';
  const type = t.transactionType;
  if (type === 1) return 'Kaydeden';
  if (type === 6) return 'Zimmet Sahibi';
  if (type === 9) return 'Arşivleyen';
  if (type === 17) return 'Kabul Eden';
  return 'Kullanıcı';
}

// İşlemler eskiden yeniye sıralanır (çizelge yukarıdan aşağı akar);
// "Güncellendi" (3) kayıtları akışta gösterilmez.
export function sortProcessTransactions(list: DocumentTransactionModel[] | null | undefined): DocumentTransactionModel[] {
  return (list ?? [])
    .filter(t => t.transactionType !== UPDATED_TYPE)
    .sort((a, b) => new Date(a.createdDate).getTime() - new Date(b.createdDate).getTime());
}

// İşlemler adımlara gruplanır: yayınlamayı kısa süre içinde izleyen zimmet
// (otomatik zimmet) yayınlama adımının altına alınır; diğer işlemler tek başına adımdır.
export function buildProcessSteps(list: DocumentTransactionModel[]): ProcessStep[] {
  const result: ProcessStep[] = [];
  for (const t of list) {
    const prev = result[result.length - 1];
    if (prev && isAutoZimmetOf(prev, t)) {
      prev.children.push(t);
      continue;
    }
    result.push({ t, children: [] });
  }
  return result;
}

function isAutoZimmetOf(step: ProcessStep, t: DocumentTransactionModel): boolean {
  if (t.transactionType !== ZIMMET_TYPE) return false;
  if (processMilestoneKind(step.t) !== 'publish') return false;
  // Yayınlama adımının altında zaten bir zimmet varsa ikinci zimmet ayrı adım olur.
  if (step.children.length) return false;
  const diff = new Date(t.createdDate).getTime() - new Date(step.t.createdDate).getTime();
  return diff >= 0 && diff <= AUTO_ZIMMET_WINDOW_MS;
}
