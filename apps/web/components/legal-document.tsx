import Link from 'next/link';
import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { legalOperator, legalOperatorReady, operatorLabel } from '@/lib/legal-operator';

export type LegalSection = { title: string; content: ReactNode };

export function LegalDocument({
  version,
  sections,
}: {
  version: string;
  sections: LegalSection[];
}) {
  return (
    <div className="grid gap-4">
      {!legalOperatorReady ? (
        <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          <AlertTriangle aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Документ ещё не готов к публикации в продакшене</p>
            <p className="mt-1">
              Не заполнены реквизиты оператора. Локально это предупреждение ожидаемо; перед
              коммерческим запуском укажите все переменные NEXT_PUBLIC_LEGAL_OPERATOR_*.
            </p>
          </div>
        </div>
      ) : null}

      <section className="rounded-md border border-line bg-slate-50 p-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Редакция</dt>
            <dd className="mt-1 font-semibold text-ink">{version}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Оператор / владелец платформы</dt>
            <dd className="mt-1 font-semibold text-ink">{operatorLabel()}</dd>
          </div>
          <div>
            <dt className="text-slate-500">ИНН{legalOperator.registrationNumber ? ' и регистрационный номер' : ''}</dt>
            <dd className="mt-1 text-ink">
              {[legalOperator.inn, legalOperator.registrationNumber].filter(Boolean).join(' · ') || '—'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Контакты и юридические обращения</dt>
            <dd className="mt-1 break-words text-ink">
              {[legalOperator.address, legalOperator.email].filter(Boolean).join(' · ') || (
                <Link className="text-signal hover:underline" href="/support">Страница поддержки</Link>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {sections.map((section, index) => (
        <section key={section.title} className="rounded-md border border-line bg-white p-5 shadow-panel">
          <h2 className="text-lg font-semibold text-ink">
            {index + 1}. {section.title}
          </h2>
          <div className="mt-3 space-y-3 text-sm leading-7 text-slate-600">{section.content}</div>
        </section>
      ))}

      <p className="text-xs leading-5 text-slate-500">
        Вопросы по документу можно направить на{' '}
        {legalOperator.email ? (
          <a className="font-medium text-signal hover:underline" href={`mailto:${legalOperator.email}`}>
            {legalOperator.email}
          </a>
        ) : (
          <Link className="font-medium text-signal hover:underline" href="/support">
            страницу поддержки
          </Link>
        )}
        .
      </p>
    </div>
  );
}
