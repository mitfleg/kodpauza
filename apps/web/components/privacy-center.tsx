'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Download, Loader2, Send, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';

type PrivacyRequest = {
  id: string;
  type: 'access' | 'correction' | 'deletion' | 'consent_withdrawal';
  status: 'requested' | 'processing' | 'completed' | 'rejected' | 'canceled';
  details?: string | null;
  resolution?: string | null;
  createdAt: string;
};

const typeLabels: Record<PrivacyRequest['type'], string> = {
  access: 'Получить сведения об обработке',
  correction: 'Исправить данные',
  deletion: 'Удалить аккаунт и данные',
  consent_withdrawal: 'Отозвать согласие',
};

const statusLabels: Record<PrivacyRequest['status'], string> = {
  requested: 'Получена',
  processing: 'В работе',
  completed: 'Исполнена',
  rejected: 'Отклонена',
  canceled: 'Отменена',
};

export function PrivacyCenter() {
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [type, setType] = useState<PrivacyRequest['type']>('access');
  const [details, setDetails] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function load() {
    try {
      const response = await api<{ requests: PrivacyRequest[] }>('/v1/privacy/requests');
      setRequests(response.requests);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось загрузить заявки.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function downloadExport() {
    setExporting(true);
    setMessage('');
    try {
      const data = await api<unknown>('/v1/privacy/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `kodpauza-data-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage('Архив данных сформирован и скачан.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось сформировать архив.');
    } finally {
      setExporting(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      await api('/v1/privacy/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, details: details.trim() || undefined }),
      });
      setDetails('');
      setMessage('Заявка зарегистрирована. Статус появится ниже.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось отправить заявку.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-5">
        <section className="rounded-md border border-line bg-white p-5 shadow-panel">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-700"><ShieldCheck aria-hidden className="h-5 w-5" /></span>
            <div>
              <h2 className="font-semibold text-ink">Копия данных аккаунта</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">JSON-файл включает профиль, принятые документы, кампании или выплаты, события и историю заявок. Пароли, секреты и служебные антифрод-хеши не выгружаются.</p>
              <button type="button" onClick={() => void downloadExport()} disabled={exporting} className="focus-ring mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:opacity-60">
                {exporting ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Download aria-hidden className="h-4 w-4" />}
                Скачать мои данные
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-md border border-line bg-white p-5 shadow-panel">
          <h2 className="font-semibold text-ink">История обращений</h2>
          {loading ? <p className="mt-3 text-sm text-slate-500">Загружаем...</p> : requests.length ? (
            <div className="mt-4 grid gap-3">
              {requests.map((request) => (
                <article key={request.id} className="rounded-md border border-line p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-ink">{typeLabels[request.type]}</p>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{statusLabels[request.status]}</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{new Date(request.createdAt).toLocaleString('ru-RU')}</p>
                  {request.details ? <p className="mt-2 leading-6 text-slate-600">{request.details}</p> : null}
                  {request.resolution ? <p className="mt-2 rounded-md bg-slate-50 p-3 leading-6 text-slate-700"><strong>Ответ:</strong> {request.resolution}</p> : null}
                </article>
              ))}
            </div>
          ) : <p className="mt-3 text-sm text-slate-500">Обращений пока нет.</p>}
        </section>
      </div>

      <form onSubmit={submit} className="h-fit rounded-md border border-line bg-white p-5 shadow-panel">
        <h2 className="font-semibold text-ink">Запрос по данным</h2>
        <label className="mt-4 grid gap-2 text-sm font-medium text-ink">Тип обращения
          <select value={type} onChange={(event) => setType(event.target.value as PrivacyRequest['type'])} className="focus-ring h-11 rounded-md border border-line bg-white px-3">
            {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="mt-4 grid gap-2 text-sm font-medium text-ink">Комментарий
          <textarea value={details} onChange={(event) => setDetails(event.target.value)} required={type === 'correction'} maxLength={2000} rows={5} className="focus-ring resize-y rounded-md border border-line p-3 text-sm" placeholder={type === 'correction' ? 'Какие данные неверны и на что их заменить' : 'Необязательно'} />
        </label>
        {type === 'deletion' ? <p className="mt-3 rounded-md bg-amber-50 p-3 text-xs leading-5 text-amber-900">Удаление не выполняется мгновенно: сначала завершаются расчеты и определяется, какие финансовые записи закон требует сохранить.</p> : null}
        {type === 'consent_withdrawal' ? <p className="mt-3 rounded-md bg-amber-50 p-3 text-xs leading-5 text-amber-900">Отзыв может сделать невозможной часть функций аккаунта. Обработка по обязательным основаниям прекращается не всегда.</p> : null}
        <button type="submit" disabled={submitting} className="focus-ring mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:opacity-60">
          {submitting ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Send aria-hidden className="h-4 w-4" />}
          Отправить заявку
        </button>
        {message ? <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-700" aria-live="polite">{message}</p> : null}
      </form>
    </div>
  );
}
