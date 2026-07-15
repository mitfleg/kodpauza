import Link from 'next/link';
import { CheckCircle2, Download, ExternalLink } from 'lucide-react';
import { WorkSurface } from './ui';

const steps = [
  ['1', 'Скачать расширение', 'Получите актуальный файл kodpauza.vsix.'],
  ['2', 'Войти в аккаунт', 'Используйте почту и пароль разработчика.'],
  ['3', 'Подключить интеграции', 'Запустите команду «Kodpauza: Подключить интеграции».'],
  [
    '4',
    'Проверить первый показ',
    'Перезапустите редактор и отправьте запрос в Codex или Claude Code.',
  ],
];

export function DeveloperIntegrationPanel() {
  return (
    <div className="grid gap-4">
      <WorkSurface
        title="Подключение к VS Code"
        description="Четыре шага до первого рекламного события."
        action={
          <Link
            href="/install"
            className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Download aria-hidden className="h-4 w-4" />
            Скачать расширение
          </Link>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {steps.map(([step, title, text]) => (
            <div key={step} className="rounded-md border border-line bg-slate-50 p-4">
              <div className="grid h-8 w-8 place-items-center rounded-md bg-ink text-sm font-semibold text-white">
                {step}
              </div>
              <div className="mt-3 font-semibold text-ink">{title}</div>
              <p className="mt-1 text-sm leading-5 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </WorkSurface>
      <div className="flex flex-col gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
          <CheckCircle2 aria-hidden className="h-5 w-5" />
          Готово, если расширение показывает статус «Подключено».
        </span>
        <Link
          href="/docs"
          className="focus-ring inline-flex items-center gap-2 rounded text-sm font-semibold text-emerald-900 hover:underline"
        >
          Инструкция и диагностика <ExternalLink aria-hidden className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
