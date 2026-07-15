'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { FilePlus2, Loader2, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { reachMetrikaGoal } from '@/lib/metrika';
import { kopecksFromRubles, money, optionalPositiveInteger } from './format';
import type { AdvertiserStats, ApiError } from './types';
import { Field, inputClass, Message, PrimaryButton, WorkSurface } from './ui';

export function AdvertiserNewCampaignPanel() {
  const [stats, setStats] = useState<AdvertiserStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [adText, setAdText] = useState('');
  const [format, setFormat] = useState<'standard' | 'premium'>('standard');
  const [baseCpmRubles, setBaseCpmRubles] = useState(300);
  const [notice, setNotice] = useState<{ text: string; tone: 'success' | 'error' | 'info' }>({ text: '', tone: 'info' });

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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setNotice({ text: '', tone: 'info' });
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const impressionsLimit = optionalPositiveInteger(form.get('impressionsLimit'));

    try {
      await api('/v1/advertiser/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          text: String(form.get('text') ?? ''),
          url: String(form.get('url') ?? ''),
          cpmKopecks: kopecksFromRubles(form.get('cpmRubles')),
          budgetKopecks: kopecksFromRubles(form.get('budgetRubles')),
          format,
          ...(impressionsLimit ? { impressionsLimit } : {}),
        }),
      });
      reachMetrikaGoal('campaign_created', {
        format,
        hasImpressionsLimit: Boolean(impressionsLimit),
      });
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

  const billableCpmRubles = format === 'premium' ? Math.ceil(baseCpmRubles * 1.5) : baseCpmRubles;

  return (
    <div className="grid max-w-5xl gap-4">
      <Message message={notice.text} tone={notice.tone} />
      <WorkSurface
        title="Параметры кампании"
        description={`Доступный баланс: ${isLoading ? 'загружается' : money(stats?.balanceKopecks)}.`}
      >
        <form
          onSubmit={submit}
          onInvalid={() => setNotice({ text: 'Проверьте выделенные поля кампании.', tone: 'error' })}
          className="grid gap-4"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Название" hint="Видно только вам и администратору.">
              <input className={inputClass} name="name" maxLength={120} placeholder="Облако для разработчиков" required />
            </Field>
            <Field label="Целевая ссылка" hint="Только HTTPS.">
              <input className={inputClass} name="url" type="url" pattern="https://.*" placeholder="https://example.ru/landing" required />
            </Field>
          </div>

          <Field label="Текст объявления" hint="От 8 до 120 символов.">
            <textarea
              className="focus-ring min-h-20 w-full resize-y rounded-md border border-line bg-white px-3 py-2 text-base text-ink placeholder:text-slate-400"
              name="text"
              value={adText}
              onChange={(event) => setAdText(event.target.value)}
              placeholder="Серверы для разработки с быстрым стартом"
              minLength={8}
              maxLength={120}
              required
            />
          </Field>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)]">
            <fieldset className="grid gap-2">
              <legend className="text-sm font-semibold text-ink">Формат</legend>
              <div className="grid rounded-md border border-line bg-slate-100 p-1 sm:grid-cols-2">
                <FormatOption active={format === 'standard'} onChange={() => setFormat('standard')} value="standard" title="Стандарт" text="Нативная строка по базовому CPM." />
                <FormatOption active={format === 'premium'} onChange={() => setFormat('premium')} value="premium" title="Премиум" text="Тонкая рамка и +50% к CPM." premium />
              </div>
            </fieldset>
            <div className={`rounded-md border px-4 py-3 text-white ${format === 'premium' ? 'border-amber-400 bg-slate-900' : 'border-slate-700 bg-ink'}`}>
              <div className="text-xs text-slate-400">Предпросмотр</div>
              <div className="mt-3 flex min-h-6 items-center gap-2 text-sm font-medium">
                <span className={format === 'premium' ? 'text-amber-300' : 'text-emerald-300'}>Реклама</span>
                <span className="break-words">{adText || 'Текст объявления'}</span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Лимит показов" hint="Можно оставить пустым.">
              <input className={inputClass} name="impressionsLimit" type="number" min={1} max={10000000} placeholder="Без лимита" />
            </Field>
            <Field label="CPM, ₽" hint="Минимум 20 ₽.">
              <input className={inputClass} name="cpmRubles" type="number" min={20} step={1} value={baseCpmRubles} onChange={(event) => setBaseCpmRubles(Number(event.target.value))} required />
            </Field>
            <Field label="Бюджет, ₽" hint={`До ${money(stats?.balanceKopecks)}.`}>
              <input className={inputClass} name="budgetRubles" type="number" min={1} max={Math.max(1, (stats?.balanceKopecks ?? 100) / 100)} step={1} defaultValue={5000} required />
            </Field>
          </div>

          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 ${format === 'premium' ? 'border-amber-200 bg-amber-50' : 'border-line bg-slate-50'}`}>
            <div>
              <p className="text-sm font-semibold text-ink">Итоговый CPM: {Number.isFinite(billableCpmRubles) ? billableCpmRubles : 0} ₽</p>
              <Link href="/docs#delivery-rules" className="focus-ring mt-1 inline-flex rounded text-xs font-semibold text-signal hover:underline">Условия показа и оплаты</Link>
            </div>
            <PrimaryButton disabled={isSaving || isLoading}>
              {isSaving ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <FilePlus2 aria-hidden className="h-4 w-4" />}
              {isSaving ? 'Отправляем...' : 'Отправить на модерацию'}
            </PrimaryButton>
          </div>
        </form>
      </WorkSurface>
    </div>
  );
}

function FormatOption({ active, onChange, value, title, text, premium = false }: { active: boolean; onChange: () => void; value: string; title: string; text: string; premium?: boolean }) {
  return (
    <label className={`focus-within:ring-2 cursor-pointer rounded px-3 py-2.5 ${active ? premium ? 'bg-amber-50 shadow-sm' : 'bg-white shadow-sm' : ''}`}>
      <input className="sr-only" type="radio" name="format" value={value} checked={active} onChange={onChange} />
      <span className={`flex items-center gap-2 text-sm font-semibold ${premium ? 'text-amber-900' : 'text-ink'}`}>
        {premium ? <Sparkles aria-hidden className="h-4 w-4" /> : null}{title}
      </span>
      <span className={`mt-0.5 block text-xs ${premium ? 'text-amber-800' : 'text-slate-500'}`}>{text}</span>
    </label>
  );
}
