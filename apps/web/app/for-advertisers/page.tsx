import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Code2,
  Gauge,
  Megaphone,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import { JsonLd } from '@/components/json-ld';
import { PageShell } from '@/components/page-shell';
import { buildPublicMetadata } from '@/lib/seo';
import { breadcrumbJsonLd, serviceJsonLd } from '@/lib/structured-data';

const description =
  'Реклама для разработчиков внутри Codex и Claude Code: нативный формат во время ожидания AI, настройка CPM и бюджета, модерация и прозрачные метрики кампании.';

export const metadata: Metadata = buildPublicMetadata({
  title: 'Реклама для разработчиков в Codex и Claude Code',
  description,
  path: '/for-advertisers',
});

const campaignSteps = [
  ['Создайте объявление', 'Добавьте короткий текст, целевую ссылку и выберите формат размещения.'],
  ['Задайте экономику', 'Укажите CPM, бюджет и при необходимости общий лимит показов.'],
  ['Пройдите модерацию', 'Администратор проверит содержание и соответствие целевой страницы.'],
  ['Следите за результатом', 'Показы, клики, CTR и расход доступны по каждой кампании.'],
];

export default function ForAdvertisersPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Главная', path: '/' },
            { name: 'Рекламодателям', path: '/for-advertisers' },
          ]),
          serviceJsonLd({
            id: 'developer-audience-advertising',
            name: 'Реклама для аудитории разработчиков',
            description,
            path: '/for-advertisers',
            audience: 'Рекламодатели технологических продуктов и сервисов',
          }),
        ]}
      />
      <PageShell
        eyebrow="Для рекламодателей"
        title="Показывайте рекламу разработчикам в момент ожидания AI"
        description="Нативное размещение внутри рабочего процесса Codex и Claude Code с управляемым бюджетом и прозрачными результатами."
        compact
      >
        <div className="grid gap-5">
          <section className="relative isolate overflow-hidden rounded-xl bg-ink p-5 text-white shadow-panel sm:p-6">
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_78%_15%,rgba(37,99,235,.42),transparent_28%),radial-gradient(circle_at_48%_120%,rgba(8,127,109,.3),transparent_38%)]" />
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="max-w-3xl">
                <p className="text-sm font-semibold text-blue-300">
                  Техническая аудитория без отвлекающего баннера
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight">
                  Объявление встроено в естественную паузу разработки
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  Реклама появляется, когда разработчик уже ждёт ответ AI. Она не перекрывает код и
                  учитывается только после подтвержденной видимости.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
                <Link
                  href="/register"
                  className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md bg-white px-5 text-sm font-semibold text-ink hover:bg-slate-100"
                >
                  Создать кампанию <ArrowRight aria-hidden className="h-4 w-4" />
                </Link>
                <Link
                  href="/docs#delivery-rules"
                  className="focus-ring inline-flex h-11 items-center justify-center rounded-md border border-white/20 px-5 text-sm font-semibold text-white hover:bg-white/10"
                >
                  Правила показа
                </Link>
              </div>
            </div>
          </section>

          <section
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            aria-label="Преимущества рекламы"
          >
            <Metric icon={UsersRound} title="Разработчики" text="целевая техническая аудитория" />
            <Metric icon={Gauge} title="CPM и бюджет" text="управление расходом кампании" />
            <Metric icon={BarChart3} title="Показы и CTR" text="метрики по объявлениям" />
            <Metric
              icon={ShieldCheck}
              title="Чистые события"
              text="проверка видимости и повторов"
            />
          </section>

          <section
            className="rounded-md border border-line bg-white shadow-panel"
            aria-labelledby="advertiser-steps"
          >
            <div className="border-b border-line px-5 py-4">
              <h2 id="advertiser-steps" className="text-xl font-bold text-ink">
                Как запустить рекламу для разработчиков
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Кампания запускается после модерации и пополнения баланса.
              </p>
            </div>
            <div className="grid md:grid-cols-2 xl:grid-cols-4">
              {campaignSteps.map(([title, text], index) => (
                <article
                  key={title}
                  className="border-b border-line p-5 last:border-0 md:border-r md:[&:nth-child(even)]:border-r-0 xl:border-b-0 xl:[&:nth-child(even)]:border-r xl:last:border-r-0"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-md bg-blue-50 text-sm font-bold text-signal">
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
                <Megaphone aria-hidden className="h-5 w-5 text-signal" /> Стандартный и премиальный
                формат
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Стандартное объявление выглядит как спокойная нативная строка. Премиальное получает
                дополнительный визуальный акцент и повышающий коэффициент к CPM. Оба формата
                остаются частью интерфейса ожидания.
              </p>
            </article>
            <article className="rounded-md border border-line bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 font-semibold text-ink">
                <CheckCircle2 aria-hidden className="h-5 w-5 text-mint" /> Оплата только
                подтвержденных показов
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Скрытые, короткие, повторные и подозрительные события не списывают бюджет. Вы видите
                расход, остаток, показы, клики и CTR в отдельном кабинете рекламодателя.
              </p>
            </article>
          </section>
        </div>
      </PageShell>
    </>
  );
}

function Metric({ icon: Icon, title, text }: { icon: typeof Code2; title: string; text: string }) {
  return (
    <div className="rounded-md border border-line bg-white p-4 shadow-sm">
      <Icon aria-hidden className="h-5 w-5 text-signal" />
      <p className="mt-3 font-bold text-ink">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{text}</p>
    </div>
  );
}
