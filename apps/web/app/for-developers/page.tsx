import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Code2,
  Eye,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { JsonLd } from '@/components/json-ld';
import { PageShell } from '@/components/page-shell';
import { buildPublicMetadata } from '@/lib/seo';
import { breadcrumbJsonLd, serviceJsonLd } from '@/lib/structured-data';

const description =
  'Kodpauza помогает разработчикам монетизировать время ожидания Codex и Claude Code: реклама показывается в VS Code, а 50% стоимости подтвержденного показа начисляется на баланс.';

export const metadata: Metadata = buildPublicMetadata({
  title: 'Монетизация Codex и Claude Code для разработчиков',
  description,
  path: '/for-developers',
});

const steps = [
  ['Установите расширение', 'Скачайте Kodpauza для VS Code и войдите в подтвержденный аккаунт.'],
  ['Подключите AI-инструменты', 'Расширение находит совместимые интеграции Codex и Claude Code.'],
  ['Работайте как обычно', 'Короткое объявление появляется только пока AI готовит ответ.'],
  ['Получайте начисления', 'Подтвержденные показы и доход сразу отражаются в кабинете.'],
];

export default function ForDevelopersPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Главная', path: '/' },
            { name: 'Разработчикам', path: '/for-developers' },
          ]),
          serviceJsonLd({
            id: 'developer-monetization',
            name: 'Монетизация пауз Codex и Claude Code',
            description,
            path: '/for-developers',
            audience: 'Разработчики программного обеспечения',
          }),
        ]}
      />
      <PageShell
        eyebrow="Для разработчиков"
        title="Зарабатывайте во время ожидания Codex и Claude Code"
        description="Kodpauza встраивает короткую рекламную строку в естественную паузу AI и не меняет привычный процесс разработки."
        compact
      >
        <div className="grid gap-5">
          <section className="relative isolate overflow-hidden rounded-xl bg-ink p-5 text-white shadow-panel sm:p-6">
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_82%_20%,rgba(8,127,109,.38),transparent_28%),radial-gradient(circle_at_45%_120%,rgba(37,99,235,.28),transparent_38%)]" />
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="max-w-3xl">
                <p className="text-sm font-semibold text-emerald-300">
                  Монетизация без доступа к проекту
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight">
                  50% стоимости чистого показа — разработчику
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  Расширение не читает код, файлы, терминал, промпты или ответы AI. Оно учитывает
                  только технические условия видимости рекламного блока.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
                <Link
                  href="/install"
                  className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md bg-white px-5 text-sm font-semibold text-ink hover:bg-slate-100"
                >
                  Установить расширение <ArrowRight aria-hidden className="h-4 w-4" />
                </Link>
                <Link
                  href="/register"
                  className="focus-ring inline-flex h-11 items-center justify-center rounded-md border border-white/20 px-5 text-sm font-semibold text-white hover:bg-white/10"
                >
                  Создать аккаунт
                </Link>
              </div>
            </div>
          </section>

          <section
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            aria-label="Преимущества для разработчика"
          >
            <Metric icon={Eye} title="5 секунд" text="непрерывной видимости" />
            <Metric icon={WalletCards} title="50%" text="стоимости показа" />
            <Metric icon={BarChart3} title="В реальном времени" text="показы и начисления" />
            <Metric icon={ShieldCheck} title="Без доступа" text="к коду и запросам" />
          </section>

          <section
            className="rounded-md border border-line bg-white shadow-panel"
            aria-labelledby="developer-steps"
          >
            <div className="border-b border-line px-5 py-4">
              <h2 id="developer-steps" className="text-xl font-bold text-ink">
                Как начать зарабатывать в VS Code
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Подключение занимает четыре понятных шага.
              </p>
            </div>
            <div className="grid md:grid-cols-2 xl:grid-cols-4">
              {steps.map(([title, text], index) => (
                <article
                  key={title}
                  className="border-b border-line p-5 last:border-0 md:border-r md:[&:nth-child(even)]:border-r-0 xl:border-b-0 xl:[&:nth-child(even)]:border-r xl:last:border-r-0"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-md bg-emerald-50 text-sm font-bold text-mint">
                    {index + 1}
                  </span>
                  <h3 className="mt-3 font-semibold text-ink">{title}</h3>
                  <p className="mt-2 text-sm leading-5 text-slate-600">{text}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-md border border-line bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 font-semibold text-ink">
                <Code2 aria-hidden className="h-5 w-5 text-mint" /> Когда появляется реклама
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Объявление показывается только в активном статусе ожидания, пока Codex или Claude
                Code выполняет запрос. После ответа рекламная строка исчезает. Если окно скрыто,
                потеряло фокус или блок перекрыт, показ не засчитывается.
              </p>
            </article>
            <article className="rounded-md border border-line bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 font-semibold text-ink">
                <CheckCircle2 aria-hidden className="h-5 w-5 text-mint" /> Как формируется доход
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Разработчику начисляется половина фактической стоимости подтвержденного показа. В
                кабинете доступны баланс, график дохода, журнал событий и история выплат — отдельно
                от технических инструкций.
              </p>
            </article>
          </section>
        </div>
      </PageShell>
    </>
  );
}

function Metric({ icon: Icon, title, text }: { icon: typeof Eye; title: string; text: string }) {
  return (
    <div className="rounded-md border border-line bg-white p-4 shadow-sm">
      <Icon aria-hidden className="h-5 w-5 text-mint" />
      <p className="mt-3 font-bold text-ink">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{text}</p>
    </div>
  );
}
