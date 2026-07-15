'use client';

import { useCallback, useEffect, useState } from 'react';
import { WalletCards } from 'lucide-react';
import { api } from '@/lib/api';
import { money } from './format';
import { AdvertiserPayments } from './advertiser-payments';
import type { AdvertiserStats, ApiError } from './types';
import { Message } from './ui';

export function AdvertiserBillingPanel() {
  const [stats, setStats] = useState<AdvertiserStats | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setStats(await api<AdvertiserStats>('/v1/advertiser/stats'));
      setError('');
    } catch (caught) {
      setError((caught as ApiError).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="grid gap-4">
      <Message message={error} tone="error" />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-ink px-4 py-3 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-white/10 text-emerald-300"><WalletCards aria-hidden className="h-5 w-5" /></span>
          <div><p className="text-xs text-slate-400">Доступный баланс</p><p className="text-xl font-bold">{stats ? money(stats.balanceKopecks) : '—'}</p></div>
        </div>
        <p className="text-xs text-slate-400">Расход по кампаниям: {stats ? money(stats.totals.spentKopecks) : '—'}</p>
      </div>
      <AdvertiserPayments onBalanceChanged={load} />
    </div>
  );
}
