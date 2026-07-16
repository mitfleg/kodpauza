import type { Metadata } from 'next';
import Link from 'next/link';
import {
  CheckCircle2,
  Code2,
  Download,
  ExternalLink,
  KeyRound,
  MousePointer2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { JsonLd } from '@/components/json-ld';
import { MetrikaGoalLink } from '@/components/metrika-goal-link';
import { buildPublicMetadata } from '@/lib/seo';
import { breadcrumbJsonLd, softwareApplicationJsonLd } from '@/lib/structured-data';
import { EXTENSION_MARKETPLACE_URL, EXTENSION_VERSION } from '@/lib/extension-release';

export const metadata: Metadata = buildPublicMetadata({
  title: 'Расширение Kodpauza для VS Code',
  description:
    'Скачайте расширение Kodpauza для Visual Studio Code, подключите Codex и Claude Code и получайте доход за подтвержденные показы рекламы во время ожидания AI.',
  path: '/install',
});

const installSteps = [
  {
    icon: Download,
    title: 'Скачайте пакет',
    text: 'Нажмите «Скачать расширение». Браузер сохранит файл kodpauza.vsix в папку загрузок.',
  },
  {
    icon: MousePointer2,
    title: 'Откройте установку из VSIX',
    text: 'В VS Code откройте «Расширения», нажмите меню с тремя точками и выберите «Установить из VSIX…».',
  },
  {
    icon: RefreshCw,
    title: 'Перезапустите окно VS Code',
    text: 'После установки нажмите «Перезагрузить окно», если редактор предложит это сделать.',
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
            { name: 'Расширение для VS Code', path: '/install' },
          ]),
        ]}
      />
      <PageShell
        eyebrow="Расширение для VS Code"
        title="Установите Kodpauza и зарабатывайте во время работы AI"
        description="Codex и Claude Code продолжают работать как обычно. Kodpauza показывает короткую рекламу только во время ожидания и начисляет деньги за подтвержденный просмотр."
      >
        <div className="grid gap-6">
          <section className="grid gap-6 rounded-md border border-slate-700 bg-ink p-6 text-white shadow-panel lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-md bg-white/10">
                  <Code2 aria-hidden className="h-6 w-6" />
                </span>
                <div>
                  <h2 className="text-xl font-bold">Kodpauza для Visual Studio Code</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Версия {EXTENSION_VERSION} · VS Code 1.90 и новее
                  </p>
                </div>
              </div>
              <p className="mt-5 max-w-2xl text-sm leading-6 text-slate-300">
                Один вход и одно подключение. Дальше расширение автоматически восстанавливает
                совместимые интеграции, подтверждает реальную видимость рекламы и показывает
                начисления в кабинете.
              </p>
            </div>
            <div className="grid gap-2">
              <MetrikaGoalLink
                goal="extension_download"
                href="/downloads/kodpauza.vsix"
                download="kodpauza.vsix"
                className="focus-ring inline-flex h-12 items-center justify-center gap-2 rounded-md bg-white px-5 text-sm font-bold text-ink transition hover:bg-slate-100"
              >
                <Download aria-hidden className="h-5 w-5" />
                Скачать расширение
              </MetrikaGoalLink>
              <a
                href={EXTENSION_MARKETPLACE_URL}
                target="_blank"
                rel="noreferrer"
                className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/20 px-4 text-sm font-semibold text-white hover:bg-white/10"
              >
                Открыть Marketplace
                <ExternalLink aria-hidden className="h-4 w-4" />
              </a>
            </div>
          </section>

          <section className="rounded-md border border-blue-200 bg-blue-50 p-5 text-blue-950">
            <h2 className="font-bold">Как обновляется расширение</h2>
            <p className="mt-2 text-sm leading-6">
              При установке из Visual Studio Marketplace VS Code получает новые версии Kodpauza
              автоматически. Установка из скачанного VSIX не подписывает редактор на обновления:
              такой пакет нужно обновлять вручную либо затем установить Kodpauza из Marketplace.
            </p>
          </section>

          <section aria-labelledby="install-steps-title">
            <h2 id="install-steps-title" className="text-2xl font-bold text-ink">
              Установка
            </h2>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {installSteps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <article
                    key={step.title}
                    className="rounded-md border border-line bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="grid h-10 w-10 place-items-center rounded-md bg-slate-100 text-ink">
                        <Icon aria-hidden className="h-5 w-5" />
                      </span>
                      <span className="text-sm font-bold text-slate-400">0{index + 1}</span>
                    </div>
                    <h3 className="mt-5 font-semibold text-ink">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{step.text}</p>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-md border border-line bg-white shadow-panel">
              <div className="border-b border-line px-5 py-4">
                <h2 className="text-lg font-bold text-ink">Первый запуск</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Все команды открываются через палитру VS Code:{' '}
                  <kbd className="rounded border border-line bg-slate-50 px-1.5 py-0.5 font-mono text-xs text-ink">
                    Cmd + Shift + P
                  </kbd>
                  .
                </p>
              </div>
              <ol className="divide-y divide-line">
                {[
                  ['Kodpauza: Войти', 'Используйте почту и пароль аккаунта разработчика.'],
                  [
                    'Kodpauza: Подключить интеграции',
                    'Автоматически подключает найденные Codex и Claude Code. Перед изменением файлов создаются резервные копии.',
                  ],
                  ['Перезапустить окно', 'Применяет подключение в текущем окне редактора.'],
                  [
                    'Отправьте запрос AI',
                    'Объявление появится внутри активного статуса Codex или Claude Code и исчезнет после ответа.',
                  ],
                ].map(([command, text], index) => (
                  <li
                    key={command}
                    className="grid gap-3 px-5 py-4 sm:grid-cols-[28px_minmax(0,1fr)]"
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-md bg-emerald-50 text-xs font-bold text-mint">
                      {index + 1}
                    </span>
                    <div>
                      <code className="text-sm font-semibold text-ink">{command}</code>
                      <p className="mt-1 text-sm leading-6 text-slate-500">{text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <aside className="grid gap-4">
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-5">
                <div className="flex items-center gap-2 font-semibold text-emerald-900">
                  <CheckCircle2 aria-hidden className="h-5 w-5" />
                  Как проверить
                </div>
                <p className="mt-3 text-sm leading-6 text-emerald-900">
                  Отправьте запрос в Codex или Claude Code и оставьте окно редактора активным пять
                  секунд. После ответа обновите кабинет разработчика.
                </p>
              </div>
              <div className="rounded-md border border-line bg-white p-5 shadow-sm">
                <div className="font-semibold text-ink">Если Codex запросит доверие</div>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  Запустите <code className="font-mono text-ink">codex</code> в терминале и
                  выполните <code className="font-mono text-ink">/hooks</code> в Codex CLI. В
                  боковой панели редактора эта команда не работает.
                </p>
              </div>
              <div className="rounded-md border border-line bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 font-semibold text-ink">
                  <ShieldCheck aria-hidden className="h-5 w-5 text-mint" />
                  Без доступа к коду
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  Расширение не читает файлы проекта, терминал, промпты, ответы ИИ или буфер обмена.
                </p>
              </div>
              <Link
                href="/docs"
                className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-slate-50"
              >
                <KeyRound aria-hidden className="h-4 w-4" />
                Открыть помощь
                <ExternalLink aria-hidden className="h-4 w-4" />
              </Link>
            </aside>
          </section>
        </div>
      </PageShell>
    </>
  );
}
