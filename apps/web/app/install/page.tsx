import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Check,
  CheckCircle2,
  Code2,
  Download,
  ExternalLink,
  KeyRound,
  MonitorCog,
  RefreshCw,
  Search,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { InstallerCommandCard } from '@/components/installer-command-card';
import { JsonLd } from '@/components/json-ld';
import { MetrikaGoalLink } from '@/components/metrika-goal-link';
import { PageShell } from '@/components/page-shell';
import { buildPublicMetadata } from '@/lib/seo';
import { breadcrumbJsonLd, softwareApplicationJsonLd } from '@/lib/structured-data';
import {
  EXTENSION_MARKETPLACE_URL,
  EXTENSION_OPEN_VSX_URL,
  EXTENSION_VERSION,
} from '@/lib/extension-release';

export const metadata: Metadata = buildPublicMetadata({
  title: 'Установка Kodpauza одной командой',
  description:
    'Установите Kodpauza в Visual Studio Code и Cursor одной командой. Установщик сам найдет редакторы, подключит автоматические обновления и проверит пакет.',
  path: '/install',
});

const installerActions = [
  {
    icon: Search,
    title: 'Найдёт редакторы',
    text: 'Определит VS Code, Cursor и VSCodium на компьютере.',
  },
  {
    icon: Download,
    title: 'Установит актуальную версию',
    text: 'Сначала использует магазин, а при его недоступности — проверенный VSIX.',
  },
  {
    icon: RefreshCw,
    title: 'Сохранит обновления',
    text: 'Магазин обновит сам, а резервная установка проверит подписанную новую версию.',
  },
];

const firstRunSteps = [
  {
    title: 'Откройте палитру команд',
    text: 'Нажмите Ctrl + Shift + P в Windows/Linux или Cmd + Shift + P на macOS.',
  },
  {
    title: 'Введите «Kodpauza: Войти»',
    text: 'Выберите команду в списке, нажмите Enter и укажите почту и пароль.',
  },
  {
    title: 'Продолжайте работать как обычно',
    text: 'Kodpauza проверит совместимые Codex и Claude Code и подготовит интеграции.',
  },
];

