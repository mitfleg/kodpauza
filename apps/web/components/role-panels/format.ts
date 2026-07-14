import type { Campaign, CampaignStatus, FraudSeverity, FraudStatus } from './types';

const statusLabels: Record<string, string> = {
  draft: 'Черновик',
  pending: 'На модерации',
  active: 'Активна',
  paused: 'На паузе',
  rejected: 'Отклонена',
  budget_exhausted: 'Бюджет исчерпан',
  impression_limit_reached: 'Лимит исчерпан',
};

export const statusClasses: Record<string, string> = {
  draft: 'border-slate-200 bg-slate-50 text-slate-700',
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  paused: 'border-blue-200 bg-blue-50 text-blue-700',
  rejected: 'border-red-200 bg-red-50 text-red-700',
  budget_exhausted: 'border-red-200 bg-red-50 text-red-700',
  impression_limit_reached: 'border-violet-200 bg-violet-50 text-violet-700',
};

const fraudStatusLabels: Record<FraudStatus, string> = {
  clean: 'Чистое',
  suspicious: 'Подозрительное',
  rejected: 'Отклонено',
};

export const severityLabels: Record<FraudSeverity, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
};

const roleLabels: Record<string, string> = {
  developer: 'Разработчик',
  advertiser: 'Рекламодатель',
  admin: 'Администратор',
};

export const payoutLabels: Record<string, string> = {
  mock: 'Вывод средств пока недоступен',
  pending: 'Ожидает выплаты',
  blocked: 'Заблокировано',
};

export const developerPayoutLabels: Record<string, string> = {
  requested: 'На проверке',
  paid: 'Выплачено',
  rejected: 'Отклонено',
  canceled: 'Отменено',
};

const fraudReasonLabels: Record<string, string> = {
  visible_ms_less_than_5000: 'Показ короче 5 секунд',
  visible_ms_too_large: 'Слишком долгая видимость',
  hour_limit_exceeded: 'Превышен часовой лимит',
  day_limit_exceeded: 'Превышен дневной лимит',
  too_frequent: 'Слишком частые события',
  too_many_clicks: 'Слишком много кликов',
};

const auditActionLabels: Record<string, string> = {
  'campaign.approve': 'Кампания одобрена',
  'campaign.pause': 'Кампания на паузе',
  'campaign.reject': 'Кампания отклонена',
  'integration.version.acknowledge': 'Версия интеграции принята в работу',
  'developer-payout.paid': 'Выплата разработчику подтверждена',
  'developer-payout.rejected': 'Выплата разработчику отклонена',
};

export function money(value = 0, digits = 2) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value / 100);
}

export function integer(value = 0) {
  return new Intl.NumberFormat('ru-RU').format(value);
}

export function counted(value: number, one: string, few: string, many: string) {
  const normalized = Math.abs(Math.trunc(value));
  const lastTwo = normalized % 100;
  const last = normalized % 10;
  const form =
    lastTwo >= 11 && lastTwo <= 19 ? many : last === 1 ? one : last >= 2 && last <= 4 ? few : many;
  return `${integer(value)} ${form}`;
}

export function dateTime(value?: string) {
  if (!value) return 'Нет даты';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function kopecksFromRubles(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '0').replace(',', '.');
  return Math.round(Number(normalized) * 100);
}

export function optionalPositiveInteger(value: FormDataEntryValue | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

export function campaignStatus(status: string) {
  return statusLabels[status as CampaignStatus] ?? status;
}

export function campaignStatusClass(status: string) {
  return statusClasses[status as CampaignStatus] ?? statusClasses.draft;
}

export function effectiveCampaignStatus(campaign: Campaign) {
  const nextImpressionCost = Math.floor(campaign.cpmKopecks / 1000);
  if (
    campaign.status === 'active' &&
    campaign.spentKopecks + nextImpressionCost > campaign.budgetKopecks
  ) {
    return 'budget_exhausted';
  }
  if (
    campaign.status === 'active' &&
    typeof campaign.impressionsLimit === 'number' &&
    campaign.impressionsServed >= campaign.impressionsLimit
  ) {
    return 'impression_limit_reached';
  }
  return campaign.status;
}

export function isCampaignDelivering(campaign: Campaign) {
  return effectiveCampaignStatus(campaign) === 'active';
}

export function fraudStatus(status: string) {
  return fraudStatusLabels[status as FraudStatus] ?? status;
}

export function roleName(role: string) {
  return roleLabels[role] ?? role;
}

export function fraudReason(reason: string) {
  return reason
    .split(',')
    .map((item) => fraudReasonLabels[item.trim()] ?? item.trim())
    .join(', ');
}

export function auditAction(action: string) {
  return auditActionLabels[action] ?? action;
}

export function spendPercent(campaign: Campaign) {
  if (campaign.budgetKopecks <= 0) return 0;
  return Math.min(100, Math.round((campaign.spentKopecks / campaign.budgetKopecks) * 100));
}
