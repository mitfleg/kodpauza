'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthState } from '@/lib/auth-state';
import { roleLabel } from '@/lib/navigation';

type DeletionRequest = {
  id: string;
  type: 'deletion';
  status: 'requested' | 'processing' | 'completed' | 'rejected' | 'canceled';
  createdAt: string;
};

type AdvertiserProfile = {
  companyName: string;
  publicName: string;
  advertiserInfoUrl: string | null;
  inn: string | null;
  ordOrganizationId: string | null;
};

const statusLabels: Record<DeletionRequest['status'], string> = {
  requested: 'На рассмотрении',
  processing: 'В работе',
  completed: 'Выполнена',
  rejected: 'Отклонена',
  canceled: 'Отменена',
};

export function AccountSettings() {
  const { user } = useAuthState();
  const [deletionRequest, setDeletionRequest] = useState<DeletionRequest | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [profile, setProfile] = useState<AdvertiserProfile | null>(null);
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;

    api<{ requests: DeletionRequest[] }>('/v1/privacy/requests')
      .then(({ requests }) => {
        if (!active) return;
        setDeletionRequest(requests.find((request) => request.type === 'deletion') ?? null);
      })
      .catch((error) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : 'Не удалось загрузить настройки.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (user?.role !== 'advertiser') return;
    let active = true;
    api<{ profile: AdvertiserProfile }>('/v1/advertiser/profile')
      .then(({ profile: nextProfile }) => {
        if (active) setProfile(nextProfile);
      })
      .catch((error) => {
        if (active) {
          setMessage(error instanceof Error ? error.message : 'Не удалось загрузить профиль.');
        }
      });
    return () => {
      active = false;
    };
  }, [user?.role]);

  async function saveAdvertiserProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileSubmitting(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await api<{ profile: AdvertiserProfile }>('/v1/advertiser/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: String(form.get('companyName') ?? ''),
          publicName: String(form.get('publicName') ?? ''),
          advertiserInfoUrl: String(form.get('advertiserInfoUrl') ?? ''),
          inn: String(form.get('inn') ?? ''),
        }),
      });
      setProfile(response.profile);
      setMessage('Данные рекламодателя сохранены.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось сохранить профиль.');
    } finally {
      setProfileSubmitting(false);
    }
  }

  async function requestDeletion() {
    setSubmitting(true);
    setMessage('');
    try {
      const response = await api<{ request: DeletionRequest }>('/v1/privacy/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'deletion' }),
      });
      setDeletionRequest(response.request);
      setConfirming(false);
      setConfirmed(false);
      setMessage('Заявка на удаление аккаунта отправлена.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось отправить заявку.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid max-w-3xl gap-5">
      <section className="rounded-md border border-line bg-white p-5 shadow-panel">
        <h2 className="font-semibold text-ink">Аккаунт</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Почта</dt>
            <dd className="mt-1 font-medium text-ink">{user?.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Роль</dt>
            <dd className="mt-1 font-medium text-ink">{user ? roleLabel[user.role] : '—'}</dd>
          </div>
        </dl>
      </section>

      {user?.role === 'advertiser' && profile ? (
        <section className="rounded-md border border-line bg-white p-5 shadow-panel">
          <h2 className="font-semibold text-ink">Данные рекламодателя</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            В объявлении показывается только публичный бренд. Юридическое имя и ИНН используются для
            модерации и передачи сведений в ОРД.
          </p>
          <form className="mt-4 grid gap-4" onSubmit={(event) => void saveAdvertiserProfile(event)}>
            <label className="grid gap-1.5 text-sm font-medium text-ink">
              Публичный бренд
              <input
                className="focus-ring h-11 rounded-md border border-line px-3 font-normal"
                name="publicName"
                defaultValue={profile.publicName}
                minLength={2}
                maxLength={80}
                required
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-ink">
              Юридическое имя
              <input
                className="focus-ring h-11 rounded-md border border-line px-3 font-normal"
                name="companyName"
                defaultValue={profile.companyName}
                minLength={2}
                maxLength={160}
                required
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-ink">
              ИНН
              <input
                className="focus-ring h-11 rounded-md border border-line px-3 font-normal"
                name="inn"
                defaultValue={profile.inn ?? ''}
                inputMode="numeric"
                pattern="(?:\d{10}|\d{12})"
                required
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-ink">
              Публичная страница со сведениями о рекламодателе
              <input
                className="focus-ring h-11 rounded-md border border-line px-3 font-normal"
                name="advertiserInfoUrl"
                defaultValue={profile.advertiserInfoUrl ?? ''}
                type="url"
                pattern="https://.*"
                placeholder="https://example.ru/advertiser"
                required
              />
            </label>
            <button
              type="submit"
              disabled={profileSubmitting}
              className="focus-ring inline-flex h-10 w-fit items-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {profileSubmitting ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
              Сохранить данные
            </button>
          </form>
        </section>
      ) : null}

      <section className="rounded-md border border-red-200 bg-white p-5 shadow-panel">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-red-50 text-red-700">
            <Trash2 aria-hidden className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-ink">Удаление аккаунта</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              После удаления восстановить аккаунт и его рабочие данные будет нельзя. Финансовые
              записи, которые необходимо хранить по закону, могут быть сохранены отдельно.
            </p>

            {loading ? (
              <p className="mt-4 inline-flex items-center gap-2 text-sm text-slate-500">
                <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                Проверяем статус...
              </p>
            ) : deletionRequest && ['requested', 'processing'].includes(deletionRequest.status) ? (
              <div className="mt-4 rounded-md bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                Заявка отправлена {new Date(deletionRequest.createdAt).toLocaleDateString('ru-RU')}.
                Статус: <strong>{statusLabels[deletionRequest.status]}</strong>.
              </div>
            ) : confirming ? (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-4">
                <label className="flex items-start gap-3 text-sm leading-6 text-red-950">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                    className="mt-1 h-4 w-4 accent-red-700"
                  />
                  <span>
                    Я понимаю, что после выполнения заявки аккаунт нельзя будет восстановить.
                  </span>
                </label>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void requestDeletion()}
                    disabled={!confirmed || submitting}
                    className="focus-ring inline-flex h-10 items-center gap-2 rounded-md bg-red-700 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
                    Отправить заявку на удаление
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(false);
                      setConfirmed(false);
                    }}
                    disabled={submitting}
                    className="focus-ring h-10 rounded-md border border-line bg-white px-4 text-sm font-semibold text-ink"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="focus-ring mt-4 inline-flex h-10 items-center gap-2 rounded-md border border-red-200 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50"
              >
                <Trash2 aria-hidden className="h-4 w-4" />
                Удалить аккаунт
              </button>
            )}

            {message ? (
              <p className="mt-3 text-sm leading-6 text-slate-600" aria-live="polite">
                {message}
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
