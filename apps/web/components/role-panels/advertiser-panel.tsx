'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  CircleDollarSign,
  Clock3,
  Eye,
  FilePlus2,
  Loader2,
  RefreshCw,
  Sparkles,
  WalletCards,
} from 'lucide-react';
import { api } from '@/lib/api';
import {
  counted,
  integer,
  isCampaignDelivering,
  kopecksFromRubles,
  money,
  optionalPositiveInteger,
} from './format';
import { CampaignList } from './lists';
import { AdvertiserPayments } from './advertiser-payments';
import type { AdvertiserStats, ApiError, Campaign } from './types';
import {
  Field,
  inputClass,
  LoadingBlock,
  Message,
  MetricCard,
  PrimaryButton,
  SecondaryButton,
  WorkSurface,
} from './ui';

type Notice = { text: string; tone: 'success' | 'error' | 'info' };

export function AdvertiserPanel() {
  const [stats, setStats] = useState<AdvertiserStats | null>(null);
  const [notice, setNotice] = useState<Notice>({ text: '', tone: 'info' });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [adText, setAdText] = useState('');
  const [format, setFormat] = useState<'standard' | 'premium'>('standard');
  const [baseCpmRubles, setBaseCpmRubles] = useState(300);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api<AdvertiserStats>('/v1/advertiser/stats');
      setStats(data);
    } catch (error) {
      setNotice({ text: (error as ApiError).message, tone: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setNotice({ text: '', tone: 'info' });
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const impressionsLimit = optionalPositiveInteger(form.get('impressionsLimit'));
    const data = {
      name: String(form.get('name') ?? ''),
      text: String(form.get('text') ?? ''),
      url: String(form.get('url') ?? ''),
      cpmKopecks: kopecksFromRubles(form.get('cpmRubles')),
      budgetKopecks: kopecksFromRubles(form.get('budgetRubles')),
      format,
      ...(impressionsLimit ? { impressionsLimit } : {}),
    };

    try {
      await api('/v1/advertiser/campaigns', { method: 'POST', body: JSON.stringify(data) });
      formElement.reset();
      setAdText('');
      setFormat('standard');
      setBaseCpmRubles(300);
      await load();
      setNotice({ text: 'Кампания создана и отправлена на модерацию.', tone: 'success' });
    } catch (error) {
      setNotice({ text: (error as ApiError).message, tone: 'error' });
    } finally {
      setIsSaving(false);
    }
  }

  async function campaignAction(campaign: Campaign, status: 'paused' | 'pending') {
    setNotice({ text: '', tone: 'info' });
    try {
      await api(`/v1/advertiser/campaigns/${campaign.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
      setNotice({
        text:
          status === 'paused'
            ? 'Кампания приостановлена.'
            : 'Кампания повторно отправлена на модерацию.',
        tone: 'success',
      });
    } catch (error) {
      setNotice({ text: (error as ApiError).message, tone: 'error' });
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  const campaigns = stats?.campaigns ?? [];
  const billableCpmRubles = format === 'premium' ? Math.ceil(baseCpmRubles * 1.5) : baseCpmRubles;
  const totals = useMemo(
    () => ({
      active: campaigns.filter(isCampaignDelivering).length,
      pending: campaigns.filter((campaign) => campaign.status === 'pending').length,
    }),
    [campaigns],
  );

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={WalletCards}
          label="Доступный баланс"
          value={isLoading ? '...' : money(stats?.balanceKopecks)}
          detail="Средства для активных кампаний"
          tone="green"
        />
        <MetricCard
          icon={CircleDollarSign}
          label="Расход"
          value={isLoading ? '...' : money(stats?.totals.spentKopecks)}
          detail={counted(
            totals.active,
            'активная кампания',
            'активные кампании',
            'активных кампаний',
          )}
          tone="blue"
        />
        <MetricCard
          icon={Eye}
          label="Результат"
          value={isLoading ? '...' : integer(stats?.totals.impressions)}
          detail={counted(stats?.totals.clicks ?? 0, 'клик', 'клика', 'кликов')}
        />
        <MetricCard
          icon={Clock3}
          label="На модерации"
          value={isLoading ? '...' : integer(totals.pending)}
          detail={counted(campaigns.length, 'кампания всего', 'кампании всего', 'кампаний всего')}
          tone="amber"
        />
      </div>

      <Message message={notice.text} tone={notice.tone} />

      <AdvertiserPayments onBalanceChanged={load} />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(500px,0.92fr)_minmax(0,1.08fr)]">
        <WorkSurface
          title="Новая кампания"
          description="После модерации объявление появится во всех подключенных интеграциях."
        >
          <form
            onSubmit={submit}
            onInvalid={() =>
              setNotice({ text: 'Проверьте выделенные поля кампании.', tone: 'error' })
            }
            className="grid gap-5"
          >
            <Field
              label="Название кампании"
              hint="Служебное название видно только вам и администратору."
            >
              <input
                className={inputClass}
                name="name"
                maxLength={120}
                placeholder="Облако для разработчиков"
                required
              />
            </Field>
            <Field
              label="Текст объявления"
              hint="До 120 символов. Именно эту строку увидит разработчик."
            >
              <textarea
                className="focus-ring min-h-24 w-full min-w-0 resize-y rounded-md border border-line bg-white px-3 py-2 text-base text-ink placeholder:text-slate-400"
                name="text"
                value={adText}
                onChange={(event) => setAdText(event.target.value)}
                placeholder="Серверы для разработки с быстрым стартом"
                minLength={8}
                maxLength={120}
                required
              />
            </Field>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-semibold text-ink">Формат размещения</legend>
              <div className="grid rounded-md border border-line bg-slate-100 p-1 sm:grid-cols-2">
                <label
                  className={`focus-within:ring-2 focus-within:ring-signal focus-within:ring-offset-1 cursor-pointer rounded px-3 py-3 ${format === 'standard' ? 'bg-white shadow-sm' : ''}`}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name="format"
                    value="standard"
                    checked={format === 'standard'}
                    onChange={() => setFormat('standard')}
                  />
                  <span className="block text-sm font-semibold text-ink">Стандарт</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    Обычная строка. Оплата по указанному CPM.
                  </span>
                </label>
                <label
                  className={`focus-within:ring-2 focus-within:ring-amber-500 focus-within:ring-offset-1 cursor-pointer rounded px-3 py-3 ${format === 'premium' ? 'bg-amber-50 shadow-sm' : ''}`}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name="format"
                    value="premium"
                    checked={format === 'premium'}
                    onChange={() => setFormat('premium')}
                  />
                  <span className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                    <Sparkles aria-hidden className="h-4 w-4" /> Премиум
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-amber-800">
                    Выделенная рамка и +50% к итоговому CPM.
                  </span>
                </label>
              </div>
            </fieldset>
            <div
              className={`rounded-md border px-4 py-3 text-white ${format === 'premium' ? 'border-amber-400 bg-slate-900 shadow-[0_0_0_1px_rgba(245,158,11,0.16)]' : 'border-slate-700 bg-ink'}`}
            >
              <div className="text-xs text-slate-400">Предпросмотр во время работы помощника</div>
              <div className="mt-2 flex min-h-6 items-center gap-2 text-sm font-medium">
                <span className={format === 'premium' ? 'text-amber-300' : 'text-emerald-300'}>
                  Реклама
                </span>
                <span className="break-words">{adText || 'Здесь появится текст объявления'}</span>
              </div>
            </div>
            <Field label="Целевая ссылка" hint="Только защищенная ссылка HTTPS.">
              <input
                className={inputClass}
                name="url"
                type="url"
                pattern="https://.*"
                placeholder="https://example.ru/landing"
                required
              />
            </Field>

            <Field
              label="Лимит показов"
              hint="Оставьте пустым, чтобы ограничивать только бюджетом."
            >
              <input
                className={inputClass}
                name="impressionsLimit"
                type="number"
                min={1}
                max={10000000}
                placeholder="Без лимита"
              />
            </Field>
            <div className="grid min-w-0 items-start gap-4 md:grid-cols-2">
              <Field
                label="Цена 1000 показов, ₽"
                hint="Минимум 20 ₽. Разработчик получает 50% цены показа."
              >
                <input
                  className={inputClass}
                  name="cpmRubles"
                  type="number"
                  min={20}
                  step={1}
                  value={baseCpmRubles}
                  onChange={(event) => setBaseCpmRubles(Number(event.target.value))}
                  required
                />
              </Field>
              <Field
                label="Бюджет кампании, ₽"
                hint={`Не больше доступного баланса: ${money(stats?.balanceKopecks)}.`}
              >
                <input
                  className={inputClass}
                  name="budgetRubles"
                  type="number"
                  min={1}
                  max={Math.max(1, (stats?.balanceKopecks ?? 100) / 100)}
                  step={1}
                  defaultValue={5000}
                  required
                />
              </Field>
            </div>
            <div
              className={`rounded-md border p-4 ${format === 'premium' ? 'border-amber-200 bg-amber-50' : 'border-line bg-slate-50'}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink">Итоговый CPM к списанию</span>
                <span className="text-lg font-bold text-ink">
                  {Number.isFinite(billableCpmRubles) ? billableCpmRubles : 0} ₽
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Разработчику начисляется 50% с округлением вниз до копейки. Кампании ранжируются по
                итоговому CPM.
              </p>
              <Link
                href="/docs#delivery-rules"
                className="focus-ring mt-2 inline-flex rounded text-xs font-semibold text-signal hover:underline"
              >
                Все условия показа и оплаты
              </Link>
            </div>
            <PrimaryButton disabled={isSaving || isLoading}>
              {isSaving ? (
                <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
              ) : (
                <FilePlus2 aria-hidden className="h-4 w-4" />
              )}
              {isSaving ? 'Отправляем...' : 'Отправить на модерацию'}
            </PrimaryButton>
          </form>
        </WorkSurface>

        <WorkSurface
          title="Кампании"
          description="Статусы, фактический расход и результат объявлений."
          action={
            <SecondaryButton onClick={() => void load()} disabled={isLoading}>
              <RefreshCw aria-hidden className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Обновить
            </SecondaryButton>
          }
        >
          {isLoading ? (
            <LoadingBlock label="Загружаем кампании" />
          ) : (
            <CampaignList campaigns={campaigns} onAction={campaignAction} />
          )}
        </WorkSurface>
      </div>
    </div>
  );
}
