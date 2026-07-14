'use client';

import { FormEvent, useState } from 'react';
import { CheckCircle2, HandCoins, X, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { DeveloperPayoutBadge } from './developer-payout-panel';
import { dateTime, money } from './format';
import type { AdminDeveloperPayout, ApiError } from './types';
import { Field, Message, PrimaryButton, SecondaryButton, inputClass } from './ui';

export type PayoutReview = {
  payout: AdminDeveloperPayout;
  action: 'paid' | 'reject';
};

export function AdminDeveloperPayoutList({
  payouts,
  onReview,
}: {
  payouts: AdminDeveloperPayout[];
  onReview: (review: PayoutReview) => void;
}) {
  if (!payouts.length) {
    return (
      <div className="rounded-md border border-dashed border-line px-4 py-10 text-center text-sm text-slate-500">
        Заявок на выплату пока нет.
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {payouts.map((payout) => (
        <article
          key={payout.id}
          className="grid min-w-0 gap-4 rounded-md border border-line p-4 lg:grid-cols-[minmax(220px,1fr)_auto_minmax(260px,0.9fr)] lg:items-center"
        >
          <div className="min-w-0">
            <div className="font-semibold text-ink">
              {payout.developer.user.displayName || 'Разработчик'}
            </div>
            <div className="mt-1 truncate text-sm text-slate-500">
              {payout.developer.user.email}
            </div>
            <div className="mt-1 text-xs text-slate-400">{dateTime(payout.requestedAt)}</div>
          </div>
          <div className="lg:text-right">
            <div className="text-lg font-bold text-ink">{money(payout.amountKopecks)}</div>
            <div className="mt-1">
              <DeveloperPayoutBadge status={payout.status} />
            </div>
          </div>
          <div className="min-w-0 lg:justify-self-end">
            {payout.status === 'requested' ? (
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <button
                  type="button"
                  onClick={() => onReview({ payout, action: 'paid' })}
                  className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-md bg-mint px-3 text-sm font-semibold text-white hover:bg-emerald-800"
                >
                  <CheckCircle2 aria-hidden className="h-4 w-4" /> Подтвердить
                </button>
                <SecondaryButton onClick={() => onReview({ payout, action: 'reject' })}>
                  <XCircle aria-hidden className="h-4 w-4" /> Отклонить
                </SecondaryButton>
              </div>
            ) : (
              <div className="max-w-xs text-sm leading-6 text-slate-600 lg:text-right">
                {payout.externalReference
                  ? `Перевод: ${payout.externalReference}`
                  : payout.reviewNote}
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

export function AdminPayoutReviewDialog({
  review,
  onClose,
  onComplete,
}: {
  review: PayoutReview;
  onClose: () => void;
  onComplete: (message: string) => Promise<void> | void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const paid = review.action === 'paid';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setIsSubmitting(true);
    setError('');
    try {
      if (paid) {
        await api(`/v1/admin/payouts/${review.payout.id}/paid`, {
          method: 'POST',
          body: JSON.stringify({
            externalReference: String(form.get('externalReference') ?? ''),
            note: String(form.get('note') ?? '').trim() || undefined,
          }),
        });
        await onComplete('Выплата подтверждена. Резерв списан, операция сохранена в журнале.');
      } else {
        await api(`/v1/admin/payouts/${review.payout.id}/reject`, {
          method: 'POST',
          body: JSON.stringify({ reason: String(form.get('reason') ?? '') }),
        });
        await onComplete('Заявка отклонена. Зарезервированная сумма возвращена разработчику.');
      }
    } catch (caught) {
      setError((caught as ApiError).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payout-review-title"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-lg rounded-md border border-line bg-white p-5 shadow-panel"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-mint">
              <HandCoins aria-hidden className="h-5 w-5" />
              <span className="text-sm font-semibold">{money(review.payout.amountKopecks)}</span>
            </div>
            <h2 id="payout-review-title" className="mt-2 text-lg font-semibold text-ink">
              {paid ? 'Подтвердить выплату' : 'Отклонить заявку'}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              {review.payout.developer.user.email}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="focus-ring grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
            aria-label="Закрыть"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 grid gap-4">
          {paid ? (
            <>
              <Field
                label="Номер перевода"
                hint="Укажите идентификатор операции из банка или платежного сервиса."
              >
                <input
                  className={inputClass}
                  name="externalReference"
                  minLength={3}
                  maxLength={120}
                  autoComplete="off"
                  required
                  autoFocus
                />
              </Field>
              <Field label="Комментарий">
                <textarea
                  name="note"
                  maxLength={500}
                  className="focus-ring min-h-24 rounded-md border border-line p-3 text-base"
                  placeholder="Необязательно"
                />
              </Field>
            </>
          ) : (
            <Field label="Причина" hint="Разработчик увидит этот текст в истории выплат.">
              <textarea
                name="reason"
                minLength={3}
                maxLength={500}
                className="focus-ring min-h-28 rounded-md border border-line p-3 text-base"
                required
                autoFocus
              />
            </Field>
          )}
          <Message message={error} tone="error" />
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <SecondaryButton onClick={onClose} disabled={isSubmitting}>
            Отмена
          </SecondaryButton>
          <PrimaryButton disabled={isSubmitting}>
            {isSubmitting ? 'Сохраняем...' : paid ? 'Подтвердить перевод' : 'Отклонить заявку'}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}
