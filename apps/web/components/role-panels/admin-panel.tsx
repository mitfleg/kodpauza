'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BellRing,
  CircleDollarSign,
  Clock3,
  Gauge,
  History,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  type LucideIcon,
  UsersRound,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { counted, integer, isCampaignDelivering, money } from './format';
import {
  AdminCampaignList,
  AdminEventList,
  AuditLogList,
  FraudList,
  IntegrationVersionReportList,
  UserList,
} from './lists';
import { AdminPaymentList } from './admin-payments';
import {
  AdminDeveloperPayoutList,
  AdminPayoutReviewDialog,
  type PayoutReview,
} from './admin-developer-payouts';
import type { AdminData, ApiError } from './types';
import { LoadingBlock, Message, PrimaryButton, SecondaryButton, WorkSurface } from './ui';

export type AdminSection = 'overview' | 'campaigns' | 'users' | 'finance' | 'security';
type SecurityTab = 'events' | 'fraud' | 'versions' | 'audit';
type Notice = { text: string; tone: 'success' | 'error' | 'info' };

const securityTabs = [
  { id: 'events' as const, label: 'События', icon: Activity },
  { id: 'fraud' as const, label: 'Сигналы накрутки', icon: ShieldAlert },
  { id: 'versions' as const, label: 'Интеграции', icon: BellRing },
  { id: 'audit' as const, label: 'Журнал', icon: History },
];

