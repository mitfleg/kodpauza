import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { campaignStatus, campaignStatusClass } from './format';

export const inputClass =
  'focus-ring h-11 w-full min-w-0 rounded-md border border-line bg-white px-3 text-base text-ink placeholder:text-slate-400';

type Tone = 'slate' | 'green' | 'blue' | 'amber' | 'red';

const iconToneClasses: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700',
  green: 'bg-emerald-50 text-emerald-700',
  blue: 'bg-blue-50 text-blue-700',
  amber: 'bg-amber-50 text-amber-800',
  red: 'bg-red-50 text-red-700',
};

const badgeToneClasses: Record<Tone, string> = {
  slate: 'border-slate-200 bg-slate-50 text-slate-700',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  blue: 'border-blue-200 bg-blue-50 text-blue-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  red: 'border-red-200 bg-red-50 text-red-700',
};

export function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'slate',
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: Tone;
}) {
  return (
    <section className="min-w-0 rounded-md border border-line bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <div className="mt-2 text-2xl font-semibold text-ink">{value}</div>
          {detail ? <p className="mt-1 text-sm text-slate-500">{detail}</p> : null}
        </div>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-md ${iconToneClasses[tone]}`}>
          <Icon aria-hidden className="h-5 w-5" />
        </span>
      </div>
    </section>
  );
}

export function WorkSurface({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-md border border-line bg-white shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          {description ? <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold ${campaignStatusClass(
        status,
      )}`}
    >
      {campaignStatus(status)}
    </span>
  );
}

export function SoftBadge({ children, tone = 'slate' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold ${badgeToneClasses[tone]}`}>
      {children}
    </span>
  );
}

export function PrimaryButton({
  children,
  disabled = false,
  onClick,
  type = 'submit',
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md bg-mint px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
      type={type}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  type = 'button',
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="grid min-w-0 self-start content-start gap-2 text-sm font-medium text-ink">
      <span>{label}</span>
      {children}
      {hint ? <span className="text-xs leading-5 text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
      <p className="font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-500">{text}</p>
    </div>
  );
}

export function Message({ message, tone = 'info' }: { message: string; tone?: 'info' | 'success' | 'error' }) {
  if (!message) return null;
  const className =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : tone === 'error'
        ? 'border-red-200 bg-red-50 text-red-800'
        : 'border-blue-200 bg-blue-50 text-blue-800';
  return (
    <div className={`rounded-md border px-3 py-2 text-sm font-medium ${className}`} role={tone === 'error' ? 'alert' : 'status'}>
      {message}
    </div>
  );
}

export function LoadingBlock({ label = 'Загружаем данные...' }: { label?: string }) {
  return (
    <div className="grid gap-3" aria-label={label} aria-busy="true">
      <div className="h-20 animate-pulse rounded-md bg-slate-100" />
      <div className="h-20 animate-pulse rounded-md bg-slate-100" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
