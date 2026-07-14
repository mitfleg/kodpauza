'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, CreditCard, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { dateTime, money } from './format';
import type { AdvertiserPayment, AdvertiserPaymentsResponse, ApiError } from './types';
import { inputClass, Message, PrimaryButton, SecondaryButton, WorkSurface } from './ui';

const paymentLabels: Record<AdvertiserPayment['status'], string> = {
  pending: 'Ожидает оплаты',
  succeeded: 'Зачислено',
  canceled: 'Отменено',
  failed: 'Не создано',
};

const paymentClasses: Record<AdvertiserPayment['status'], string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  succeeded: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  canceled: 'border-slate-200 bg-slate-50 text-slate-600',
  failed: 'border-red-200 bg-red-50 text-red-700',
};

export function AdvertiserPayments({
  onBalanceChanged,
}: {
  onBalanceChanged: () => Promise<void>;
}) {
  const [payments, setPayments] = useState<AdvertiserPayment[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [amount, setAmount] = useState('5000');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'success' | 'error' | 'info' }>({
    text: '',
    tone: 'info',
  });

  const loadPayments = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api<AdvertiserPaymentsResponse>('/v1/advertiser/payments');
      setPayments(response.payments);
      setEnabled(response.enabled);
    } catch (error) {
      setMessage({ text: (error as ApiError).message, tone: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  useEffect(() => {
    const paymentId = new URLSearchParams(window.location.search).get('payment');
    if (!paymentId) return;
    window.history.replaceState({}, '', window.location.pathname);
    void (async () => {
      try {
        const response = await api<{ payment: AdvertiserPayment }>(
          `/v1/advertiser/payments/${encodeURIComponent(paymentId)}/refresh`,
          {
            method: 'POST',
            body: JSON.stringify({}),
          },
        );
        if (response.payment.status === 'succeeded') {
          setMessage({
            text: 'Оплата подтверждена. Средства зачислены на баланс.',
            tone: 'success',
          });
          await onBalanceChanged();
        } else if (response.payment.status === 'pending') {
          setMessage({
            text: 'ЮKassa еще обрабатывает платеж. Обновите статус через несколько секунд.',
            tone: 'info',
          });
        } else {
          setMessage({ text: 'Платеж не был завершен. Баланс не изменен.', tone: 'error' });
        }
        await loadPayments();
      } catch (error) {
        setMessage({ text: (error as ApiError).message, tone: 'error' });
      }
    })();
  }, [loadPayments, onBalanceChanged]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountKopecks = parseRubles(amount);
    if (amountKopecks === null) {
      setMessage({
        text: 'Введите сумму от 1 до 10 000 000 ₽, не более двух знаков после запятой.',
        tone: 'error',
      });
      return;
    }

    setIsCreating(true);
    setMessage({ text: '', tone: 'info' });
    try {
      const response = await api<{ payment: AdvertiserPayment }>('/v1/advertiser/payments', {
        method: 'POST',
        body: JSON.stringify({ amountKopecks, requestId: paymentRequestId(amountKopecks) }),
      });
      window.sessionStorage.removeItem(paymentRequestStorageKey);
      if (response.payment.status === 'succeeded') {
        setMessage({ text: 'Средства зачислены на баланс.', tone: 'success' });
        await onBalanceChanged();
        await loadPayments();
        return;
      }
      if (!response.payment.confirmationUrl) {
        throw new Error('ЮKassa не вернула ссылку оплаты.');
      }
      window.location.assign(response.payment.confirmationUrl);
    } catch (error) {
      setMessage({ text: (error as ApiError).message, tone: 'error' });
      setIsCreating(false);
    }
  }

  async function refreshPayment(payment: AdvertiserPayment) {
    setMessage({ text: '', tone: 'info' });
    try {
      const response = await api<{ payment: AdvertiserPayment }>(
        `/v1/advertiser/payments/${encodeURIComponent(payment.id)}/refresh`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        },
      );
      if (response.payment.status === 'succeeded') {
        setMessage({ text: 'Платеж подтвержден и зачислен.', tone: 'success' });
        await onBalanceChanged();
      } else {
        setMessage({ text: `Статус: ${paymentLabels[response.payment.status]}.`, tone: 'info' });
      }
      await loadPayments();
    } catch (error) {
      setMessage({ text: (error as ApiError).message, tone: 'error' });
    }
  }

  return (
    <WorkSurface
      title="Баланс и пополнение"
      description="Введите любую сумму и оплатите ее на защищенной странице ЮKassa."
    >
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(280px,0.78fr)_minmax(0,1.22fr)]">
        <form
          onSubmit={submit}
          className="grid gap-4 rounded-md border border-line bg-slate-50 p-4"
        >
          <label className="grid gap-2 text-sm font-semibold text-ink">
            Сумма пополнения, ₽
            <div className="relative">
              <CreditCard
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
              />
              <input
                className={`${inputClass} pl-10`}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                min="1"
                max="10000000"
                step="0.01"
                placeholder="5000"
                aria-describedby="top-up-hint"
                required
              />
            </div>
          </label>
          <p id="top-up-hint" className="text-xs leading-5 text-slate-600">
            От 1 ₽ до 10 000 000 ₽. Комиссия и доступные способы оплаты отображаются на стороне
            ЮKassa.
          </p>
          <PrimaryButton disabled={!enabled || isCreating || isLoading}>
            {isCreating ? (
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUpRight aria-hidden className="h-4 w-4" />
            )}
            {isCreating ? 'Создаем платеж...' : 'Перейти к оплате'}
          </PrimaryButton>
          <div className="flex items-start gap-2 text-xs leading-5 text-slate-600">
            <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            Баланс изменится только после серверной проверки успешного платежа. Данные карты
            Kodpauza не получает.
          </div>
          {!isLoading && !enabled ? (
            <Message message="ЮKassa пока не настроена администратором." tone="info" />
          ) : null}
        </form>

        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink">Последние пополнения</h3>
            <SecondaryButton onClick={() => void loadPayments()} disabled={isLoading}>
              <RefreshCw aria-hidden className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Обновить
            </SecondaryButton>
          </div>
          <Message message={message.text} tone={message.tone} />
          <div className="mt-3 grid gap-2">
            {!isLoading && payments.length === 0 ? (
              <div className="rounded-md border border-dashed border-line px-4 py-8 text-center text-sm text-slate-500">
                Пополнений пока нет.
              </div>
            ) : null}
            {payments.slice(0, 6).map((payment) => (
              <div
                key={payment.id}
                className="flex min-w-0 flex-col gap-3 rounded-md border border-line bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{money(payment.amountKopecks)}</span>
                    <span
                      className={`rounded border px-2 py-0.5 text-xs font-semibold ${paymentClasses[payment.status]}`}
                    >
                      {paymentLabels[payment.status]}
                    </span>
                    {payment.providerTest ? (
                      <span className="text-xs text-slate-500">Тестовый платеж</span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Создан {dateTime(payment.createdAt)}
                  </div>
                </div>
                {payment.status === 'pending' ? (
                  <SecondaryButton onClick={() => void refreshPayment(payment)}>
                    <RefreshCw aria-hidden className="h-4 w-4" /> Проверить
                  </SecondaryButton>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </WorkSurface>
  );
}

function parseRubles(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  const amount = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount >= 100 && amount <= 1_000_000_000 ? amount : null;
}

const paymentRequestStorageKey = 'kodpauza_pending_payment_request';

function paymentRequestId(amountKopecks: number): string {
  try {
    const stored = JSON.parse(
      window.sessionStorage.getItem(paymentRequestStorageKey) ?? 'null',
    ) as unknown;
    if (
      typeof stored === 'object' &&
      stored !== null &&
      'amountKopecks' in stored &&
      'requestId' in stored &&
      stored.amountKopecks === amountKopecks &&
      typeof stored.requestId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        stored.requestId,
      )
    ) {
      return stored.requestId;
    }
  } catch {
    window.sessionStorage.removeItem(paymentRequestStorageKey);
  }

  const requestId = crypto.randomUUID();
  window.sessionStorage.setItem(
    paymentRequestStorageKey,
    JSON.stringify({ amountKopecks, requestId }),
  );
  return requestId;
}
