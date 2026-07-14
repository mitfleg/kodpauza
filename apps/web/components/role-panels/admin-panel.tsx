'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BellRing,
  CircleDollarSign,
  Clock3,
  CreditCard,
  History,
  HandCoins,
  Megaphone,
  RefreshCw,
  ShieldAlert,
  UsersRound,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { counted, integer, isCampaignDelivering } from './format';
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
import {
  LoadingBlock,
  Message,
  MetricCard,
  PrimaryButton,
  SecondaryButton,
  WorkSurface,
} from './ui';

type Tab =
  'campaigns' | 'users' | 'payments' | 'payouts' | 'events' | 'fraud' | 'versions' | 'audit';
type Notice = { text: string; tone: 'success' | 'error' | 'info' };

const tabs = [
  { id: 'campaigns' as const, label: 'Модерация', icon: Megaphone },
  { id: 'users' as const, label: 'Пользователи', icon: UsersRound },
  { id: 'payments' as const, label: 'Пополнения', icon: CreditCard },
  { id: 'payouts' as const, label: 'Выплаты', icon: HandCoins },
  { id: 'events' as const, label: 'События', icon: Activity },
  { id: 'fraud' as const, label: 'Сигналы накрутки', icon: ShieldAlert },
  { id: 'versions' as const, label: 'Интеграции', icon: BellRing },
  { id: 'audit' as const, label: 'Журнал', icon: History },
];

export function AdminPanel() {
  const [data, setData] = useState<AdminData>({});
  const [notice, setNotice] = useState<Notice>({ text: '', tone: 'info' });
  const [activeTab, setActiveTab] = useState<Tab>('campaigns');
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [rejectId, setRejectId] = useState('');
  const [payoutReview, setPayoutReview] = useState<PayoutReview | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [
        users,
        campaigns,
        payments,
        payouts,
        events,
        fraud,
        audit,
        integrationVersions,
        finance,
      ] = await Promise.all([
        api<AdminData['users']>('/v1/admin/users'),
        api<AdminData['campaigns']>('/v1/admin/campaigns'),
        api<AdminData['payments']>('/v1/admin/payments'),
        api<AdminData['payouts']>('/v1/admin/payouts?page=1&pageSize=50'),
        api<AdminData['events']>('/v1/admin/events'),
        api<AdminData['fraud']>('/v1/admin/fraud-flags'),
        api<AdminData['audit']>('/v1/admin/audit-log'),
        api<AdminData['integrationVersions']>('/v1/admin/integration-versions'),
        api<AdminData['finance']>('/v1/admin/finance'),
      ]);
      setData({
        users,
        campaigns,
        payments,
        payouts,
        events,
        fraud,
        audit,
        integrationVersions,
        finance,
      });
    } catch (error) {
      setNotice({ text: (error as ApiError).message, tone: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, []);

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

  return (
    <div className="grid min-w-0 gap-5">
      <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={UsersRound}
          label="Пользователи"
          value={isLoading ? '...' : integer(users.length)}
          detail="Все роли платформы"
          tone="blue"
        />
        <MetricCard
          icon={Clock3}
          label="Очередь решений"
          value={isLoading ? '...' : integer(pendingCampaigns.length + pendingPayouts.length)}
          detail={`${integer(pendingCampaigns.length)} кампаний · ${integer(pendingPayouts.length)} выплат`}
          tone="amber"
        />
        <MetricCard
          icon={CircleDollarSign}
          label="Маржа пилота"
          value={
            isLoading
              ? '...'
              : new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(
                  (data.finance?.platformMarginKopecks ?? 0) / 100,
                )
          }
          detail={counted(
            campaigns.filter(isCampaignDelivering).length,
            'активная кампания',
            'активные кампании',
            'активных кампаний',
          )}
          tone="green"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Сигналы накрутки"
          value={isLoading ? '...' : integer(fraudFlags.length)}
          detail="Последние 100 записей"
          tone={fraudFlags.length ? 'red' : 'slate'}
        />
      </div>

      <Message message={notice.text} tone={notice.tone} />

      {!isLoading && pendingVersions.length ? (
        <button
          type="button"
          onClick={() => setActiveTab('versions')}
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
        </button>
      ) : null}

      <div className="flex min-w-0 flex-col items-stretch gap-3 border-b border-line sm:flex-row sm:items-center sm:justify-between">
        <div
          className="flex w-full min-w-0 max-w-full gap-1 overflow-x-auto sm:w-auto"
          role="tablist"
          aria-label="Разделы администрирования"
        >
          {tabs.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(item.id)}
                className={`focus-ring inline-flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition ${active ? 'border-mint text-mint' : 'border-transparent text-slate-500 hover:text-ink'}`}
              >
                <Icon aria-hidden className="h-4 w-4" /> {item.label}
              </button>
            );
          })}
        </div>
        <SecondaryButton onClick={() => void load()} disabled={isLoading}>
          <RefreshCw aria-hidden className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />{' '}
          Обновить
        </SecondaryButton>
      </div>

      {isLoading ? (
        <WorkSurface title="Загружаем данные">
          <LoadingBlock />
        </WorkSurface>
      ) : null}
      {!isLoading && activeTab === 'campaigns' ? (
        <WorkSurface
          title="Модерация кампаний"
          description="Проверьте текст, ссылку, цену и бюджет перед запуском."
        >
          <AdminCampaignList campaigns={campaigns} onAction={action} busyId={busyId} />
        </WorkSurface>
      ) : null}
      {!isLoading && activeTab === 'users' ? (
        <WorkSurface title="Пользователи" description="Роли, компании и тестовые балансы.">
          <div className="max-h-[680px] overflow-auto">
            <UserList users={users} />
          </div>
        </WorkSurface>
      ) : null}
      {!isLoading && activeTab === 'payments' ? (
        <WorkSurface
          title="Пополнения через ЮKassa"
          description="Последние 100 операций. Ошибки проверки требуют ручного разбора."
        >
          <div className="max-h-[680px] overflow-auto">
            <AdminPaymentList payments={payments} />
          </div>
        </WorkSurface>
      ) : null}
      {!isLoading && activeTab === 'payouts' ? (
        <WorkSurface
          title="Выплаты разработчикам"
          description="Подтверждайте только фактически выполненные переводы. При отклонении резерв автоматически вернется на баланс."
        >
          <AdminDeveloperPayoutList payouts={developerPayouts} onReview={setPayoutReview} />
        </WorkSurface>
      ) : null}
      {!isLoading && activeTab === 'events' ? (
        <WorkSurface title="События" description="Последние показы, клики и результат проверки.">
          <div className="max-h-[680px] overflow-auto">
            <AdminEventList events={events} />
          </div>
        </WorkSurface>
      ) : null}
      {!isLoading && activeTab === 'fraud' ? (
        <WorkSurface
          title="Сигналы накрутки"
          description="События, которые не были оплачены или требуют проверки."
        >
          <div className="max-h-[680px] overflow-auto">
            <FraudList flags={fraudFlags} />
          </div>
        </WorkSurface>
      ) : null}
      {!isLoading && activeTab === 'versions' ? (
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
      {!isLoading && activeTab === 'audit' ? (
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
