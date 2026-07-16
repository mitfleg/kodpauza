'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  BadgeRussianRuble,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  HandCoins,
  History,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  ExternalLink,
} from 'lucide-react';
import { api } from '@/lib/api';
import { SUPPORT_TELEGRAM_URL, SUPPORT_TELEGRAM_USERNAME } from '@/lib/support';
import { dateTime, developerPayoutLabels, kopecksFromRubles, money } from './format';
import type {
  ApiError,
  DeveloperPayout,
  DeveloperPayoutStatus,
  DeveloperPayoutsResponse,
} from './types';
import {
  EmptyState,
  Field,
  LoadingBlock,
  Message,
  MetricCard,
  PrimaryButton,
  SecondaryButton,
  WorkSurface,
  inputClass,
} from './ui';

const PAGE_SIZE = 8;

export function DeveloperPayoutPanel() {
  const [data, setData] = useState<DeveloperPayoutsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [amount, setAmount] = useState('');
  const [notice, setNotice] = useState({ text: '', tone: 'info' as 'info' | 'success' | 'error' });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async (targetPage: number) => {
    setIsLoading(true);
    try {
      const response = await api<DeveloperPayoutsResponse>(
        `/v1/developer/payouts?page=${targetPage}&pageSize=${PAGE_SIZE}`,
      );
      setData(response);
      if (targetPage > response.pagination.totalPages) setPage(response.pagination.totalPages);
    } catch (error) {
      setNotice({ text: (error as ApiError).message, tone: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  async function requestPayout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountKopecks = kopecksFromRubles(new FormData(event.currentTarget).get('amount'));
    setIsSubmitting(true);
    try {
      await api('/v1/developer/payouts', {
        method: 'POST',
        body: JSON.stringify({ amountKopecks, requestId: crypto.randomUUID() }),
      });
      setAmount('');
      setPage(1);
      await load(1);
      setNotice({
        text: 'Заявка создана. Сумма зарезервирована до решения администратора.',
        tone: 'success',
      });
    } catch (error) {
      setNotice({ text: (error as ApiError).message, tone: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function cancelPayout(id: string) {
    setBusyId(id);
    try {
      await api(`/v1/developer/payouts/${id}/cancel`, { method: 'POST' });
      await load(page);
      setNotice({ text: 'Заявка отменена, резерв возвращен на баланс.', tone: 'success' });
    } catch (error) {
      setNotice({ text: (error as ApiError).message, tone: 'error' });
    } finally {
      setBusyId('');
    }
  }

  const balances = data?.balances;
  const policy = data?.policy;
  const hasOpenPayout = (balances?.reservedKopecks ?? 0) > 0;
  const canRequestMinimum = Boolean(
    policy && balances && balances.availableKopecks >= policy.minAmountKopecks,
  );
  const amountKopecks = kopecksFromRubles(amount);
  const validAmount = Boolean(
    policy &&
    balances &&
    amountKopecks >= policy.minAmountKopecks &&
    amountKopecks <= policy.maxAmountKopecks &&
    amountKopecks <= balances.availableKopecks,
  );

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={WalletCards}
          label="Доступно"
          value={isLoading ? '...' : money(balances?.availableKopecks)}
          detail="Можно включить в новую заявку"
          tone="green"
        />
        <MetricCard
          icon={Clock3}
          label="В резерве"
          value={isLoading ? '...' : money(balances?.reservedKopecks)}
          detail="Ожидает решения"
          tone="amber"
        />
        <MetricCard
          icon={CheckCircle2}
          label="Выплачено"
          value={isLoading ? '...' : money(balances?.paidKopecks)}
          detail="За все время"
          tone="blue"
        />
        <MetricCard
          icon={BadgeRussianRuble}
          label="Минимальная сумма"
          value={isLoading ? '...' : money(policy?.minAmountKopecks, 0)}
          detail="Для одной заявки"
        />
      </div>

      <Message message={notice.text} tone={notice.tone} />

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(320px,0.75fr)_minmax(0,1.25fr)]">
        <WorkSurface
          title="Новая заявка"
          description="Средства сразу перейдут в резерв и не смогут быть запрошены повторно."
        >
          {isLoading ? (
            <LoadingBlock label="Загружаем условия выплаты" />
          ) : (
            <form onSubmit={requestPayout} className="grid gap-5">
              <Field
                label="Сумма вывода, ₽"
                hint={
                  policy && balances
                    ? canRequestMinimum
                      ? `От ${money(policy.minAmountKopecks, 0)} до ${money(Math.min(policy.maxAmountKopecks, balances.availableKopecks), 0)}.`
                      : `До минимальной суммы не хватает ${money(policy.minAmountKopecks - balances.availableKopecks)}.`
                    : undefined
                }
              >
                <input
                  className={inputClass}
                  name="amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="300"
                  required
                  disabled={!canRequestMinimum || hasOpenPayout || isSubmitting}
                />
              </Field>
              <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                <div className="flex items-center gap-2 font-semibold">
                  <ShieldCheck aria-hidden className="h-4 w-4" /> Ручная проверка
                </div>
                <p className="mt-1">
                  Банковские реквизиты не хранятся в Kodpauza. После проверки перевод выполняется во
                  внешнем платежном контуре, а его номер фиксируется в заявке.
                </p>
                <a
                  href={SUPPORT_TELEGRAM_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-md font-semibold text-signal hover:underline"
                >
                  Передать банк и телефон СБП @{SUPPORT_TELEGRAM_USERNAME}
                  <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                </a>
              </div>
              <PrimaryButton disabled={!validAmount || hasOpenPayout || isSubmitting}>
                <HandCoins aria-hidden className="h-4 w-4" />
                {hasOpenPayout
                  ? 'Есть активная заявка'
                  : !canRequestMinimum
                    ? 'Недостаточно средств для вывода'
                    : isSubmitting
                      ? 'Создаем...'
                      : 'Запросить выплату'}
              </PrimaryButton>
            </form>
          )}
        </WorkSurface>

        <WorkSurface
          title="История заявок"
          description="Статусы, решения и номера завершенных переводов."
          action={
            <SecondaryButton onClick={() => void load(page)} disabled={isLoading}>
              <RefreshCw aria-hidden className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Обновить
            </SecondaryButton>
          }
        >
          {isLoading ? (
            <LoadingBlock label="Загружаем выплаты" />
          ) : data?.payouts.length ? (
            <div className="grid gap-2">
              {data.payouts.map((payout) => (
                <PayoutRow
                  key={payout.id}
                  payout={payout}
                  busy={busyId === payout.id}
                  onCancel={() => void cancelPayout(payout.id)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Заявок пока нет"
              text="Когда доступный баланс достигнет минимальной суммы, здесь можно будет запросить первую выплату."
            />
          )}
          {data && data.pagination.total > 0 ? (
            <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
              <span className="text-sm text-slate-500">
                Страница {data.pagination.page} из {data.pagination.totalPages}
              </span>
              <div className="flex gap-2">
                <SecondaryButton
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft aria-hidden className="h-4 w-4" />
                  Назад
                </SecondaryButton>
                <SecondaryButton
                  onClick={() =>
                    setPage((current) => Math.min(data.pagination.totalPages, current + 1))
                  }
                  disabled={page >= data.pagination.totalPages}
                >
                  Вперед
                  <ChevronRight aria-hidden className="h-4 w-4" />
                </SecondaryButton>
              </div>
            </div>
          ) : null}
        </WorkSurface>
      </div>
    </div>
  );
}

function PayoutRow({
  payout,
  busy,
  onCancel,
}: {
  payout: DeveloperPayout;
  busy: boolean;
  onCancel: () => void;
}) {
  return (
    <article className="grid min-w-0 gap-3 rounded-md border border-line p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-semibold text-ink">{money(payout.amountKopecks)}</span>
          <DeveloperPayoutBadge status={payout.status} />
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
          <History aria-hidden className="h-3.5 w-3.5" /> {dateTime(payout.requestedAt)}
        </div>
        {payout.externalReference ? (
          <p className="mt-2 break-all text-sm text-slate-600">
            Номер перевода: <span className="font-medium text-ink">{payout.externalReference}</span>
          </p>
        ) : null}
        {payout.reviewNote ? (
          <p className="mt-2 text-sm leading-6 text-slate-600">{payout.reviewNote}</p>
        ) : null}
      </div>
      {payout.status === 'requested' ? (
        <SecondaryButton onClick={onCancel} disabled={busy}>
          <Ban aria-hidden className="h-4 w-4" /> {busy ? 'Отменяем...' : 'Отменить'}
        </SecondaryButton>
      ) : null}
    </article>
  );
}

export function DeveloperPayoutBadge({ status }: { status: DeveloperPayoutStatus }) {
  const classes: Record<DeveloperPayoutStatus, string> = {
    requested: 'border-amber-200 bg-amber-50 text-amber-800',
    paid: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    rejected: 'border-red-200 bg-red-50 text-red-700',
    canceled: 'border-slate-200 bg-slate-50 text-slate-600',
  };
  return (
    <span
      className={`inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold ${classes[status]}`}
    >
      {developerPayoutLabels[status]}
    </span>
  );
}
