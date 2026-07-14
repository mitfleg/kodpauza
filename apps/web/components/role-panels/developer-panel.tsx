'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Download,
  Eye,
  Gauge,
  MousePointerClick,
  RefreshCw,
  WalletCards,
} from 'lucide-react';
import { api } from '@/lib/api';
import { counted, integer, money } from './format';
import { DeveloperEventList } from './lists';
import type {
  ApiError,
  DeveloperBalance,
  DeveloperEvent,
  DeveloperEventsResponse,
  DeveloperStats,
  Pagination,
} from './types';
import { EmptyState, LoadingBlock, Message, MetricCard, SecondaryButton, WorkSurface } from './ui';

const EVENTS_PAGE_SIZE = 8;

export function DeveloperPanel() {
  const [balance, setBalance] = useState<DeveloperBalance | null>(null);
  const [stats, setStats] = useState<DeveloperStats | null>(null);
  const [events, setEvents] = useState<DeveloperEvent[]>([]);
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsPagination, setEventsPagination] = useState<Pagination>({
    page: 1,
    pageSize: EVENTS_PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isEventsLoading, setIsEventsLoading] = useState(true);

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

  const loadEvents = useCallback(async (page: number) => {
    setIsEventsLoading(true);
    try {
      const data = await api<DeveloperEventsResponse>(
        `/v1/developer/events?page=${page}&pageSize=${EVENTS_PAGE_SIZE}`,
      );
      setEvents(data.events);
      setEventsPagination(data.pagination);
      if (page > data.pagination.totalPages) {
        setEventsPage(data.pagination.totalPages);
      }
    } catch (error) {
      setMessage((error as ApiError).message);
    } finally {
      setIsEventsLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([loadSummary(), loadEvents(eventsPage)]);
  }, [eventsPage, loadEvents, loadSummary]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    void loadEvents(eventsPage);
  }, [eventsPage, loadEvents]);

  const days = stats?.days ?? [];
  const maxDailyImpressions = Math.max(1, ...days.map((day) => day.impressions));

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={WalletCards}
          label="Баланс"
          value={isLoading ? '...' : money(balance?.balanceKopecks)}
          detail="Доступно к выводу"
          tone="green"
        />
        <MetricCard
          icon={Eye}
          label="Показы"
          value={isLoading ? '...' : integer(balance?.totalImpressions)}
          detail="Засчитанные показы"
          tone="blue"
        />
        <MetricCard
          icon={MousePointerClick}
          label="Клики"
          value={isLoading ? '...' : integer(balance?.totalClicks)}
          detail="Переходы по рекламе"
          tone="amber"
        />
        <MetricCard
          icon={Gauge}
          label="Средний отклик"
          value={
            isLoading
              ? '...'
              : `${balance?.totalImpressions ? ((balance.totalClicks / balance.totalImpressions) * 100).toFixed(1) : '0.0'}%`
          }
          detail="Клики от показов"
        />
      </div>

      <WorkSurface
        title="Как учитываются показы"
        description="Прозрачные условия начисления для каждого рекламного показа."
        action={
          <SecondaryButton onClick={() => void refresh()} disabled={isLoading || isEventsLoading}>
            <RefreshCw aria-hidden className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Обновить
          </SecondaryButton>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 font-semibold text-emerald-800">
              <CheckCircle2 aria-hidden className="h-5 w-5" />5 секунд видимости
            </div>
            <p className="mt-2 text-sm leading-6 text-emerald-800">
              Реклама должна быть видна непрерывно, занимать не менее 80% своей области и находиться
              в окне редактора с фокусом. Из нескольких окон начисление идет только в активном.
            </p>
          </div>
          <div className="rounded-md border border-line bg-slate-50 p-4">
            <div className="font-semibold text-ink">Лимиты начислений</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Не более 60 оплачиваемых показов за час и 300 за скользящие 24 часа. Между показами
              должно пройти не менее 10 секунд.
            </p>
          </div>
          <div className="rounded-md border border-line bg-slate-50 p-4">
            <div className="font-semibold text-ink">50% разработчику</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Начисляется половина фактической стоимости чистого показа с округлением вниз до
              копейки. Премиальная реклама обычно дает большее начисление.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {isEventsLoading
              ? 'Обновляем журнал...'
              : eventsPagination.total
                ? `${counted(eventsPagination.total, 'событие', 'события', 'событий')} в журнале начислений`
                : 'Оплаченные события появятся в журнале начислений.'}
          </span>
          <Link
            href="/docs#delivery-rules"
            className="focus-ring rounded font-semibold text-signal hover:underline"
          >
            Полные условия показа и оплаты
          </Link>
        </div>
        <div className="mt-4">
          <Message message={message} tone="error" />
        </div>
      </WorkSurface>

      <WorkSurface
        title="Динамика за 14 дней"
        description="Короткая сводка по засчитанным событиям."
      >
        {isLoading ? (
          <LoadingBlock label="Загружаем статистику" />
        ) : days.length ? (
          <div className="space-y-3">
            {days.map((day) => (
              <div
                key={day.date}
                className="grid gap-2 sm:grid-cols-[110px_minmax(0,1fr)_160px] sm:items-center"
              >
                <div className="text-sm font-medium text-slate-600">
                  {new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(
                    new Date(`${day.date}T12:00:00`),
                  )}
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-mint"
                    style={{
                      width: `${Math.max(6, (day.impressions / maxDailyImpressions) * 100)}%`,
                    }}
                  />
                </div>
                <div className="text-sm text-slate-600">
                  {counted(day.impressions, 'показ', 'показа', 'показов')} ·{' '}
                  {money(day.rewardKopecks)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Пока нет статистики"
            text="Отправьте запрос в Codex или Claude Code после подключения интеграций, и график появится здесь."
          />
        )}
      </WorkSurface>

      <WorkSurface
        title="Начисления и события"
        description="Компактный журнал показов и кликов. На странице отображается не больше восьми записей."
      >
        {isEventsLoading ? (
          <LoadingBlock label="Загружаем начисления" />
        ) : (
          <DeveloperEventList events={events} />
        )}
        {!isEventsLoading && eventsPagination.total > 0 ? (
          <EventPagination pagination={eventsPagination} onPageChange={setEventsPage} />
        ) : null}
      </WorkSurface>

      <WorkSurface
        title="Подключение расширения"
        description="Установите готовый пакет и проверьте первый показ в VS Code."
        action={
          <Link
            href="/install"
            className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Download aria-hidden className="h-4 w-4" />
            Скачать и установить
          </Link>
        }
      >
        <div className="grid gap-3 md:grid-cols-4">
          {[
            ['1', 'Скачать расширение', 'Скачайте kodpauza.vsix на странице установки.'],
            ['2', 'Войти в расширении', 'Ввести почту и пароль аккаунта разработчика.'],
            ['3', 'Подключить интеграции', 'Выполните команду «Kodpauza: Подключить интеграции».'],
            [
              '4',
              'Перезапустить окно',
              'Перезапустите редактор и отправьте запрос в Codex или Claude Code.',
            ],
          ].map(([step, title, text]) => (
            <div key={step} className="rounded-md border border-line bg-slate-50 p-4">
              <div className="grid h-8 w-8 place-items-center rounded-md bg-ink text-sm font-semibold text-white">
                {step}
              </div>
              <div className="mt-3 font-semibold text-ink">{title}</div>
              <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </WorkSurface>
    </div>
  );
}

function EventPagination({
  pagination,
  onPageChange,
}: {
  pagination: Pagination;
  onPageChange: (page: number) => void;
}) {
  const pages = paginationPages(pagination.page, pagination.totalPages);
  return (
    <nav
      className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between"
      aria-label="Страницы журнала начислений"
    >
      <p className="text-sm text-slate-500">
        Страница {pagination.page} из {pagination.totalPages} ·{' '}
        {counted(pagination.total, 'запись', 'записи', 'записей')}
      </p>
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
        <button
          type="button"
          className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          aria-label="Предыдущая страница"
          title="Предыдущая страница"
          disabled={pagination.page <= 1}
          onClick={() => onPageChange(pagination.page - 1)}
        >
          <ChevronLeft aria-hidden className="h-4 w-4" />
        </button>
        {pages.map((item, index) =>
          item === 'gap' ? (
            <span
              key={`gap-${index}`}
              className="grid h-9 w-7 shrink-0 place-items-center text-slate-400"
            >
              ...
            </span>
          ) : (
            <button
              key={item}
              type="button"
              className={`focus-ring h-9 min-w-9 shrink-0 rounded-md border px-2 text-sm font-semibold ${item === pagination.page ? 'border-ink bg-ink text-white' : 'border-line bg-white text-slate-600 hover:bg-slate-50'}`}
              aria-current={item === pagination.page ? 'page' : undefined}
              aria-label={`Страница ${item}`}
              onClick={() => onPageChange(item)}
            >
              {item}
            </button>
          ),
        )}
        <button
          type="button"
          className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          aria-label="Следующая страница"
          title="Следующая страница"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onPageChange(pagination.page + 1)}
        >
          <ChevronRight aria-hidden className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}

function paginationPages(page: number, totalPages: number): Array<number | 'gap'> {
  const visible = new Set(
    [1, totalPages, page - 1, page, page + 1].filter((value) => value >= 1 && value <= totalPages),
  );
  const sorted = [...visible].sort((a, b) => a - b);
  const result: Array<number | 'gap'> = [];
  for (const value of sorted) {
    const previous = result[result.length - 1];
    if (typeof previous === 'number' && value - previous > 1) result.push('gap');
    result.push(value);
  }
  return result;
}
