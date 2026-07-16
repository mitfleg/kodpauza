import { AlertTriangle, CheckCircle2, Clock3, XCircle } from 'lucide-react';
import { dateTime, money } from './format';
import type { AdminPayment } from './types';

const statusMeta = {
  pending: {
    label: 'Ожидает оплаты',
    className: 'border-amber-200 bg-amber-50 text-amber-800',
    icon: Clock3,
  },
  succeeded: {
    label: 'Зачислено',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    icon: CheckCircle2,
  },
  canceled: {
    label: 'Отменено',
    className: 'border-slate-200 bg-slate-50 text-slate-600',
    icon: XCircle,
  },
  failed: {
    label: 'Ошибка создания',
    className: 'border-red-200 bg-red-50 text-red-700',
    icon: AlertTriangle,
  },
} as const;

export function AdminPaymentList({ payments }: { payments: AdminPayment[] }) {
  if (!payments.length) {
    return (
      <div className="rounded-md border border-dashed border-line px-4 py-10 text-center text-sm text-slate-500">
        Пополнений пока нет.
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {payments.map((payment) => {
        const meta =
          payment.status === 'succeeded' && payment.providerTest
            ? { ...statusMeta.succeeded, label: 'Тест пройден' }
            : statusMeta[payment.status];
        const Icon = meta.icon;
        return (
          <article
            key={payment.id}
            className="grid min-w-0 gap-3 rounded-md border border-line bg-white p-4 lg:grid-cols-[minmax(220px,1fr)_auto_minmax(220px,0.8fr)] lg:items-center"
          >
            <div className="min-w-0">
              <div className="font-semibold text-ink">{payment.advertiser.companyName}</div>
              <div className="mt-1 truncate text-sm text-slate-500">
                {payment.advertiser.user.email}
              </div>
              <div className="mt-1 text-xs text-slate-400">{dateTime(payment.createdAt)}</div>
            </div>
            <div className="lg:text-right">
              <div className="text-lg font-bold text-ink">{money(payment.amountKopecks)}</div>
              {payment.providerTest ? (
                <div className="text-xs font-medium text-amber-700">
                  Тестовый магазин · баланс не пополняется
                </div>
              ) : null}
            </div>
            <div className="min-w-0 lg:justify-self-end">
              <span
                className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs font-semibold ${meta.className}`}
              >
                <Icon aria-hidden className="h-3.5 w-3.5" /> {meta.label}
              </span>
              <div className="mt-2 break-all text-xs text-slate-500">
                {payment.providerPaymentId ?? 'ID ЮKassa еще не получен'}
              </div>
              {payment.failureCode ? (
                <div className="mt-1 break-all text-xs font-medium text-red-700">
                  Код: {payment.failureCode}
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
