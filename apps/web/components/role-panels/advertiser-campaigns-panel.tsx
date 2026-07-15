'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FilePlus2, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { isCampaignDelivering } from './format';
import { CampaignList } from './lists';
import type { AdvertiserStats, ApiError, Campaign } from './types';
import { LoadingBlock, Message, SecondaryButton, WorkSurface } from './ui';

export function AdvertiserCampaignsPanel() {
  const [stats, setStats] = useState<AdvertiserStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<{ text: string; tone: 'success' | 'error' | 'info' }>({
    text: '',
    tone: 'info',
  });

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setStats(await api<AdvertiserStats>('/v1/advertiser/stats'));
    } catch (error) {
      setNotice({ text: (error as ApiError).message, tone: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function campaignAction(campaign: Campaign, status: 'paused' | 'pending') {
    setNotice({ text: '', tone: 'info' });
    try {
      await api(`/v1/advertiser/campaigns/${campaign.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
      setNotice({
        text: status === 'paused' ? 'Кампания приостановлена.' : 'Кампания отправлена на модерацию.',
        tone: 'success',
      });
    } catch (error) {
      setNotice({ text: (error as ApiError).message, tone: 'error' });
    }
  }

  const campaigns = stats?.campaigns ?? [];
  const counts = useMemo(
    () => ({
      total: campaigns.length,
      active: campaigns.filter(isCampaignDelivering).length,
      pending: campaigns.filter((campaign) => campaign.status === 'pending').length,
      paused: campaigns.filter((campaign) => campaign.status === 'paused').length,
    }),
    [campaigns],
  );

  return (
    <div className="grid gap-4">
      <Message message={notice.text} tone={notice.tone} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CountCard label="Всего" value={counts.total} />
        <CountCard label="Активны" value={counts.active} />
        <CountCard label="На модерации" value={counts.pending} />
        <CountCard label="На паузе" value={counts.paused} />
      </div>
      <WorkSurface
        title="Все кампании"
        description="Статусы, расход и управление объявлениями."
        action={
          <div className="flex flex-wrap gap-2">
            <SecondaryButton onClick={() => void load()} disabled={isLoading}>
              <RefreshCw aria-hidden className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Обновить
            </SecondaryButton>
            <Link href="/advertiser/new" className="focus-ring inline-flex h-10 items-center gap-2 rounded-md bg-mint px-3 text-sm font-semibold text-white hover:bg-emerald-800">
              <FilePlus2 aria-hidden className="h-4 w-4" /> Создать
            </Link>
          </div>
        }
      >
        {isLoading ? (
          <LoadingBlock label="Загружаем кампании" />
        ) : (
          <CampaignList campaigns={campaigns} onAction={campaignAction} />
        )}
      </WorkSurface>
    </div>
  );
}

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-line bg-white px-3 py-2.5 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-bold text-ink">{value}</p>
    </div>
  );
}