export default function InstallPage() {
  return (
    <>
      <JsonLd
        data={[
          softwareApplicationJsonLd,
          breadcrumbJsonLd([
            { name: 'Главная', path: '/' },
            { name: 'Установка', path: '/install' },
          ]),
        ]}
      />
      <PageShell
        eyebrow="Установка за минуту"
        title="Одна команда — Kodpauza в VS Code и Cursor"
        description="Без поиска файлов и меню «Установить из VSIX». Скопируйте команду: она найдёт редакторы, установит расширение и подключит автоматические обновления."
        compact
      >
        <div className="grid gap-5">
          <section className="grid gap-5 lg:grid-cols-[minmax(300px,0.72fr)_minmax(480px,1.28fr)] lg:items-stretch">
            <div className="relative overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50 p-5 sm:p-6">
              <div
                aria-hidden
                className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-emerald-200/50 blur-3xl"
              />
              <div className="relative">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-md bg-white text-mint shadow-sm">
                    <Code2 aria-hidden className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="font-bold text-emerald-950">Kodpauza {EXTENSION_VERSION}</h2>
                    <p className="mt-0.5 text-xs text-emerald-800">
                      VS Code 1.90+ · Cursor · VSCodium
                    </p>
                  </div>
                </div>
                <ul className="mt-6 grid gap-3">
                  {[
                    'Установит сразу во все найденные редакторы',
                    'Не попросит sudo или права администратора',
                    'Не читает проекты, терминал и содержимое файлов',
                    'Повторный запуск безопасно обновит расширение',
                    'Сохранит предыдущий пакет для отката при ошибке',
                  ].map((item) => (
                    <li key={item} className="flex gap-2.5 text-sm leading-5 text-emerald-950">
                      <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-mint" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <InstallerCommandCard />
          </section>

          <section
            aria-labelledby="installer-actions-title"
            className="rounded-lg border border-line bg-white shadow-sm"
          >
            <div className="border-b border-line px-5 py-4">
              <h2 id="installer-actions-title" className="font-bold text-ink">
                Что произойдёт после Enter
              </h2>
            </div>
            <div className="grid divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">
              {installerActions.map((action, index) => {
                const Icon = action.icon;
                return (
                  <article key={action.title} className="p-5">
                    <div className="flex items-center justify-between">
                      <span className="grid h-9 w-9 place-items-center rounded-md bg-slate-100 text-ink">
                        <Icon aria-hidden className="h-4 w-4" />
                      </span>
                      <span className="font-mono text-xs font-semibold text-slate-400">
                        0{index + 1}
                      </span>
                    </div>
                    <h3 className="mt-4 text-sm font-bold text-ink">{action.title}</h3>
                    <p className="mt-1.5 text-sm leading-5 text-slate-600">{action.text}</p>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="rounded-lg border border-line bg-white shadow-sm">
              <div className="flex items-center gap-3 border-b border-line px-5 py-4">
                <span className="grid h-9 w-9 place-items-center rounded-md bg-slate-100 text-ink">
                  <MonitorCog aria-hidden className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="font-bold text-ink">Первый запуск</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Вход выполняется внутри редактора</p>
                </div>
              </div>
              <ol className="divide-y divide-line">
                {firstRunSteps.map((step, index) => (
                  <li
                    key={step.title}
                    className="grid gap-3 px-5 py-4 sm:grid-cols-[28px_minmax(0,1fr)]"
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-md bg-emerald-50 text-xs font-bold text-mint">
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-ink">{step.title}</h3>
                      <p className="mt-1 text-sm leading-5 text-slate-600">{step.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <aside className="grid content-start gap-3">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
                <div className="flex items-center gap-2 text-sm font-bold text-emerald-950">
                  <ShieldCheck aria-hidden className="h-5 w-5 text-mint" />
                  Безопасная установка
                </div>
                <p className="mt-2 text-sm leading-5 text-emerald-900">
                  Основной источник — магазин редактора. Резервный VSIX принимается только после
                  проверки SHA-256. Следующие резервные обновления дополнительно защищены подписью
                  Ed25519, и расширение предложит их само.
                </p>
                <div className="mt-3 flex gap-3 text-xs font-semibold text-emerald-950">
                  <a
                    href="/install.sh"
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    install.sh
                  </a>
                  <a
                    href="/install.ps1"
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    install.ps1
                  </a>
                </div>
              </div>
              <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-bold text-ink">
                  <Terminal aria-hidden className="h-4 w-4" />
                  Если Codex запросит доверие
                </div>
                <p className="mt-2 text-sm leading-5 text-slate-600">
                  Запустите <code className="font-mono text-ink">codex</code> в терминале и
                  выполните <code className="font-mono text-ink">/hooks</code>. В боковой панели
                  редактора эта команда не работает.
                </p>
              </div>
            </aside>
          </section>

          <section className="flex flex-col gap-4 rounded-lg border border-line bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold text-ink">Нужен другой способ?</h2>
              <p className="mt-1 text-sm text-slate-600">
                Можно открыть магазин редактора или скачать VSIX вручную.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={EXTENSION_MARKETPLACE_URL}
                target="_blank"
                rel="noreferrer"
                className="focus-ring inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-xs font-semibold text-ink hover:bg-slate-100"
              >
                Visual Studio Marketplace
                <ExternalLink aria-hidden className="h-3.5 w-3.5" />
              </a>
              <a
                href={EXTENSION_OPEN_VSX_URL}
                target="_blank"
                rel="noreferrer"
                className="focus-ring inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-xs font-semibold text-ink hover:bg-slate-100"
              >
                Open VSX
                <ExternalLink aria-hidden className="h-3.5 w-3.5" />
              </a>
              <MetrikaGoalLink
                goal="extension_download"
                href="/downloads/kodpauza.vsix"
                download="kodpauza.vsix"
                className="focus-ring inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-xs font-semibold text-ink hover:bg-slate-100"
              >
                <Download aria-hidden className="h-3.5 w-3.5" />
                Скачать VSIX
              </MetrikaGoalLink>
            </div>
          </section>

          <section className="flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <CheckCircle2 aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-signal" />
              <div>
                <h2 className="text-sm font-bold text-blue-950">
                  После входа всё подключается автоматически
                </h2>
                <p className="mt-1 text-sm leading-5 text-blue-900">
                  Если потребуется ручная проверка, диагностика покажет конкретную причину и способ
                  исправления.
                </p>
              </div>
            </div>
            <Link
              href="/docs"
              className="focus-ring inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-blue-300 bg-white px-4 text-xs font-semibold text-blue-950 hover:bg-blue-100"
            >
              <KeyRound aria-hidden className="h-3.5 w-3.5" />
              Открыть помощь
            </Link>
          </section>
        </div>
      </PageShell>
    </>
  );
}
