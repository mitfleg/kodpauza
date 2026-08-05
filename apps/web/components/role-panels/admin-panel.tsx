'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
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
  ShieldCheck,
  TrendingUp,
  type LucideIcon,
  UsersRound,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { counted, integer, money } from './format';
import {
  AdminCampaignList,
  AdminEventList,
  AuditLogList,
  FraudList,
  IntegrationVersionReportList,
  UserList,
} from './lists';
import { AdminPaymentList } from './admin-payments';
import { AdminPrivacyRequests } from './admin-privacy-requests';
import {
  AdminDeveloperPayoutList,
  AdminPayoutReviewDialog,
  type PayoutReview,
} from './admin-developer-payouts';
import type { AdminData, ApiError } from './types';
import {
  LoadingBlock,
  Message,
  PaginationControls,
  PrimaryButton,
  SecondaryButton,
  WorkSurface,
} from './ui';

export type AdminSection = 'overview' | 'campaigns' | 'users' | 'finance' | 'security';
type SecurityTab = 'events' | 'fraud' | 'versions' | 'privacy' | 'audit';
type AdminPageKey = 'campaigns' | 'users' | 'payments' | 'payouts' | SecurityTab;
type Notice = { text: string; tone: 'success' | 'error' | 'info' };
const PAGE_SIZE = 10;

const securityTabs = [
  { id: 'events' as const, label: 'События', icon: Activity },
  { id: 'fraud' as const, label: 'Сигналы накрутки', icon: ShieldAlert },
  { id: 'versions' as const, label: 'Интеграции', icon: BellRing },
  { id: 'privacy' as const, label: 'Персональные данные', icon: ShieldCheck },
  { id: 'audit' as const, label: 'Журнал', icon: History },
];

