'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Calculator, FilePlus2, Link2, Loader2, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { buildCampaignUrl } from '@/lib/campaign-tools';
import { reachMetrikaGoal } from '@/lib/metrika';
import { kopecksFromRubles, money, optionalPositiveInteger } from './format';
import type { AdvertiserStats, ApiError, CampaignForecast } from './types';
import { Field, inputClass, Message, PrimaryButton, SecondaryButton, WorkSurface } from './ui';

type ExtraCreative = { id: number; label: string; text: string; url: string };
type SurfaceId = 'codex_vscode' | 'claude_code_vscode';

const surfaceOptions: Array<{ id: SurfaceId; label: string; detail: string }> = [
  { id: 'codex_vscode', label: 'Codex в VS Code', detail: 'Строка ожидания Codex.' },
  { id: 'claude_code_vscode', label: 'Claude Code в VS Code', detail: 'Строка ожидания Claude Code.' },
];

export function AdvertiserNewCampaignPanel() {
  const [stats, setStats] = useState<AdvertiserStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [campaignName, setCampaignName] = useState('');
  const [adText, setAdText] = useState('');
  const [format, setFormat] = useState<'standard' | 'premium'>('standard');
  const [baseCpmRubles, setBaseCpmRubles] = useState(300);
  const [budgetRubles, setBudgetRubles] = useState(5000);
  const [impressionsLimit, setImpressionsLimit] = useState('');
  const [landingUrl, setLandingUrl] = useState('');
  const [utmSource, setUtmSource] = useState('kodpauza');
  const [utmMedium, setUtmMedium] = useState('native');
  const [utmCampaign, setUtmCampaign] = useState('');
  const [forecast, setForecast] = useState<CampaignForecast | null>(null);
  const [isForecasting, setIsForecasting] = useState(false);
  const [extraCreatives, setExtraCreatives] = useState<ExtraCreative[]>([]);
  const [nextCreativeId, setNextCreativeId] = useState(2);
  const [deliveryMode, setDeliveryMode] = useState<'asap' | 'even'>('asap');
  const [dailyBudgetRubles, setDailyBudgetRubles] = useState('');
  const [frequencyCapPerDay, setFrequencyCapPerDay] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [surfaceSettings, setSurfaceSettings] = useState<Record<SurfaceId, { enabled: boolean; cpmRubles: number }>>({
    codex_vscode: { enabled: true, cpmRubles: 300 },
    claude_code_vscode: { enabled: true, cpmRubles: 300 },
  });
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
    const erid = String(form.get('erid') ?? '').trim();
    const creatives = [
      { label: 'Вариант 1', text: adText, url: campaignUrl },
      ...extraCreatives.map((creative) => ({
        label: creative.label,
        text: creative.text,
        url: buildCampaignUrl(creative.url, {
          source: utmSource,
          medium: utmMedium,
          campaign: utmCampaign,
          content: creative.label,
        }),
      })),
    ];
    const selectedSurfaces = surfaceOptions
      .filter((surface) => surfaceSettings[surface.id].enabled)
      .map((surface) => ({
        surface: surface.id,
        cpmKopecks: Math.round(surfaceSettings[surface.id].cpmRubles * 100),
      }));
    if (!selectedSurfaces.length) {
      setIsSaving(false);
      setNotice({ text: 'Выберите хотя бы одну поверхность показа.', tone: 'error' });
      return;
    }
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      setIsSaving(false);
      setNotice({ text: 'Дата завершения должна быть позже даты начала.', tone: 'error' });
      return;
    }

    try {
      await api('/v1/advertiser/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          text: String(form.get('text') ?? ''),
          url: String(form.get('url') ?? ''),
          ...(erid ? { erid } : {}),
          cpmKopecks: kopecksFromRubles(form.get('cpmRubles')),
          budgetKopecks: kopecksFromRubles(form.get('budgetRubles')),
          format,
          creatives,
          surfaces: selectedSurfaces,
          deliveryMode,
          ...(dailyBudgetRubles ? { dailyBudgetKopecks: kopecksFromRubles(dailyBudgetRubles) } : {}),
          ...(frequencyCapPerDay ? { frequencyCapPerDay: Number(frequencyCapPerDay) } : {}),
          ...(startsAt ? { startsAt: new Date(startsAt).toISOString() } : {}),
          ...(endsAt ? { endsAt: new Date(endsAt).toISOString() } : {}),
          ...(impressionsLimit ? { impressionsLimit } : {}),
        }),
      });
      reachMetrikaGoal('campaign_created', {
        format,
        hasImpressionsLimit: Boolean(impressionsLimit),
      });
      formElement.reset();
      setCampaignName('');
      setAdText('');
      setFormat('standard');
      setBaseCpmRubles(300);
      setBudgetRubles(5000);
      setImpressionsLimit('');
      setLandingUrl('');
      setUtmSource('kodpauza');
      setUtmMedium('native');
      setUtmCampaign('');
      setForecast(null);
      setExtraCreatives([]);
      setNextCreativeId(2);
      setDeliveryMode('asap');
      setDailyBudgetRubles('');
      setFrequencyCapPerDay('');
      setStartsAt('');
      setEndsAt('');
      setSurfaceSettings({
        codex_vscode: { enabled: true, cpmRubles: 300 },
        claude_code_vscode: { enabled: true, cpmRubles: 300 },
      });
      await load();
      setNotice({ text: 'Кампания создана и отправлена на модерацию.', tone: 'success' });
    } catch (error) {
      setNotice({ text: (error as ApiError).message, tone: 'error' });
    } finally {
      setIsSaving(false);
    }
  }

  const selectedSurfaceCpms = surfaceOptions
    .filter((surface) => surfaceSettings[surface.id].enabled)
    .map((surface) => surfaceSettings[surface.id].cpmRubles);
  const averageSurfaceCpmRubles = selectedSurfaceCpms.length
    ? selectedSurfaceCpms.reduce((sum, value) => sum + value, 0) / selectedSurfaceCpms.length
    : baseCpmRubles;
  const billableSurfaceCpms = selectedSurfaceCpms.map((value) =>
    format === 'premium' ? Math.ceil(value * 1.5) : value,
  );
  const campaignUrl = useMemo(
    () =>
      buildCampaignUrl(landingUrl, {
        source: utmSource,
        medium: utmMedium,
        campaign: utmCampaign,
      }),
    [landingUrl, utmCampaign, utmMedium, utmSource],
  );

  async function updateForecast() {
    setIsForecasting(true);
    try {
      const query = new URLSearchParams({
        budgetKopecks: String(Math.round(budgetRubles * 100)),
        cpmKopecks: String(Math.round(averageSurfaceCpmRubles * 100)),
        format,
        surfaces: surfaceOptions
          .filter((surface) => surfaceSettings[surface.id].enabled)
          .map((surface) => surface.id)
          .join(','),
      });
      if (impressionsLimit) query.set('impressionsLimit', impressionsLimit);
      setForecast(await api<CampaignForecast>(`/v1/advertiser/forecast?${query}`));
    } catch (error) {
      setNotice({ text: (error as ApiError).message, tone: 'error' });
    } finally {
      setIsForecasting(false);
    }
  }

  function addCreative() {
    if (extraCreatives.length >= 2) return;
    const id = nextCreativeId;
    setExtraCreatives((current) => [
      ...current,
      { id, label: `Вариант ${id}`, text: '', url: '' },
    ]);
    setNextCreativeId((value) => value + 1);
  }

  function updateExtraCreative(id: number, changes: Partial<ExtraCreative>) {
    setExtraCreatives((current) =>
      current.map((creative) => (creative.id === id ? { ...creative, ...changes } : creative)),
    );
  }

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
            <Field label="Название в объявлении" hint="Показывается перед текстом, например: KodPauza · Оффер.">
              <input
                className={inputClass}
                name="name"
                value={campaignName}
                onChange={(event) => setCampaignName(event.target.value)}
                maxLength={40}
                placeholder="KodPauza"
                required
              />
            </Field>
            <Field label="Целевая ссылка" hint="Только HTTPS.">
              <input className={inputClass} value={landingUrl} onChange={(event) => setLandingUrl(event.target.value)} type="url" pattern="https://.*" placeholder="https://example.ru/landing" required />
              <input type="hidden" name="url" value={campaignUrl} />
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

          <div className="grid gap-3 rounded-md border border-line bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Варианты объявления</p>
                <p className="mt-0.5 text-xs text-slate-500">До трёх офферов. Метки вариантов нужны только для статистики и не показываются в объявлении.</p>
              </div>
              <SecondaryButton onClick={addCreative} disabled={extraCreatives.length >= 2}>Добавить вариант</SecondaryButton>
            </div>
            {extraCreatives.map((creative) => (
              <div key={creative.id} className="grid gap-3 rounded-md border border-line bg-white p-3">
                <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_auto]">
                  <input
                    aria-label="Название варианта"
                    title="Внутренняя метка варианта — видна только в статистике"
                    className={inputClass}
                    value={creative.label}
                    onChange={(event) => updateExtraCreative(creative.id, { label: event.target.value })}
                    maxLength={40}
                    required
                  />
                  <input aria-label="Текст варианта" className={inputClass} value={creative.text} onChange={(event) => updateExtraCreative(creative.id, { text: event.target.value })} minLength={8} maxLength={120} placeholder="Другой текст оффера" required />
                  <button type="button" onClick={() => setExtraCreatives((current) => current.filter((item) => item.id !== creative.id))} className="focus-ring rounded-md px-3 text-xs font-semibold text-red-600 hover:bg-red-50">Удалить</button>
                </div>
                <input aria-label="Ссылка варианта" className={inputClass} value={creative.url} onChange={(event) => updateExtraCreative(creative.id, { url: event.target.value })} type="url" pattern="https://.*" placeholder="https://example.ru/alternative" required />
              </div>
            ))}
          </div>

          <Field label="erid" hint="Необязательно. Укажите идентификатор, если он уже получен у оператора рекламных данных.">
            <input className={inputClass} name="erid" minLength={5} maxLength={80} placeholder="2Vtzq..." />
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
                <span className={format === 'premium' ? 'text-amber-300' : 'text-emerald-300'}>{campaignName || 'Название кампании'}</span>
                <span aria-hidden className="text-slate-500">·</span>
                <span className="break-words">{adText || 'Текст объявления'}</span>
              </div>
            </div>
          </div>

          <details className="rounded-md border border-line bg-slate-50 p-4">
            <summary className="focus-ring flex cursor-pointer list-none items-center gap-2 rounded text-sm font-semibold text-ink">
              <Link2 aria-hidden className="h-4 w-4 text-signal" /> UTM-метки
              <span className="ml-auto text-xs font-normal text-slate-500">необязательно</span>
            </summary>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Field label="Источник">
                <input className={inputClass} value={utmSource} onChange={(event) => setUtmSource(event.target.value)} placeholder="kodpauza" />
              </Field>
              <Field label="Канал">
                <input className={inputClass} value={utmMedium} onChange={(event) => setUtmMedium(event.target.value)} placeholder="native" />
              </Field>
              <Field label="Кампания">
                <input className={inputClass} value={utmCampaign} onChange={(event) => setUtmCampaign(event.target.value)} placeholder="summer_launch" />
              </Field>
            </div>
            {campaignUrl ? <p className="mt-3 break-all text-xs leading-5 text-slate-500">Итоговая ссылка: {campaignUrl}</p> : null}
          </details>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Лимит показов" hint="Можно оставить пустым.">
              <input className={inputClass} name="impressionsLimit" type="number" min={1} max={10000000} value={impressionsLimit} onChange={(event) => setImpressionsLimit(event.target.value)} placeholder="Без лимита" />
            </Field>
            <Field label="CPM, ₽" hint="Минимум 20 ₽.">
              <input className={inputClass} name="cpmRubles" type="number" min={20} step={1} value={baseCpmRubles} onChange={(event) => {
                const nextValue = Number(event.target.value);
                setSurfaceSettings((current) => Object.fromEntries(Object.entries(current).map(([key, setting]) => [key, { ...setting, cpmRubles: setting.cpmRubles === baseCpmRubles ? nextValue : setting.cpmRubles }])) as Record<SurfaceId, { enabled: boolean; cpmRubles: number }>);
                setBaseCpmRubles(nextValue);
              }} required />
            </Field>
            <Field label="Бюджет, ₽" hint={`До ${money(stats?.balanceKopecks)}.`}>
              <input className={inputClass} name="budgetRubles" type="number" min={1} max={Math.max(1, (stats?.balanceKopecks ?? 100) / 100)} step={1} value={budgetRubles} onChange={(event) => setBudgetRubles(Number(event.target.value))} required />
            </Field>
          </div>

          <div className="grid gap-3 rounded-md border border-line p-4">
            <div>
              <p className="text-sm font-semibold text-ink">Поверхности и CPM</p>
              <p className="mt-0.5 text-xs text-slate-500">Выберите, где показывать кампанию, и задайте цену отдельно.</p>
            </div>
            <div className="grid gap-2 lg:grid-cols-3">
              {surfaceOptions.map((surface) => {
                const setting = surfaceSettings[surface.id];
                return (
                  <label key={surface.id} className={`grid gap-2 rounded-md border p-3 ${setting.enabled ? 'border-blue-200 bg-blue-50' : 'border-line bg-slate-50'}`}>
                    <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <input type="checkbox" checked={setting.enabled} onChange={(event) => setSurfaceSettings((current) => ({ ...current, [surface.id]: { ...current[surface.id], enabled: event.target.checked } }))} />
                      {surface.label}
                    </span>
                    <span className="text-xs text-slate-500">{surface.detail}</span>
                    <span className="flex items-center gap-2 text-xs text-slate-600">
                      CPM
                      <input aria-label={`CPM ${surface.label}`} className="focus-ring h-9 min-w-0 flex-1 rounded-md border border-line bg-white px-2 text-sm text-ink" type="number" min={20} step={1} disabled={!setting.enabled} value={setting.cpmRubles} onChange={(event) => setSurfaceSettings((current) => ({ ...current, [surface.id]: { ...current[surface.id], cpmRubles: Number(event.target.value) } }))} /> ₽
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 rounded-md border border-line bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-5">
            <Field label="Открутка">
              <select className={inputClass} value={deliveryMode} onChange={(event) => setDeliveryMode(event.target.value as 'asap' | 'even')}>
                <option value="asap">Как можно быстрее</option>
                <option value="even">Равномерно</option>
              </select>
            </Field>
            <Field label="В день, ₽" hint="Необязательно.">
              <input className={inputClass} value={dailyBudgetRubles} onChange={(event) => setDailyBudgetRubles(event.target.value)} type="number" min={1} step={1} placeholder="Без лимита" />
            </Field>
            <Field label="На человека в день" hint="Частота показов.">
              <input className={inputClass} value={frequencyCapPerDay} onChange={(event) => setFrequencyCapPerDay(event.target.value)} type="number" min={1} max={100} placeholder="Без лимита" />
            </Field>
            <Field label="Начало">
              <input className={inputClass} value={startsAt} onChange={(event) => setStartsAt(event.target.value)} type="datetime-local" />
            </Field>
            <Field label="Завершение">
              <input className={inputClass} value={endsAt} onChange={(event) => setEndsAt(event.target.value)} min={startsAt || undefined} type="datetime-local" />
            </Field>
          </div>

          <div className="grid gap-3 rounded-md border border-blue-200 bg-blue-50 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-ink"><Calculator aria-hidden className="h-4 w-4 text-signal" /> Прогноз кампании</p>
              {forecast ? (
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Около <strong className="text-ink">{forecast.estimatedImpressions.toLocaleString('ru-RU')} показов</strong>
                  {forecast.estimatedDays ? ` за ${forecast.estimatedDays} дн.` : '; срок пока нельзя оценить из-за недостатка истории сети'}
                  <span className="block text-xs text-slate-500">{forecast.basis.label} {forecast.disclaimer}</span>
                </p>
              ) : (
                <p className="mt-1 text-xs leading-5 text-slate-500">Расчёт учитывает бюджет, итоговый CPM, лимит и фактическую выдачу сети.</p>
              )}
            </div>
            <SecondaryButton onClick={() => void updateForecast()} disabled={isForecasting || !budgetRubles || !baseCpmRubles}>
              {isForecasting ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Calculator aria-hidden className="h-4 w-4" />}
              Рассчитать
            </SecondaryButton>
          </div>

          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 ${format === 'premium' ? 'border-amber-200 bg-amber-50' : 'border-line bg-slate-50'}`}>
            <div>
              <p className="text-sm font-semibold text-ink">
                Итоговый CPM: {billableSurfaceCpms.length
                  ? `${Math.min(...billableSurfaceCpms)}${Math.min(...billableSurfaceCpms) === Math.max(...billableSurfaceCpms) ? '' : `–${Math.max(...billableSurfaceCpms)}`}`
                  : '—'} ₽
              </p>
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
