'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CircleDollarSign,
  Eye,
  FilePlus2,
  Download,
  Gauge,
  RefreshCw,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import {
  campaignStatus,
  counted,
  integer,
  isCampaignDelivering,
  money,
} from './format';
import type { AdvertiserStats, ApiError } from './types';
import {
  EmptyState,
  LoadingBlock,
  Message,
  SecondaryButton,
  WorkSurface,
} from './ui';

type Notice = { text: string; tone: 'success' | 'error' | 'info' };

export function AdvertiserPanel() {
  const [stats, setStats] = useState<AdvertiserStats | null>(null);
  const [notice, setNotice] = useState<Notice>({ text: '', tone: 'info' });
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setStats(await api<AdvertiserStats>('/v1/advertiser/stats'));
      setNotice({ text: '', tone: 'info' });
    } catch (error) {
      setNotice({ text: (error as ApiError).message, tone: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportCsv() {
    setIsExporting(true);
    try {
      const csv = await api<string>('/v1/advertiser/stats.csv');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'kodpauza-campaigns.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setNotice({ text: (error as ApiError).message, tone: 'error' });
    } finally {
      setIsExporting(false);
    }
  }

  const campaigns = stats?.campaigns ?? [];
  const totals = useMemo(
    () => ({
      active: campaigns.filter(isCampaignDelivering).length,
      pending: campaigns.filter((campaign) => campaign.status === 'pending').length,
    }),
    [campaigns],
  );
  const ctr = stats?.totals.impressions
    ? (stats.totals.clicks / stats.totals.impressions) * 100
    : 0;
  const campaignBudget = campaigns.reduce((sum, campaign) => sum + campaign.budgetKopecks, 0);
  const budgetUsed = campaignBudget
    ? Math.min(100, ((stats?.totals.spentKopecks ?? 0) / campaignBudget) * 100)
    : 0;
  const performanceCampaigns = [...campaigns]
    .sort((left, right) => right.spentKopecks - left.spentKopecks)
    .slice(0, 4);

  return (
    <div className="grid gap-4">
      <Message message={notice.text} tone={notice.tone} />

      <section className="relative isolate overflow-hidden rounded-lg bg-ink p-4 text-white shadow-[0_16px_50px_rgba(23,32,42,0.16)] sm:p-5">
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-45"
          style={{
            backgroundImage:
              'radial-gradient(circle at 82% 10%, rgba(37,99,235,.4), transparent 28%), radial-gradient(circle at 60% 120%, rgba(8,127,109,.22), transparent 36%), linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px)',
            backgroundSize: 'auto, auto, 36px 36px, 36px 36px',
          }}
          aria-hidden
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(230px,1.1fr)_repeat(3,minmax(150px,0.7fr))]">
          <div className="col-span-2 flex min-w-0 flex-col justify-between rounded-md border border-white/10 bg-white/[0.04] p-4 lg:col-span-1">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-300">
                <WalletCards aria-hidden className="h-4 w-4" /> Баланс
              </div>
              <div className="mt-2 text-3xl font-bold tracking-[-0.04em]">
                {isLoading ? '—' : money(stats?.balanceKopecks)}
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {isLoading
                  ? 'Загружаем данные...'
                  : `${counted(totals.active, 'активная кампания', 'активные кампании', 'активных кампаний')}`}
              </p>
            </div>
            <Link
              href="/advertiser/billing"
              className="focus-ring mt-3 inline-flex w-fit items-center gap-1 rounded text-xs font-semibold text-emerald-300 hover:text-white"
            >
              Пополнить <ArrowRight aria-hidden className="h-3.5 w-3.5" />
            </Link>
          </div>
          <OverviewMetric icon={CircleDollarSign} label="Расход" value={isLoading ? '—' : money(stats?.totals.spentKopecks)} detail="за всё время" />
          <OverviewMetric icon={Eye} label="Показы" value={isLoading ? '—' : integer(stats?.totals.impressions)} detail={`${integer(stats?.totals.clicks)} переходов`} />
          <OverviewMetric className="col-span-2 lg:col-span-1" icon={Gauge} label="CTR" value={isLoading ? '—' : `${ctr.toFixed(1)}%`} detail={`${integer(totals.pending)} на модерации`} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
          <Link href="/advertiser/new" className="focus-ring inline-flex h-9 items-center gap-2 rounded-md bg-white px-3 text-xs font-semibold text-ink hover:bg-slate-100">
            <FilePlus2 aria-hidden className="h-4 w-4" /> Новая кампания
          </Link>
          <Link href="/advertiser/campaigns" className="focus-ring inline-flex h-9 items-center gap-2 rounded-md border border-white/15 px-3 text-xs font-semibold text-slate-200 hover:bg-white/10">
            Все кампании <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
          <button type="button" onClick={() => void exportCsv()} disabled={isExporting} className="focus-ring inline-flex h-9 items-center gap-2 rounded-md border border-white/15 px-3 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50">
            <Download aria-hidden className="h-4 w-4" /> {isExporting ? 'Экспорт...' : 'CSV'}
          </button>
          <span className="ml-auto text-xs text-slate-400">Использовано {budgetUsed.toFixed(0)}% общего бюджета</span>
        </div>
      </section>

      <WorkSurface
        title="Кампании в работе"
        description="Короткая сводка по расходу и результату. Полное управление вынесено на отдельную страницу."
        action={
          <SecondaryButton onClick={() => void load()} disabled={isLoading}>
            <RefreshCw aria-hidden className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Обновить
          </SecondaryButton>
        }
      >
        {isLoading ? (
          <LoadingBlock label="Загружаем кампании" />
        ) : performanceCampaigns.length ? (
          <div className="grid gap-2 lg:grid-cols-2">
            {performanceCampaigns.map((campaign) => {
              const spentPercent = campaign.budgetKopecks
                ? Math.min(100, (campaign.spentKopecks / campaign.budgetKopecks) * 100)
                : 0;
              const campaignCtr = campaign.impressionsServed
                ? (campaign.clicks / campaign.impressionsServed) * 100
                : 0;
              return (
                <article key={campaign.id} className="rounded-md border border-line bg-slate-50 p-3">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{campaign.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {campaignStatus(campaign.status)} · {campaign.impressionsServed} показов
                      </p>
                    </div>
                    <strong className="shrink-0 text-sm text-ink">{money(campaign.spentKopecks)}</strong>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-gradient-to-r from-signal to-mint" style={{ width: `${Math.max(spentPercent ? 3 : 0, spentPercent)}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>CTR {campaignCtr.toFixed(1)}%</span>
                    <span>{spentPercent.toFixed(0)}% бюджета</span>
                  </div>
                  {campaign.creatives && campaign.creatives.length > 1 ? (
                    <div className="mt-3 grid gap-1 border-t border-line pt-2">
                      {campaign.creatives.map((creative) => {
                        const creativeCtr = creative.impressionsServed
                          ? (creative.clicks / creative.impressionsServed) * 100
                          : 0;
                        return (
                          <div key={creative.id} className="flex items-center justify-between gap-3 text-[11px] text-slate-500">
                            <span className="truncate">{creative.label}</span>
                            <span className="shrink-0">{integer(creative.impressionsServed)} показов · CTR {creativeCtr.toFixed(1)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Кампаний пока нет" text="Создайте первую кампанию — её показатели появятся здесь." />
        )}
      </WorkSurface>
    </div>
  );
}

function OverviewMetric({
  icon: Icon,
  label,
  value,
  detail,
  className = '',
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  className?: string;
}) {
  return (
    <div className={`min-w-0 rounded-md border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</p>
        <Icon aria-hidden className="h-4 w-4 text-blue-300" />
      </div>
      <p className="mt-3 truncate text-2xl font-bold tracking-[-0.03em] text-white">{value}</p>
      <p className="mt-0.5 text-xs text-slate-400">{detail}</p>
    </div>
  );
}