export function AdminPanel({ section = 'overview' }: { section?: AdminSection }) {
  const [data, setData] = useState<AdminData>({});
  const [notice, setNotice] = useState<Notice>({ text: '', tone: 'info' });
  const [activeSecurityTab, setActiveSecurityTab] = useState<SecurityTab>('events');
  const securityTabListRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<Record<AdminPageKey, number>>({
    campaigns: 1,
    users: 1,
    payments: 1,
    payouts: 1,
    events: 1,
    fraud: 1,
    versions: 1,
    privacy: 1,
    audit: 1,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [rejectId, setRejectId] = useState('');
  const [payoutReview, setPayoutReview] = useState<PayoutReview | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      if (section === 'overview') {
        const [users, campaigns, payouts, fraud, integrationVersions, finance, funnel, fleet] =
          await Promise.all([
            api<AdminData['users']>('/v1/admin/users?page=1&pageSize=5'),
            api<AdminData['campaigns']>('/v1/admin/campaigns?page=1&pageSize=5'),
            api<AdminData['payouts']>('/v1/admin/payouts?page=1&pageSize=50'),
            api<AdminData['fraud']>('/v1/admin/fraud-flags?page=1&pageSize=5'),
            api<AdminData['integrationVersions']>(
              '/v1/admin/integration-versions?page=1&pageSize=50',
            ),
            api<AdminData['finance']>('/v1/admin/finance'),
            api<AdminData['funnel']>('/v1/admin/funnel'),
            api<AdminData['fleet']>('/v1/admin/extension-fleet'),
          ]);
        setData({ users, campaigns, payouts, fraud, integrationVersions, finance, funnel, fleet });
      } else if (section === 'campaigns') {
        setData({
          campaigns: await api<AdminData['campaigns']>(
            `/v1/admin/campaigns?page=${pages.campaigns}&pageSize=${PAGE_SIZE}`,
          ),
        });
      } else if (section === 'users') {
        setData({
          users: await api<AdminData['users']>(
            `/v1/admin/users?page=${pages.users}&pageSize=${PAGE_SIZE}`,
          ),
        });
      } else if (section === 'finance') {
        const [payments, payouts, finance] = await Promise.all([
          api<AdminData['payments']>(
            `/v1/admin/payments?page=${pages.payments}&pageSize=${PAGE_SIZE}`,
          ),
          api<AdminData['payouts']>(
            `/v1/admin/payouts?page=${pages.payouts}&pageSize=${PAGE_SIZE}`,
          ),
          api<AdminData['finance']>('/v1/admin/finance'),
        ]);
        setData({ payments, payouts, finance });
      } else if (activeSecurityTab === 'events') {
        setData({
          events: await api<AdminData['events']>(
            `/v1/admin/events?page=${pages.events}&pageSize=${PAGE_SIZE}`,
          ),
        });
      } else if (activeSecurityTab === 'fraud') {
        setData({
          fraud: await api<AdminData['fraud']>(
            `/v1/admin/fraud-flags?page=${pages.fraud}&pageSize=${PAGE_SIZE}`,
          ),
        });
      } else if (activeSecurityTab === 'versions') {
        setData({
          integrationVersions: await api<AdminData['integrationVersions']>(
            `/v1/admin/integration-versions?page=${pages.versions}&pageSize=${PAGE_SIZE}`,
          ),
        });
      } else if (activeSecurityTab === 'privacy') {
        setData({
          privacyRequests: await api<AdminData['privacyRequests']>(
            `/v1/admin/privacy-requests?page=${pages.privacy}&pageSize=${PAGE_SIZE}`,
          ),
        });
      } else {
        setData({
          audit: await api<AdminData['audit']>(
            `/v1/admin/audit-log?page=${pages.audit}&pageSize=${PAGE_SIZE}`,
          ),
        });
      }
    } catch (error) {
      setNotice({ text: (error as ApiError).message, tone: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, [activeSecurityTab, pages, section]);

  async function action(id: string, kind: 'approve' | 'pause' | 'reject') {
    if (kind === 'reject') {
      setRejectId(id);
      return;
    }
    setBusyId(id);
    try {
      const reviewedUpdatedAt = campaigns.find((campaign) => campaign.id === id)?.updatedAt;
      if (kind === 'approve' && !reviewedUpdatedAt) {
        throw new Error('Обновите список кампаний перед модерацией.');
      }
      await api(`/v1/admin/campaigns/${id}/${kind}`, {
        method: 'POST',
        ...(kind === 'approve' ? { body: JSON.stringify({ reviewedUpdatedAt }) } : {}),
      });
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
    const reviewedUpdatedAt = campaigns.find((campaign) => campaign.id === rejectId)?.updatedAt;
    setBusyId(rejectId);
    try {
      if (!reviewedUpdatedAt) {
        throw new Error('Обновите список кампаний перед модерацией.');
      }
      await api(`/v1/admin/campaigns/${rejectId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason, reviewedUpdatedAt }),
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

  async function resolvePrivacyRequest(
    id: string,
    status: 'processing' | 'completed' | 'rejected',
    resolution: string,
  ) {
    setBusyId(id);
    try {
      await api(`/v1/admin/privacy-requests/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status, resolution }),
      });
      await load();
      setNotice({ text: 'Статус обращения обновлен и записан в журнал.', tone: 'success' });
    } catch (error) {
      setNotice({ text: (error as ApiError).message, tone: 'error' });
    } finally {
      setBusyId('');
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (section !== 'security') return;
    const requestedTab = new URLSearchParams(window.location.search).get('tab');
    if (securityTabs.some((tab) => tab.id === requestedTab)) {
      setActiveSecurityTab(requestedTab as SecurityTab);
    }
  }, [section]);

  useEffect(() => {
    if (section !== 'security') return;
    securityTabListRef.current
      ?.querySelector<HTMLElement>(`[data-security-tab="${activeSecurityTab}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [activeSecurityTab, section]);

  function selectSecurityTab(tab: SecurityTab) {
    setActiveSecurityTab(tab);
    window.history.replaceState(null, '', `/admin/security?tab=${tab}`);
  }

  function changePage(key: AdminPageKey, page: number) {
    setPages((current) => ({ ...current, [key]: Math.max(1, page) }));
  }

  const users = data.users?.users ?? [];
  const campaigns = data.campaigns?.campaigns ?? [];
  const events = data.events?.events ?? [];
  const payments = data.payments?.payments ?? [];
  const developerPayouts = data.payouts?.payouts ?? [];
  const fraudFlags = data.fraud?.fraudFlags ?? [];
  const auditLog = data.audit?.auditLog ?? [];
  const integrationVersions = data.integrationVersions?.reports ?? [];
  const privacyRequests = data.privacyRequests?.requests ?? [];
  const pendingVersions = integrationVersions.filter(
    (report) => !report.supported && !report.acknowledgedAt,
  );
  const pendingVersionCount = data.integrationVersions?.summary.pending ?? pendingVersions.length;
  const campaignSummary = data.campaigns?.summary;
  const pendingCampaigns = campaignSummary?.statuses.pending ?? 0;
  const pendingPayouts = data.payouts?.summary.requested ?? 0;
  const activeCampaigns = campaignSummary?.delivering ?? 0;
  const developers = data.users?.summary.developers ?? 0;
  const advertisers = data.users?.summary.advertisers ?? 0;
  const totalCampaigns = campaignSummary?.total ?? campaigns.length;
  const totalUsers = data.users?.summary.total ?? users.length;
  const fraudCount = data.fraud?.summary.total ?? fraudFlags.length;
  const campaignStatuses = [
    { label: 'Активные', value: activeCampaigns, color: 'bg-emerald-500' },
    { label: 'На модерации', value: pendingCampaigns, color: 'bg-amber-500' },
    {
      label: 'Приостановлены',
      value: campaignSummary?.statuses.paused ?? 0,
      color: 'bg-slate-400',
    },
    {
      label: 'Отклонены',
      value: campaignSummary?.statuses.rejected ?? 0,
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
                    : `${counted(activeCampaigns, 'активная кампания', 'активные кампании', 'активных кампаний')} сейчас получает показы.`}
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
                  value={isLoading ? '—' : integer(totalUsers)}
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
                  value={isLoading ? '—' : integer(pendingCampaigns + pendingPayouts)}
                  detail={`${pendingCampaigns} кампаний · ${pendingPayouts} выплат`}
                />
              </div>
            </div>
          </section>

          {!isLoading && pendingVersionCount ? (
            <Link
              href="/admin/security?tab=versions"
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
                    {pendingVersionCount > pendingVersions.length
                      ? ` и ещё ${pendingVersionCount - pendingVersions.length}`
                      : ''}
                    . Проверьте совместимость патча и выпустите обновление Kodpauza.
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-amber-950">Открыть отчеты</span>
            </Link>
          ) : null}

          <WorkSurface
            title="Воронка разработчика"
            description="Путь разработчика от регистрации до первого начисления. Установка считается после первого авторизованного heartbeat расширения."
          >
            {isLoading ? (
              <LoadingBlock label="Загружаем воронку" />
            ) : (
              <AdminFunnel stages={data.funnel?.stages ?? []} />
            )}
          </WorkSurface>

          <WorkSurface
            title="Установки расширения"
            description="Состояние последних heartbeat без email, install ID и других персональных идентификаторов."
          >
            {isLoading ? (
              <LoadingBlock label="Загружаем установки" />
            ) : (
              <FleetSummary fleet={data.fleet} />
            )}
          </WorkSurface>

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
                      <strong className="text-xl text-ink">{integer(totalCampaigns)}</strong>
                    </div>
                    <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-200">
                      {campaignStatuses.map((item) => (
                        <span
                          key={item.label}
                          className={item.color}
                          style={{
                            width: `${totalCampaigns ? (item.value / totalCampaigns) * 100 : 0}%`,
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
                    href={fraudCount ? '/admin/security?tab=fraud' : '/admin/security?tab=events'}
                    className={`focus-ring flex items-center gap-3 rounded-lg border p-4 text-left ${fraudCount ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}
                  >
                    <span
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-md ${fraudCount ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}
                    >
                      {fraudCount ? (
                        <AlertTriangle aria-hidden className="h-5 w-5" />
                      ) : (
                        <Gauge aria-hidden className="h-5 w-5" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <strong className="block text-sm text-ink">
                        {fraudCount
                          ? `${integer(fraudCount)} сигналов требуют проверки`
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
        <div className="flex min-w-0 items-center gap-2 overflow-hidden rounded-lg border border-line bg-white p-2 shadow-sm">
          {section === 'security' ? (
            <div
              ref={securityTabListRef}
              className="flex min-w-0 flex-1 snap-x snap-proximity items-center gap-1.5 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                    aria-controls={`security-panel-${item.id}`}
                    id={`security-tab-${item.id}`}
                    data-security-tab={item.id}
                    onClick={() => selectSecurityTab(item.id)}
                    className={`focus-ring inline-flex h-10 shrink-0 snap-start items-center justify-center gap-2 whitespace-nowrap rounded-md border px-3 text-sm font-semibold transition ${active ? 'border-ink bg-ink text-white shadow-sm' : 'border-transparent bg-slate-50 text-slate-600 hover:border-line hover:bg-white hover:text-ink'}`}
                  >
                    <Icon aria-hidden className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="min-w-0 flex-1 text-sm font-semibold text-slate-600">
              Рабочие данные раздела
            </span>
          )}
          <div className="shrink-0 sm:pr-1">
            <SecondaryButton onClick={() => void load()} disabled={isLoading}>
              <RefreshCw aria-hidden className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="sr-only sm:not-sr-only">Обновить</span>
            </SecondaryButton>
          </div>
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
          <PaginationControls
            pagination={data.campaigns?.pagination}
            onPageChange={(page) => changePage('campaigns', page)}
          />
        </WorkSurface>
      ) : null}
      {!isLoading && section === 'users' ? (
        <WorkSurface
          title="Пользователи"
          description="Роли, компании и текущие внутренние балансы."
        >
          <UserList users={users} />
          <PaginationControls
            pagination={data.users?.pagination}
            onPageChange={(page) => changePage('users', page)}
          />
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
              description="Операции пополнения и ошибки проверки платежей."
            >
              <AdminPaymentList payments={payments} />
              <PaginationControls
                pagination={data.payments?.pagination}
                onPageChange={(page) => changePage('payments', page)}
              />
            </WorkSurface>
            <WorkSurface
              title="Выплаты разработчикам"
              description="Заявки, резервы и подтвержденные переводы."
            >
              <AdminDeveloperPayoutList payouts={developerPayouts} onReview={setPayoutReview} />
              <PaginationControls
                pagination={data.payouts?.pagination}
                onPageChange={(page) => changePage('payouts', page)}
              />
            </WorkSurface>
          </div>
        </div>
      ) : null}
      {!isLoading && section === 'security' && activeSecurityTab === 'events' ? (
        <div id="security-panel-events" role="tabpanel" aria-labelledby="security-tab-events">
          <WorkSurface
            title="События"
            description="Показы, клики и результат автоматической проверки."
          >
            <AdminEventList events={events} />
            <PaginationControls
              pagination={data.events?.pagination}
              onPageChange={(page) => changePage('events', page)}
            />
          </WorkSurface>
        </div>
      ) : null}
      {!isLoading && section === 'security' && activeSecurityTab === 'fraud' ? (
        <div id="security-panel-fraud" role="tabpanel" aria-labelledby="security-tab-fraud">
          <WorkSurface
            title="Сигналы накрутки"
            description="События, которые не были оплачены или требуют проверки."
          >
            <FraudList flags={fraudFlags} />
            <PaginationControls
              pagination={data.fraud?.pagination}
              onPageChange={(page) => changePage('fraud', page)}
            />
          </WorkSurface>
        </div>
      ) : null}
      {!isLoading && section === 'security' && activeSecurityTab === 'versions' ? (
        <div id="security-panel-versions" role="tabpanel" aria-labelledby="security-tab-versions">
          <WorkSurface
            title="Версии интеграций"
            description="Сначала показаны версии, требующие решения, затем совместимые по свежести сигнала и обработанный архив."
          >
            <IntegrationVersionReportList
              reports={integrationVersions}
              busyId={busyId}
              onAcknowledge={(id) => void acknowledgeVersion(id)}
            />
            <PaginationControls
              pagination={data.integrationVersions?.pagination}
              onPageChange={(page) => changePage('versions', page)}
            />
          </WorkSurface>
        </div>
      ) : null}
      {!isLoading && section === 'security' && activeSecurityTab === 'audit' ? (
        <div id="security-panel-audit" role="tabpanel" aria-labelledby="security-tab-audit">
          <WorkSurface
            title="Журнал администрирования"
            description="История решений и действий администраторов."
          >
            <AuditLogList auditLog={auditLog} />
            <PaginationControls
              pagination={data.audit?.pagination}
              onPageChange={(page) => changePage('audit', page)}
            />
          </WorkSurface>
        </div>
      ) : null}
      {!isLoading && section === 'security' && activeSecurityTab === 'privacy' ? (
        <div id="security-panel-privacy" role="tabpanel" aria-labelledby="security-tab-privacy">
          <WorkSurface
            title="Обращения по персональным данным"
            description="Запросы на доступ, исправление, удаление и отзыв согласия."
          >
            <AdminPrivacyRequests
              requests={privacyRequests}
              busyId={busyId}
              onResolve={(id, status, resolution) =>
                void resolvePrivacyRequest(id, status, resolution)
              }
            />
            <PaginationControls
              pagination={data.privacyRequests?.pagination}
              onPageChange={(page) => changePage('privacy', page)}
            />
          </WorkSurface>
        </div>
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

function FleetSummary({ fleet }: { fleet: AdminData['fleet'] }) {
  if (!fleet?.counts.total) {
    return <p className="text-sm text-slate-500">Heartbeat от расширений пока не поступал.</p>;
  }
  const cards = [
    { label: 'Активные', value: fleet.counts.active, tone: 'text-emerald-700 bg-emerald-50' },
    { label: 'Требуют внимания', value: fleet.counts.degraded, tone: 'text-amber-800 bg-amber-50' },
    {
      label: 'Неактивны более суток',
      value: fleet.counts.stale,
      tone: 'text-slate-600 bg-slate-100',
    },
  ];
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className={`rounded-md p-4 ${card.tone}`}>
            <strong className="block text-2xl">{integer(card.value)}</strong>
            <span className="mt-1 block text-xs font-medium">{card.label}</span>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <FleetBreakdown title="Версии Kodpauza" rows={fleet.versions} />
        <FleetBreakdown title="Редакторы" rows={fleet.editors} />
        <FleetBreakdown
          title="AI-инструменты"
          rows={[
            { name: 'Codex', count: fleet.tools.codex },
            { name: 'Claude Code', count: fleet.tools.claude },
          ]}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <FleetCounter label="Нет heartbeat более часа" value={fleet.missingHeartbeat.overOneHour} />
        <FleetCounter label="Нет heartbeat более суток" value={fleet.missingHeartbeat.overOneDay} />
        <FleetCounter
          label="Нет heartbeat более недели"
          value={fleet.missingHeartbeat.overSevenDays}
        />
      </div>
      {Object.keys(fleet.patchStatuses).length ? (
        <FleetBreakdown
          title="Состояние UI-патчей"
          rows={Object.entries(fleet.patchStatuses).map(([name, count]) => ({
            name: patchStatusLabel(name),
            count,
          }))}
        />
      ) : null}
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="min-w-[860px] w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Состояние</th>
              <th className="px-3 py-2 font-medium">Kodpauza</th>
              <th className="px-3 py-2 font-medium">Редактор</th>
              <th className="px-3 py-2 font-medium">Инструменты</th>
              <th className="px-3 py-2 font-medium">UI-патч</th>
              <th className="px-3 py-2 font-medium">Последний heartbeat</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-white">
            {fleet.installs.slice(0, 8).map((install, index) => (
              <tr key={`${install.lastSeenAt}-${index}`}>
                <td className="px-3 py-2">
                  <span
                    className={`font-semibold ${install.health === 'active' ? 'text-emerald-700' : install.health === 'degraded' ? 'text-amber-700' : 'text-slate-500'}`}
                  >
                    {install.health === 'active'
                      ? 'Активна'
                      : install.health === 'degraded'
                        ? 'Нужна проверка'
                        : 'Неактивна'}
                  </span>
                </td>
                <td className="px-3 py-2 text-ink">{install.extensionVersion || 'не передана'}</td>
                <td className="px-3 py-2 text-slate-600">
                  {install.editor
                    ? `${install.editor}${install.editorVersion ? ` ${install.editorVersion}` : ''}`
                    : install.editorVersion || 'не передан'}
                </td>
                <td className="px-3 py-2 text-slate-600">{toolVersions(install)}</td>
                <td className="px-3 py-2 text-slate-600">{installPatchSummary(install)}</td>
                <td
                  className="px-3 py-2 text-slate-600"
                  title={new Date(install.lastSeenAt).toLocaleString('ru-RU')}
                >
                  {heartbeatAge(install.lastSeenAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!fleet.limitations.patchStatusAvailable ? (
        <p className="text-xs leading-5 text-slate-500">{fleet.limitations.note}</p>
      ) : null}
    </div>
  );
}

function heartbeatAge(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} мин. назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч. назад`;
  return `${Math.round(hours / 24)} дн. назад`;
}

function FleetBreakdown({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ name: string; count: number }>;
}) {
  return (
    <div className="rounded-md border border-line bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <div className="mt-3 grid gap-2">
        {rows.slice(0, 5).map((row) => (
          <div key={row.name} className="flex items-center justify-between gap-3 text-xs">
            <span className="truncate text-slate-600">{row.name}</span>
            <strong className="text-ink">{integer(row.count)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function FleetCounter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-white px-4 py-3 text-xs">
      <span className="text-slate-600">{label}</span>
      <strong className={value ? 'text-amber-700' : 'text-emerald-700'}>{integer(value)}</strong>
    </div>
  );
}

function toolVersions(install: NonNullable<AdminData['fleet']>['installs'][number]) {
  const values = [
    install.codex ? `Codex${install.codex.version ? ` ${install.codex.version}` : ''}` : null,
    install.claude ? `Claude${install.claude.version ? ` ${install.claude.version}` : ''}` : null,
  ].filter(Boolean);
  return values.length ? values.join(' · ') : 'не найдены';
}

function installPatchSummary(install: NonNullable<AdminData['fleet']>['installs'][number]) {
  const values = [install.codex?.patchStatus, install.claude?.patchStatus]
    .filter((value): value is string => Boolean(value))
    .map(patchStatusLabel);
  const errors = [install.codex?.errorCategory, install.claude?.errorCategory]
    .filter((value): value is string => Boolean(value))
    .map(patchErrorLabel);
  if (!values.length) return 'нет данных';
  return `${values.join(' · ')}${errors.length ? ` (${errors.join(', ')})` : ''}`;
}

function patchStatusLabel(status: string) {
  const labels: Record<string, string> = {
    installed_exact: 'Установлен точно',
    installed_structural: 'Установлен структурно',
    not_installed: 'Не установлен',
    unsupported: 'Версия не поддержана',
    error: 'Ошибка',
    unknown: 'Неизвестно',
  };
  return labels[status] ?? status;
}

function patchErrorLabel(category: string) {
  const labels: Record<string, string> = {
    compatibility: 'совместимость',
    filesystem: 'файловая система',
    permission: 'права доступа',
    verification: 'проверка патча',
    runtime: 'выполнение',
    unknown: 'неизвестная категория',
  };
  return labels[category] ?? category;
}

function AdminFunnel({ stages }: { stages: Array<{ id: string; label: string; value: number }> }) {
  const start = Math.max(stages[0]?.value ?? 0, 1);
  return (
    <div className="grid gap-3">
      {stages.map((stage, index) => {
        const previous = index === 0 ? stage.value : (stages[index - 1]?.value ?? 0);
        const stepConversion = previous > 0 ? Math.round((stage.value / previous) * 100) : 0;
        const totalConversion = Math.round((stage.value / start) * 100);
        return (
          <div
            key={stage.id}
            className="grid gap-2 sm:grid-cols-[190px_minmax(0,1fr)_110px] sm:items-center"
          >
            <div className="text-sm font-medium text-ink">{stage.label}</div>
            <div className="h-9 overflow-hidden rounded-md bg-slate-100">
              <div
                className="flex h-full min-w-9 items-center justify-end rounded-md bg-gradient-to-r from-blue-500 to-emerald-500 px-3 text-xs font-bold text-white transition-[width]"
                style={{ width: `${Math.max(stage.value ? 8 : 0, totalConversion)}%` }}
              >
                {integer(stage.value)}
              </div>
            </div>
            <div className="text-xs text-slate-500 sm:text-right">
              {index === 0 ? 'точка входа' : `${stepConversion}% от шага`}
            </div>
          </div>
        );
      })}
    </div>
  );
}