export function AdminPanel({ section = 'overview' }: { section?: AdminSection }) {
  const [data, setData] = useState<AdminData>({});
  const [notice, setNotice] = useState<Notice>({ text: '', tone: 'info' });
  const [activeSecurityTab, setActiveSecurityTab] = useState<SecurityTab>('fraud');
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [rejectId, setRejectId] = useState('');
  const [payoutReview, setPayoutReview] = useState<PayoutReview | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      if (section === 'overview') {
        const [users, campaigns, payouts, fraud, integrationVersions, finance] = await Promise.all([
          api<AdminData['users']>('/v1/admin/users'),
          api<AdminData['campaigns']>('/v1/admin/campaigns'),
          api<AdminData['payouts']>('/v1/admin/payouts?page=1&pageSize=50'),
          api<AdminData['fraud']>('/v1/admin/fraud-flags'),
          api<AdminData['integrationVersions']>('/v1/admin/integration-versions'),
          api<AdminData['finance']>('/v1/admin/finance'),
        ]);
        setData({ users, campaigns, payouts, fraud, integrationVersions, finance });
      } else if (section === 'campaigns') {
        setData({ campaigns: await api<AdminData['campaigns']>('/v1/admin/campaigns') });
      } else if (section === 'users') {
        setData({ users: await api<AdminData['users']>('/v1/admin/users') });
      } else if (section === 'finance') {
        const [payments, payouts, finance] = await Promise.all([
          api<AdminData['payments']>('/v1/admin/payments'),
          api<AdminData['payouts']>('/v1/admin/payouts?page=1&pageSize=50'),
          api<AdminData['finance']>('/v1/admin/finance'),
        ]);
        setData({ payments, payouts, finance });
      } else {
        const [events, fraud, audit, integrationVersions] = await Promise.all([
          api<AdminData['events']>('/v1/admin/events'),
          api<AdminData['fraud']>('/v1/admin/fraud-flags'),
          api<AdminData['audit']>('/v1/admin/audit-log'),
          api<AdminData['integrationVersions']>('/v1/admin/integration-versions'),
        ]);
        setData({ events, fraud, audit, integrationVersions });
      }
    } catch (error) {
      setNotice({ text: (error as ApiError).message, tone: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, [section]);

  async function action(id: string, kind: 'approve' | 'pause' | 'reject') {
    if (kind === 'reject') {
      setRejectId(id);
      return;
    }
    setBusyId(id);
    try {
      await api(`/v1/admin/campaigns/${id}/${kind}`, { method: 'POST' });
      await load();
      setNotice({
        text:
          kind === 'approve' ? 'Кампания одобрена и доступна для показа.' : 'Кампания остановлена.',
        tone: 'success',
      });
    } catch (error) {
      setNotice({ text: (error as ApiError).message, tone: 'error' });
    } finally {
      setBusyId('');
    }
  }

  async function reject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const reason = String(form.get('reason') ?? '');
    setBusyId(rejectId);
    try {
      await api(`/v1/admin/campaigns/${rejectId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setRejectId('');
      await load();
      setNotice({ text: 'Кампания отклонена. Причина сохранена в журнале.', tone: 'success' });
    } catch (error) {
      setNotice({ text: (error as ApiError).message, tone: 'error' });
    } finally {
      setBusyId('');
    }
  }

  async function acknowledgeVersion(id: string) {
    setBusyId(id);
    try {
      await api(`/v1/admin/integration-versions/${id}/acknowledge`, { method: 'POST' });
      await load();
      setNotice({ text: 'Версия интеграции отмечена как принятая в работу.', tone: 'success' });
    } catch (error) {
      setNotice({ text: (error as ApiError).message, tone: 'error' });
    } finally {
      setBusyId('');
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  const users = data.users?.users ?? [];
  const campaigns = data.campaigns?.campaigns ?? [];
  const events = data.events?.events ?? [];
  const payments = data.payments?.payments ?? [];
  const developerPayouts = data.payouts?.payouts ?? [];
  const fraudFlags = data.fraud?.fraudFlags ?? [];
  const auditLog = data.audit?.auditLog ?? [];
  const integrationVersions = data.integrationVersions?.reports ?? [];
  const pendingVersions = integrationVersions.filter(
    (report) => !report.supported && !report.acknowledgedAt,
  );
  const pendingCampaigns = campaigns.filter((campaign) => campaign.status === 'pending');
  const pendingPayouts = developerPayouts.filter((payout) => payout.status === 'requested');
  const activeCampaigns = campaigns.filter(isCampaignDelivering);
  const developers = users.filter((user) => user.developerProfile).length;
  const advertisers = users.filter((user) => user.advertiserProfile).length;
  const campaignStatuses = [
    { label: 'Активные', value: activeCampaigns.length, color: 'bg-emerald-500' },
    { label: 'На модерации', value: pendingCampaigns.length, color: 'bg-amber-500' },
    {
      label: 'Приостановлены',
      value: campaigns.filter((campaign) => campaign.status === 'paused').length,
      color: 'bg-slate-400',
    },
    {
      label: 'Отклонены',
      value: campaigns.filter((campaign) => campaign.status === 'rejected').length,
      color: 'bg-red-400',
    },
  ];
  const financeRows = [
    {
      label: 'Пополнено рекламодателями',
      value: data.finance?.creditedKopecks ?? 0,
      color: 'bg-blue-500',
    },
    { label: 'Списано за показы', value: data.finance?.chargedKopecks ?? 0, color: 'bg-signal' },
    {
      label: 'Начислено разработчикам',
      value: data.finance?.rewardedKopecks ?? 0,
      color: 'bg-emerald-500',
    },
    { label: 'Маржа платформы', value: data.finance?.platformMarginKopecks ?? 0, color: 'bg-ink' },
  ];
  const maxFinanceValue = Math.max(1, ...financeRows.map((item) => item.value));

  return (
    <div className="grid min-w-0 gap-4">
      <Message message={notice.text} tone={notice.tone} />

      {section === 'overview' ? (
        <>
          <section className="relative isolate overflow-hidden rounded-xl bg-ink p-4 text-white shadow-[0_18px_55px_rgba(23,32,42,0.16)] sm:p-5">
            <div
              className="pointer-events-none absolute inset-0 -z-10 opacity-50"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 78% 8%, rgba(8,127,109,.38), transparent 27%), radial-gradient(circle at 58% 110%, rgba(37,99,235,.28), transparent 35%), linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)',
                backgroundSize: 'auto, auto, 40px 40px, 40px 40px',
              }}
              aria-hidden
            />
            <div className="grid gap-5 lg:grid-cols-[minmax(240px,0.7fr)_minmax(0,1.3fr)] lg:items-end">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-emerald-300">
                  <TrendingUp aria-hidden className="h-4 w-4" /> Маржа платформы
                </div>
                <div className="mt-3 text-3xl font-bold tracking-[-0.04em]">
                  {isLoading ? '—' : money(data.finance?.platformMarginKopecks)}
                </div>
                <p className="mt-2 max-w-sm text-sm leading-5 text-slate-300">
                  {isLoading
                    ? 'Собираем данные платформы...'
                    : `${counted(activeCampaigns.length, 'активная кампания', 'активные кампании', 'активных кампаний')} сейчас получает показы.`}
                </p>
                <Link
                  href="/admin/campaigns"
                  className="focus-ring mt-4 inline-flex h-9 items-center rounded-md bg-white px-4 text-sm font-semibold text-ink hover:bg-slate-100"
                >
                  Открыть очередь модерации
                </Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <AdminOverviewMetric
                  icon={UsersRound}
                  label="Пользователи"
                  value={isLoading ? '—' : integer(users.length)}
                  detail={`${developers} разработчиков · ${advertisers} рекламодателей`}
                />
                <AdminOverviewMetric
                  icon={CircleDollarSign}
                  label="Оборот показов"
                  value={isLoading ? '—' : money(data.finance?.chargedKopecks)}
                  detail="списано с кампаний"
                />
                <AdminOverviewMetric
                  icon={Clock3}
                  label="Требует решения"
                  value={isLoading ? '—' : integer(pendingCampaigns.length + pendingPayouts.length)}
                  detail={`${pendingCampaigns.length} кампаний · ${pendingPayouts.length} выплат`}
                />
              </div>
            </div>
          </section>

          {!isLoading && pendingVersions.length ? (
            <Link
              href="/admin/security"
              className="focus-ring flex w-full flex-col gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-left sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="flex min-w-0 items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-amber-100 text-amber-800">
                  <BellRing aria-hidden className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-amber-950">
                    Обнаружено обновление AI-инструмента
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-amber-900">
                    {pendingVersions
                      .map(
                        (report) =>
                          `${report.tool === 'claude' ? 'Claude Code' : 'Codex'} ${report.version}`,
                      )
                      .join(', ')}
                    . Проверьте совместимость патча и выпустите обновление Kodpauza.
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-amber-950">Открыть отчеты</span>
            </Link>
          ) : null}

          <WorkSurface
            title="Состояние платформы"
            description="Финансовый поток, распределение кампаний и сигналы, которые требуют внимания."
          >
            {isLoading ? (
              <LoadingBlock label="Загружаем сводку платформы" />
            ) : (
              <div className="grid gap-7 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
                <div>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-ink">Финансовый поток</h3>
                    <span className="text-xs text-slate-500">за всё время</span>
                  </div>
                  <div className="grid gap-4">
                    {financeRows.map((item) => (
                      <div key={item.label}>
                        <div className="mb-1.5 flex items-center justify-between gap-4 text-xs">
                          <span className="text-slate-600">{item.label}</span>
                          <strong className="text-ink">{money(item.value)}</strong>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${item.color}`}
                            style={{
                              width: `${Math.max(item.value ? 4 : 0, (item.value / maxFinanceValue) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid content-start gap-4">
                  <div className="rounded-lg border border-line bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-ink">Кампании</h3>
                      <strong className="text-xl text-ink">{integer(campaigns.length)}</strong>
                    </div>
                    <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-200">
                      {campaignStatuses.map((item) => (
                        <span
                          key={item.label}
                          className={item.color}
                          style={{
                            width: `${campaigns.length ? (item.value / campaigns.length) * 100 : 0}%`,
                          }}
                          title={`${item.label}: ${item.value}`}
                        />
                      ))}
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {campaignStatuses.map((item) => (
                        <div
                          key={item.label}
                          className="flex items-center gap-2 text-xs text-slate-600"
                        >
                          <span className={`h-2 w-2 rounded-full ${item.color}`} />
                          <span>{item.label}</span>
                          <strong className="ml-auto text-ink">{item.value}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Link
                    href="/admin/security"
                    className={`focus-ring flex items-center gap-3 rounded-lg border p-4 text-left ${fraudFlags.length ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}
                  >
                    <span
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-md ${fraudFlags.length ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}
                    >
                      {fraudFlags.length ? (
                        <AlertTriangle aria-hidden className="h-5 w-5" />
                      ) : (
                        <Gauge aria-hidden className="h-5 w-5" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <strong className="block text-sm text-ink">
                        {fraudFlags.length
                          ? `${integer(fraudFlags.length)} сигналов требуют проверки`
                          : 'Критичных сигналов нет'}
                      </strong>
                      <span className="mt-1 block text-xs text-slate-600">
                        Открыть журнал проверки событий
                      </span>
                    </span>
                  </Link>
                </div>
              </div>
            )}
          </WorkSurface>
        </>
      ) : null}

      {section !== 'overview' ? (
        <div className="flex min-w-0 flex-col items-stretch gap-3 border-b border-line sm:flex-row sm:items-center sm:justify-between">
          {section === 'security' ? (
            <div
              className="flex w-full min-w-0 max-w-full gap-1 overflow-x-auto sm:w-auto"
              role="tablist"
              aria-label="Разделы безопасности"
            >
              {securityTabs.map((item) => {
                const Icon = item.icon;
                const active = activeSecurityTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveSecurityTab(item.id)}
                    className={`focus-ring inline-flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition ${active ? 'border-mint text-mint' : 'border-transparent text-slate-500 hover:text-ink'}`}
                  >
                    <Icon aria-hidden className="h-4 w-4" /> {item.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="text-sm font-semibold text-slate-600">Рабочие данные раздела</span>
          )}
          <SecondaryButton onClick={() => void load()} disabled={isLoading}>
            <RefreshCw aria-hidden className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />{' '}
            Обновить
          </SecondaryButton>
        </div>
      ) : null}

      {isLoading && section !== 'overview' ? (
        <WorkSurface title="Загружаем данные">
          <LoadingBlock />
        </WorkSurface>
      ) : null}
      {!isLoading && section === 'campaigns' ? (
        <WorkSurface
          title="Модерация кампаний"
          description="Проверьте текст, ссылку, цену и бюджет перед запуском."
        >
          <AdminCampaignList campaigns={campaigns} onAction={action} busyId={busyId} />
        </WorkSurface>
      ) : null}
      {!isLoading && section === 'users' ? (
        <WorkSurface title="Пользователи" description="Роли, компании и тестовые балансы.">
          <div className="max-h-[680px] overflow-auto">
            <UserList users={users} />
          </div>
        </WorkSurface>
      ) : null}
      {!isLoading && section === 'finance' ? (
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {financeRows.map((item) => (
              <div
                key={item.label}
                className="rounded-md border border-line bg-white p-4 shadow-sm"
              >
                <span className={`mb-3 block h-1.5 w-10 rounded-full ${item.color}`} />
                <p className="text-xs font-medium text-slate-500">{item.label}</p>
                <p className="mt-2 text-xl font-bold text-ink">{money(item.value)}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <WorkSurface
              title="Пополнения через ЮKassa"
              description="Последние 100 операций и ошибки проверки."
            >
              <div className="max-h-[620px] overflow-auto">
                <AdminPaymentList payments={payments} />
              </div>
            </WorkSurface>
            <WorkSurface
              title="Выплаты разработчикам"
              description="Заявки, резервы и подтвержденные переводы."
            >
              <AdminDeveloperPayoutList payouts={developerPayouts} onReview={setPayoutReview} />
            </WorkSurface>
          </div>
        </div>
      ) : null}
      {!isLoading && section === 'security' && activeSecurityTab === 'events' ? (
        <WorkSurface title="События" description="Последние показы, клики и результат проверки.">
          <div className="max-h-[680px] overflow-auto">
            <AdminEventList events={events} />
          </div>
        </WorkSurface>
      ) : null}
      {!isLoading && section === 'security' && activeSecurityTab === 'fraud' ? (
        <WorkSurface
          title="Сигналы накрутки"
          description="События, которые не были оплачены или требуют проверки."
        >
          <div className="max-h-[680px] overflow-auto">
            <FraudList flags={fraudFlags} />
          </div>
        </WorkSurface>
      ) : null}
      {!isLoading && section === 'security' && activeSecurityTab === 'versions' ? (
        <WorkSurface
          title="Версии интеграций"
          description="Kodpauza автоматически отслеживает сборки Codex и Claude Code. Неподдерживаемые версии требуют проверки патча."
        >
          <IntegrationVersionReportList
            reports={integrationVersions}
            busyId={busyId}
            onAcknowledge={(id) => void acknowledgeVersion(id)}
          />
        </WorkSurface>
      ) : null}
      {!isLoading && section === 'security' && activeSecurityTab === 'audit' ? (
        <WorkSurface title="Журнал администрирования" description="История решений по кампаниям.">
          <div className="max-h-[680px] overflow-auto">
            <AuditLogList auditLog={auditLog} />
          </div>
        </WorkSurface>
      ) : null}

      {rejectId ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-title"
        >
          <form
            onSubmit={reject}
            className="w-full max-w-lg rounded-md border border-line bg-white p-5 shadow-panel"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="reject-title" className="text-lg font-semibold text-ink">
                  Отклонить кампанию
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Причина попадет в журнал и поможет рекламодателю исправить объявление.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRejectId('')}
                className="focus-ring grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
                aria-label="Закрыть"
              >
                <X aria-hidden className="h-5 w-5" />
              </button>
            </div>
            <label className="mt-5 grid gap-2 text-sm font-medium text-ink">
              Причина
              <textarea
                autoFocus
                required
                minLength={3}
                maxLength={500}
                name="reason"
                className="focus-ring min-h-28 rounded-md border border-line p-3 text-base"
                placeholder="Например: ссылка не соответствует тексту объявления"
              />
            </label>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <SecondaryButton onClick={() => setRejectId('')} disabled={Boolean(busyId)}>
                Отмена
              </SecondaryButton>
              <PrimaryButton disabled={Boolean(busyId)}>Отклонить кампанию</PrimaryButton>
            </div>
          </form>
        </div>
      ) : null}

      {payoutReview ? (
        <AdminPayoutReviewDialog
          review={payoutReview}
          onClose={() => setPayoutReview(null)}
          onComplete={async (text) => {
            setPayoutReview(null);
            await load();
            setNotice({ text, tone: 'success' });
          }}
        />
      ) : null}
    </div>
  );
}

function AdminOverviewMetric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
          {label}
        </p>
        <Icon aria-hidden className="h-4 w-4 text-emerald-300" />
      </div>
      <p className="mt-5 truncate text-2xl font-bold tracking-[-0.03em] text-white">{value}</p>
      <p className="mt-1 line-clamp-2 text-xs text-slate-400">{detail}</p>
    </div>
  );
}
