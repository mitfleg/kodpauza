'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { counted } from './format';
import { DeveloperEventList } from './lists';
import type { ApiError, DeveloperEvent, DeveloperEventsResponse, Pagination } from './types';
import { LoadingBlock, Message, SecondaryButton, WorkSurface } from './ui';

const PAGE_SIZE = 8;

export function DeveloperEventsPanel() {
  const [events, setEvents] = useState<DeveloperEvent[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async (targetPage: number) => {
    setIsLoading(true);
    try {
      setMessage('');
      const data = await api<DeveloperEventsResponse>(
        `/v1/developer/events?page=${targetPage}&pageSize=${PAGE_SIZE}`,
      );
      setEvents(data.events);
      setPagination(data.pagination);
      if (targetPage > data.pagination.totalPages) setPage(data.pagination.totalPages);
    } catch (error) {
      setMessage((error as ApiError).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  return (
    <div className="grid gap-4">
      <Message message={message} tone="error" />

      <WorkSurface
        title="Условия начисления"
        description="Коротко о том, когда показ считается оплаченным."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <RuleCard
            accent
            title="5 секунд видимости"
            text="Не менее 80% рекламного блока должно быть непрерывно видно в активном окне редактора."
          />
          <RuleCard
            title="Лимиты начислений"
            text="До 60 оплачиваемых показов в час и 300 за скользящие 24 часа с паузой между показами."
          />
          <RuleCard
            title="50% разработчику"
            text="На баланс поступает половина фактической стоимости чистого показа с округлением до копейки."
          />
        </div>
        <div className="mt-3 flex justify-end border-t border-line pt-3">
          <Link
            href="/docs#delivery-rules"
            className="focus-ring rounded text-sm font-semibold text-signal hover:underline"
          >
            Полные условия показа и оплаты
          </Link>
        </div>
      </WorkSurface>

      <WorkSurface
        title="Начисления и события"
        description="Показы, клики и результат проверки события."
        action={
          <SecondaryButton onClick={() => void load(page)} disabled={isLoading}>
            <RefreshCw aria-hidden className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Обновить
          </SecondaryButton>
        }
      >
        {isLoading ? (
          <LoadingBlock label="Загружаем события" />
        ) : (
          <DeveloperEventList events={events} />
        )}
        {!isLoading && pagination.total > 0 ? (
          <EventPagination pagination={pagination} onPageChange={setPage} />
        ) : null}
      </WorkSurface>
    </div>
  );
}

function RuleCard({
  title,
  text,
  accent = false,
}: {
  title: string;
  text: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-4 ${accent ? 'border-emerald-200 bg-emerald-50' : 'border-line bg-slate-50'}`}
    >
      <div
        className={`flex items-center gap-2 font-semibold ${accent ? 'text-emerald-800' : 'text-ink'}`}
      >
        {accent ? <CheckCircle2 aria-hidden className="h-5 w-5" /> : null}
        {title}
      </div>
      <p className={`mt-2 text-sm leading-5 ${accent ? 'text-emerald-800' : 'text-slate-600'}`}>
        {text}
      </p>
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
        <PageButton
          label="Предыдущая страница"
          disabled={pagination.page <= 1}
          onClick={() => onPageChange(pagination.page - 1)}
        >
          <ChevronLeft aria-hidden className="h-4 w-4" />
        </PageButton>
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
        <PageButton
          label="Следующая страница"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onPageChange(pagination.page + 1)}
        >
          <ChevronRight aria-hidden className="h-4 w-4" />
        </PageButton>
      </div>
    </nav>
  );
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
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
