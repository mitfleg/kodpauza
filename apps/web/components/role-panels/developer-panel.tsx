'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Eye,
  Gauge,
  MousePointerClick,
  RefreshCw,
  TrendingUp,
  type LucideIcon,
  WalletCards,
} from 'lucide-react';
import { api } from '@/lib/api';
import { counted, integer, money } from './format';
import type { ApiError, DeveloperBalance, DeveloperStats } from './types';
import { EmptyState, LoadingBlock, Message, SecondaryButton, WorkSurface } from './ui';

export function DeveloperPanel() {
  const [balance, setBalance] = useState<DeveloperBalance | null>(null);
  const [stats, setStats] = useState<DeveloperStats | null>(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadSummary = useCallback(async () => {
    setIsLoading(true);
    try {
      setMessage('');
      const [balanceData, statsData] = await Promise.all([
        api<DeveloperBalance>('/v1/developer/balance'),
        api<DeveloperStats>('/v1/developer/stats'),
      ]);
      setBalance(balanceData);
      setStats(statsData);
    } catch (error) {
      setMessage((error as ApiError).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const days = stats?.days ?? [];
  const maxDailyImpressions = Math.max(1, ...days.map((day) => day.impressions));
  const period = days.reduce(
    (result, day) => ({
      impressions: result.impressions + day.impressions,
      clicks: result.clicks + day.clicks,
      rewardKopecks: result.rewardKopecks + day.rewardKopecks,
    }),
    { impressions: 0, clicks: 0, rewardKopecks: 0 },
  );
  const totalCtr = balance?.totalImpressions
    ? (balance.totalClicks / balance.totalImpressions) * 100
    : 0;

  return (
    <div className="grid gap-4">
      <section className="relative isolate overflow-hidden rounded-xl bg-ink p-4 text-white shadow-[0_18px_55px_rgba(23,32,42,0.16)] sm:p-5">
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(circle at 82% 10%, rgba(37,99,235,.34), transparent 26%), radial-gradient(circle at 64% 95%, rgba(8,127,109,.3), transparent 30%), linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)',
            backgroundSize: 'auto, auto, 40px 40px, 40px 40px',
          }}
          aria-hidden
        />
        <div className="grid gap-5 lg:grid-cols-[minmax(240px,0.7fr)_minmax(0,1.3fr)] lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-emerald-300">
              <WalletCards aria-hidden className="h-4 w-4" /> Доступно к выводу
            </div>
            <div className="mt-3 text-3xl font-bold tracking-[-0.04em]">
              {isLoading ? '—' : money(balance?.balanceKopecks)}
            </div>
            <p className="mt-2 max-w-sm text-sm leading-5 text-slate-300">
              Баланс обновляется после каждого засчитанного показа.
            </p>
            <Link
              href="/developer/payouts"
              className="focus-ring mt-4 inline-flex h-9 items-center justify-center rounded-md bg-white px-4 text-sm font-semibold text-ink transition hover:bg-slate-100"
            >
              Перейти к выплатам
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <DashboardMetric
              icon={Eye}
              label="Всего показов"
              value={isLoading ? '—' : integer(balance?.totalImpressions)}
              detail="засчитано системой"
            />
            <DashboardMetric
              icon={MousePointerClick}
              label="Переходы"
              value={isLoading ? '—' : integer(balance?.totalClicks)}
              detail="кликов по объявлениям"
            />
            <DashboardMetric
              icon={Gauge}
              label="CTR"
              value={isLoading ? '—' : `${totalCtr.toFixed(1)}%`}
              detail="от всех показов"
            />
          </div>
        </div>
      </section>

      <Message message={message} tone="error" />

      {balance?.quota ? <QuotaOverview quota={balance.quota} /> : null}

      <WorkSurface
        title="Доход и показы за 14 дней"
        description="Данные по реально засчитанным событиям. Наведите на столбец, чтобы увидеть сумму за день."
        action={
          <SecondaryButton onClick={() => void loadSummary()} disabled={isLoading}>
            <RefreshCw aria-hidden className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Обновить
          </SecondaryButton>
        }
      >
        {isLoading ? (
          <LoadingBlock label="Загружаем статистику" />
        ) : days.length ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_230px]">
            <div className="min-w-0 overflow-x-auto pb-2">
              <div className="relative border-b border-line px-2 pt-7 sm:min-w-[650px]">
                <div
                  className="pointer-events-none absolute inset-x-2 top-7 grid h-[145px] grid-rows-4"
                  aria-hidden
                >
                  <span className="border-t border-dashed border-slate-200" />
                  <span className="border-t border-dashed border-slate-200" />
                  <span className="border-t border-dashed border-slate-200" />
                  <span className="border-t border-dashed border-slate-200" />
                </div>
                <div className="relative flex h-[175px] items-end gap-2 sm:gap-3">
                  {days.map((day) => {
                    const height = Math.max(8, (day.impressions / maxDailyImpressions) * 100);
                    const label = new Intl.DateTimeFormat('ru-RU', {
                      day: '2-digit',
                      month: 'short',
                    }).format(new Date(`${day.date}T12:00:00`));
                    return (
                      <div
                        key={day.date}
                        className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2"
                      >
                        <div className="relative flex h-[140px] w-full items-end justify-center">
                          <div
                            className="relative w-full max-w-8 rounded-t-md bg-gradient-to-t from-emerald-700 to-emerald-400 transition group-hover:from-signal group-hover:to-blue-400"
                            style={{ height: `${height}%` }}
                            title={`${counted(day.impressions, 'показ', 'показа', 'показов')} · ${money(day.rewardKopecks)}`}
                          >
                            <span className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[10px] font-semibold text-white shadow-lg group-hover:block">
                              {money(day.rewardKopecks)}
                            </span>
                          </div>
                        </div>
                        <span className="whitespace-nowrap text-[10px] font-medium text-slate-500">
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <aside className="grid content-start gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <PeriodMetric
                icon={TrendingUp}
                label="Доход за период"
                value={money(period.rewardKopecks)}
                tone="green"
              />
              <PeriodMetric
                icon={Eye}
                label="Показы за период"
                value={integer(period.impressions)}
                tone="blue"
              />
              <PeriodMetric
                icon={MousePointerClick}
                label="Клики за период"
                value={integer(period.clicks)}
                tone="amber"
              />
            </aside>
          </div>
        ) : (
          <EmptyState
            title="Пока нет статистики"
            text="Отправьте запрос в Codex или Claude Code после подключения интеграций, и график появится здесь."
          />
        )}
      </WorkSurface>
    </div>
  );
}

function QuotaOverview({ quota }: { quota: DeveloperBalance['quota'] }) {
  const tierLabel = {
    starter: 'Начальный',
    trusted: 'Проверенный',
    mature: 'Расширенный',
  }[quota.tier];

  return (
    <WorkSurface
      title="Доступные оплачиваемые показы"
      description={`Уровень «${tierLabel}». Квота общая для Codex и Claude Code и обновляется автоматически.`}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <QuotaMeter
          label="За скользящий час"
          used={quota.hour.used}
          limit={quota.hour.limit}
          remaining={quota.hour.remaining}
          capped={quota.exhausted === 'hour'}
        />
        <QuotaMeter
          label="За скользящие 24 часа"
          used={quota.rollingDay.used}
          limit={quota.rollingDay.limit}
          remaining={quota.rollingDay.remaining}
          capped={quota.exhausted === 'rolling_day'}
        />
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">
        Лимит повышается до 450 и затем до 600 показов после формирования стабильной истории
        подтверждённых событий.
      </p>
    </WorkSurface>
  );
}

function QuotaMeter({
  label,
  used,
  limit,
  remaining,
  capped,
}: {
  label: string;
  used: number;
  limit: number;
  remaining: number;
  capped: boolean;
}) {
  const progress = Math.min(100, Math.max(0, (used / Math.max(1, limit)) * 100));

  return (
    <div className="rounded-lg border border-line bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            {label}
          </p>
          <p className="mt-2 text-xl font-bold tracking-[-0.03em] text-ink">
            {integer(remaining)} осталось
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            capped ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'
          }`}
        >
          {integer(used)} / {integer(limit)}
        </span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden>
        <div
          className={`h-full rounded-full transition-[width] ${
            capped ? 'bg-amber-500' : 'bg-emerald-600'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function DashboardMetric({
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
    <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.06] p-3.5 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
          {label}
        </p>
        <Icon aria-hidden className="h-4 w-4 text-emerald-300" />
      </div>
      <p className="mt-3 truncate text-xl font-bold tracking-[-0.03em] text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{detail}</p>
    </div>
  );
}

function PeriodMetric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: 'green' | 'blue' | 'amber';
}) {
  const toneClass =
    tone === 'green'
      ? 'bg-emerald-50 text-emerald-700'
      : tone === 'blue'
        ? 'bg-blue-50 text-blue-700'
        : 'bg-amber-50 text-amber-800';
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-line bg-slate-50 p-3.5">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${toneClass}`}>
        <Icon aria-hidden className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="mt-1 truncate text-base font-bold text-ink">{value}</p>
      </div>
    </div>
  );
}
