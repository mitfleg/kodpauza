import { CheckCircle2, Eye, ExternalLink, MousePointerClick, Pause, RotateCcw, XCircle } from 'lucide-react';
import {
  auditAction,
  counted,
  dateTime,
  effectiveCampaignStatus,
  fraudReason,
  fraudStatus,
  money,
  roleName,
  severityLabels,
  spendPercent,
} from './format';
import type {
  AdminAuditLog,
  AdminEvent,
  AdminUser,
  Campaign,
  IntegrationVersionReport,
  DeveloperEvent,
  FraudFlag,
  FraudSeverity,
} from './types';
import { EmptyState, SecondaryButton, SoftBadge, StatusBadge } from './ui';

export function DeveloperEventList({ events }: { events: DeveloperEvent[] }) {
  if (!events.length) {
    return <EmptyState title="Событий пока нет" text="После первого засчитанного показа здесь появится журнал." />;
  }

  return (
    <div className="overflow-hidden rounded-md border border-line">
      <div className="hidden grid-cols-[130px_minmax(0,1fr)_150px_140px] gap-4 bg-slate-50 px-4 py-2 text-xs font-medium uppercase text-slate-500 md:grid">
        <div>Событие</div>
        <div>Кампания</div>
        <div>Проверка</div>
        <div className="text-right">Начисление</div>
      </div>
      <div className="divide-y divide-line">
        {events.map((event) => {
          const isImpression = event.type === 'impression';
          const Icon = isImpression ? Eye : MousePointerClick;
          return (
            <article key={event.eventId} className="grid gap-3 px-4 py-3 md:grid-cols-[130px_minmax(0,1fr)_150px_140px] md:items-center md:gap-4">
              <div className="flex items-center gap-2">
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${isImpression ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-800'}`}>
                  <Icon aria-hidden className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-ink">{isImpression ? 'Показ' : 'Клик'}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{dateTime(event.createdAt)}</div>
                </div>
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-ink">
                  {event.campaign?.name ?? event.campaign?.text ?? 'Кампания не указана'}
                </div>
                <div className="mt-1 truncate text-xs text-slate-500">{event.eventId}</div>
              </div>
              <div>
                <SoftBadge tone={event.fraudStatus === 'clean' ? 'green' : event.fraudStatus === 'rejected' ? 'red' : 'amber'}>
                  {fraudStatus(event.fraudStatus)}
                </SoftBadge>
              </div>
              <div className="md:text-right">
                <div className="text-sm font-semibold text-ink">{money(event.rewardKopecks)}</div>
                <div className="mt-0.5 text-xs text-slate-500">{isImpression ? 'за показ' : 'без начисления'}</div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function IntegrationVersionReportList({
  reports,
  busyId,
  onAcknowledge,
}: {
  reports: IntegrationVersionReport[];
  busyId?: string;
  onAcknowledge: (id: string) => void;
}) {
  if (!reports.length) {
    return <EmptyState title="Версии еще не обнаружены" text="Расширения разработчиков будут сообщать сюда версии Codex и Claude Code." />;
  }

  return (
    <div className="overflow-hidden rounded-md border border-line">
      <div className="divide-y divide-line">
        {reports.map((report) => (
          <article key={report.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(180px,0.8fr)_minmax(220px,1fr)_150px_auto] lg:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink">{integrationName(report.tool)} {report.version}</span>
                <SoftBadge tone={report.supported ? 'green' : report.acknowledgedAt ? 'slate' : 'amber'}>
                  {report.supported
                    ? report.compatibilityMode === 'structural' ? 'Совместима автоматически' : 'Проверена точно'
                    : report.acknowledgedAt
                      ? 'Обработано'
                      : report.attention === 'outdated_tool'
                        ? 'Нужно обновить инструмент'
                        : 'Требуется новый патч'}
                </SoftBadge>
              </div>
              <div className="mt-1 text-xs text-slate-500">Впервые: {dateTime(report.firstSeenAt)}</div>
            </div>
            <div className="text-sm text-slate-600">
              <div>{report.editorName} · Kodpauza {report.clientVersion}</div>
              <div className="mt-1 text-xs text-slate-500">Последний сигнал: {dateTime(report.lastSeenAt)}</div>
              {!report.supported && report.attention === 'outdated_tool' ? (
                <div className="mt-1 text-xs font-medium text-amber-700">
                  Попросите участника обновиться. Проверенная версия: {report.latestExactVersion}.
                </div>
              ) : null}
            </div>
            <div className="text-sm text-slate-600">{counted(report.reportCount, 'сообщение', 'сообщения', 'сообщений')}</div>
            <div className="lg:justify-self-end">
              {!report.supported && !report.acknowledgedAt ? (
                <SecondaryButton disabled={busyId === report.id} onClick={() => onAcknowledge(report.id)}>
                  <CheckCircle2 aria-hidden className="h-4 w-4" /> Обработано
                </SecondaryButton>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function integrationName(tool: IntegrationVersionReport['tool']): string {
  return tool === 'claude' ? 'Claude Code' : 'Codex';
}

export function CampaignList({
  campaigns,
  onAction,
}: {
  campaigns: Campaign[];
  onAction?: (campaign: Campaign, status: 'paused' | 'pending') => void;
}) {
  if (!campaigns.length) {
    return <EmptyState title="Кампаний пока нет" text="Создайте первую кампанию, чтобы отправить ее на модерацию." />;
  }

  return (
    <div className="grid gap-3">
      {campaigns.map((campaign) => (
        <article key={campaign.id} className={`rounded-md border bg-white p-4 ${campaign.format === 'premium' ? 'border-amber-300 shadow-[0_0_0_1px_rgba(245,158,11,0.08)]' : 'border-line'}`}>
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-ink">{campaign.name}</h3>
                <StatusBadge status={effectiveCampaignStatus(campaign)} />
                <SoftBadge tone={campaign.format === 'premium' ? 'amber' : 'slate'}>
                  {campaign.format === 'premium' ? 'Премиум' : 'Стандарт'}
                </SoftBadge>
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-600">{campaign.text}</p>
            </div>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
              {onAction && campaign.status === 'active' ? (
                <SecondaryButton onClick={() => onAction(campaign, 'paused')}>
                  <Pause aria-hidden className="h-4 w-4" /> Пауза
                </SecondaryButton>
              ) : null}
              {onAction && (campaign.status === 'rejected' || campaign.status === 'paused') ? (
                <SecondaryButton onClick={() => onAction(campaign, 'pending')}>
                  <RotateCcw aria-hidden className="h-4 w-4" /> На модерацию
                </SecondaryButton>
              ) : null}
              <a
                className="focus-ring inline-flex h-10 shrink-0 items-center gap-1 rounded-md px-2 text-sm font-semibold text-signal hover:bg-blue-50 hover:text-blue-800"
                href={campaign.url}
                target="_blank"
                rel="noreferrer"
              >
                Ссылка <ExternalLink aria-hidden className="h-4 w-4" />
              </a>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-md bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Результат</div>
              <div className="mt-1 text-sm font-semibold text-ink">
                {counted(campaign.impressionsServed, 'показ', 'показа', 'показов')} · {counted(campaign.clicks, 'клик', 'клика', 'кликов')}
              </div>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold text-ink">{money(campaign.spentKopecks)}</span>
                <span className="text-slate-500">{spendPercent(campaign)}%</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-white">
                <div className="h-2 rounded-full bg-mint" style={{ width: `${spendPercent(campaign)}%` }} />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                из {money(campaign.budgetKopecks)} · итоговый CPM: {money(campaign.billableCpmKopecks, 0)}
              </p>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export function AdminCampaignList({
  campaigns,
  onAction,
  busyId,
}: {
  campaigns: Campaign[];
  onAction: (id: string, kind: 'approve' | 'pause' | 'reject') => void;
  busyId?: string;
}) {
  if (!campaigns.length) {
    return <EmptyState title="Кампаний нет" text="Когда рекламодатель создаст кампанию, она появится здесь." />;
  }

  return (
    <div className="grid gap-3">
      {campaigns.map((campaign) => (
        <article key={campaign.id} className={`rounded-md border bg-white p-4 ${campaign.format === 'premium' ? 'border-amber-300' : 'border-line'}`}>
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-ink">{campaign.name}</h3>
                <StatusBadge status={effectiveCampaignStatus(campaign)} />
                <SoftBadge tone={campaign.format === 'premium' ? 'amber' : 'slate'}>
                  {campaign.format === 'premium' ? 'Премиум' : 'Стандарт'}
                </SoftBadge>
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-600">{campaign.text}</p>
            </div>
            <div className="flex w-full flex-wrap justify-start gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
              {campaign.status === 'pending' ? (
                <SecondaryButton disabled={busyId === campaign.id} onClick={() => onAction(campaign.id, 'approve')}>
                  <CheckCircle2 aria-hidden className="h-4 w-4" />
                  Одобрить
                </SecondaryButton>
              ) : null}
              {campaign.status === 'active' ? (
                <SecondaryButton disabled={busyId === campaign.id} onClick={() => onAction(campaign.id, 'pause')}>
                  <Pause aria-hidden className="h-4 w-4" />
                  Пауза
                </SecondaryButton>
              ) : null}
              {campaign.status === 'pending' || campaign.status === 'active' ? (
                <SecondaryButton disabled={busyId === campaign.id} onClick={() => onAction(campaign.id, 'reject')}>
                  <XCircle aria-hidden className="h-4 w-4" />
                  Отклонить
                </SecondaryButton>
              ) : null}
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Рекламодатель</div>
              <div className="mt-1 break-all text-sm font-semibold text-ink">{campaign.advertiser?.user?.email ?? 'Не указан'}</div>
            </div>
            <a href={campaign.url} target="_blank" rel="noreferrer" className="focus-ring rounded-md bg-blue-50 p-3 text-sm font-semibold text-signal hover:bg-blue-100">
              <span className="block text-xs font-normal text-blue-700">Целевая ссылка</span>
              <span className="mt-1 flex items-center gap-1 break-all">Открыть объявление <ExternalLink aria-hidden className="h-4 w-4" /></span>
            </a>
            <div className="rounded-md bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Результат</div>
              <div className="mt-1 text-sm font-semibold text-ink">
                {counted(campaign.impressionsServed, 'показ', 'показа', 'показов')} · {counted(campaign.clicks, 'клик', 'клика', 'кликов')}
              </div>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Финансы</div>
              <div className="mt-1 text-sm font-semibold text-ink">
                {money(campaign.spentKopecks)} из {money(campaign.budgetKopecks)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Базовый CPM {money(campaign.cpmKopecks, 0)} · итоговый {money(campaign.billableCpmKopecks, 0)}
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export function UserList({ users }: { users: AdminUser[] }) {
  if (!users.length) {
    return <EmptyState title="Пользователей нет" text="Список появится после первой регистрации." />;
  }

  return (
    <div className="overflow-hidden rounded-md border border-line">
      <div className="divide-y divide-line">
        {users.map((user) => (
          <div key={user.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="truncate font-medium text-ink">{user.email}</div>
              <div className="mt-1 text-xs text-slate-500">{user.displayName ?? 'Имя не указано'}</div>
              {user.advertiserProfile ? <div className="mt-1 text-xs text-slate-500">{user.advertiserProfile.companyName} · {money(user.advertiserProfile.balanceKopecks)}</div> : null}
              {user.developerProfile ? <div className="mt-1 text-xs text-slate-500">Баланс: {money(user.developerProfile.balanceKopecks)}</div> : null}
            </div>
            <SoftBadge tone={user.role === 'admin' ? 'blue' : user.role === 'advertiser' ? 'amber' : 'green'}>
              {roleName(user.role)}
            </SoftBadge>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminEventList({ events }: { events: AdminEvent[] }) {
  if (!events.length) {
    return <EmptyState title="Событий нет" text="Журнал появится после показов или кликов в расширении." />;
  }

  return (
    <div className="overflow-hidden rounded-md border border-line">
      <div className="divide-y divide-line">
        {events.map((event) => (
          <div key={event.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[90px_minmax(0,1fr)_110px] sm:items-center">
            <div className="font-medium text-ink">{event.type === 'impression' ? 'Показ' : 'Клик'}</div>
            <div className="min-w-0">
              <div className="truncate text-sm text-slate-700">{event.campaign?.name ?? 'Кампания не указана'}</div>
              <div className="mt-1 truncate text-xs text-slate-500">
                {event.user?.email ?? 'Пользователь не указан'} · {dateTime(event.createdAt)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-ink">{money(event.rewardKopecks)}</div>
              <div className="mt-1 text-xs text-slate-500">{fraudStatus(event.fraudStatus)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FraudList({ flags }: { flags: FraudFlag[] }) {
  if (!flags.length) {
    return <EmptyState title="Сигналов нет" text="Антифрод не нашел подозрительных событий в последних записях." />;
  }

  return (
    <div className="overflow-hidden rounded-md border border-line">
      <div className="divide-y divide-line">
        {flags.map((flag) => (
          <div key={flag.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_100px] sm:items-center">
            <div className="min-w-0">
              <div className="font-medium text-ink">{fraudReason(flag.reason)}</div>
              <div className="mt-1 truncate text-xs text-slate-500">
                {flag.user?.email ?? 'Пользователь не указан'} · {dateTime(flag.createdAt)}
              </div>
            </div>
            <div className="sm:text-right">
              <SoftBadge tone={flag.severity === 'high' ? 'red' : flag.severity === 'medium' ? 'amber' : 'blue'}>
                {severityLabels[flag.severity as FraudSeverity] ?? flag.severity}
              </SoftBadge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AuditLogList({ auditLog }: { auditLog: AdminAuditLog[] }) {
  if (!auditLog.length) {
    return <EmptyState title="Действий пока нет" text="Когда администратор изменит кампанию, запись появится здесь." />;
  }

  return (
    <div className="overflow-hidden rounded-md border border-line">
      <div className="divide-y divide-line">
        {auditLog.map((item) => (
          <div key={item.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_120px] sm:items-center">
            <div className="min-w-0">
              <div className="font-medium text-ink">{auditAction(item.action)}</div>
              <div className="mt-1 truncate text-xs text-slate-500">
                {item.admin?.email ?? 'Администратор не указан'} · {item.targetType}:{item.targetId}
              </div>
            </div>
            <div className="text-xs text-slate-500 sm:text-right">{dateTime(item.createdAt)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
