'use client';

import { useState } from 'react';
import type { AdminPrivacyRequest } from './types';
import { PrimaryButton, SecondaryButton } from './ui';

const typeLabels: Record<AdminPrivacyRequest['type'], string> = {
  access: 'Доступ к данным',
  correction: 'Исправление',
  deletion: 'Удаление',
  consent_withdrawal: 'Отзыв согласия',
};

export function AdminPrivacyRequests({
  requests,
  busyId,
  onResolve,
}: {
  requests: AdminPrivacyRequest[];
  busyId: string;
  onResolve: (id: string, status: 'processing' | 'completed' | 'rejected', resolution: string) => void;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (!requests.length) return <p className="text-sm text-slate-500">Заявок по персональным данным нет.</p>;

  return <div className="grid gap-3">{requests.map((request) => {
    const note = notes[request.id] ?? request.resolution ?? '';
    const closed = ['completed', 'rejected', 'canceled'].includes(request.status);
    return <article key={request.id} className="rounded-md border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="font-semibold text-ink">{typeLabels[request.type]}</h3><p className="mt-1 text-sm text-slate-600">{request.user.email} · {request.user.role}</p></div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{request.status}</span>
      </div>
      {request.details ? <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-700">{request.details}</p> : null}
      <label className="mt-3 grid gap-2 text-sm font-medium text-ink">Результат обработки
        <textarea disabled={closed} value={note} onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))} maxLength={2000} rows={3} className="focus-ring rounded-md border border-line p-3 text-sm disabled:bg-slate-50" placeholder="Что проверено и что сделано" />
      </label>
      {!closed ? <div className="mt-3 flex flex-wrap gap-2">
        {request.status === 'requested' ? <SecondaryButton disabled={busyId === request.id || note.trim().length < 3} onClick={() => onResolve(request.id, 'processing', note)}>Взять в работу</SecondaryButton> : null}
        <PrimaryButton disabled={busyId === request.id || note.trim().length < 3} onClick={() => onResolve(request.id, 'completed', note)}>Исполнено</PrimaryButton>
        <SecondaryButton disabled={busyId === request.id || note.trim().length < 3} onClick={() => onResolve(request.id, 'rejected', note)}>Отклонить</SecondaryButton>
      </div> : null}
    </article>;
  })}</div>;
}
