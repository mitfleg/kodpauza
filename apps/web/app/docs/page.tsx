import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeRussianRuble,
  CircleHelp,
  Code2,
  Eye,
  Megaphone,
  ShieldCheck,
} from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { JsonLd } from '@/components/json-ld';
import { buildPublicMetadata } from '@/lib/seo';
import { breadcrumbJsonLd } from '@/lib/structured-data';

export const metadata: Metadata = buildPublicMetadata({
  title: 'Как работает Kodpauza: показы, CPM и начисления',
  description:
    'Ответы о рекламе в Codex и Claude Code: условия засчитанного показа, CPM, доход разработчика, модерация, лимиты и защита от накрутки.',
  path: '/docs',
});

const questions = [
  {
    title: 'Когда засчитывается показ?',
    text: 'Когда объявление непрерывно видно не менее пяти секунд в окне редактора с фокусом, а сервер подтвердил одноразовую рекламную выдачу. Из нескольких открытых окон начисление идет только в активном.',
  },
  {
    title: 'Что означает цена за 1000 показов?',
    text: 'Это базовая ставка CPM. Для премиального формата итоговый CPM на 50% выше. Списание происходит по одному подтвержденному показу.',
  },
  {
    title: 'Почему моё объявление ещё не показывается?',
    text: 'Проверьте модерацию, баланс, бюджет и лимит показов. Среди доступных кампаний первой выбирается кампания с более высоким итоговым CPM.',
  },
  {
    title: 'Есть ли лимит начислений?',
    text: 'Да. Для одного аккаунта оплачивается не более 60 чистых показов за час и 300 за скользящие 24 часа, с интервалом не менее 10 секунд.',
  },
  {
    title: 'Читает ли расширение исходный код?',
    text: 'Нет. Расширение не получает доступ к файлам проекта, терминалу, чатам, промптам, ответам ИИ и буферу обмена.',
  },
];

export default function DocsPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Главная', path: '/' },
          { name: 'Помощь и правила', path: '/docs' },
        ])}
      />
      <PageShell
        eyebrow="Центр помощи"
        title="Ответы и инструкции по работе с kodpauza"
        description="Выберите свой сценарий: подключение VS Code, запуск рекламной кампании или контроль платформы."
      >
        <div className="grid gap-8">
          <section className="grid gap-4 md:grid-cols-2">
            <article className="rounded-md border border-line bg-white p-5 shadow-sm">
              <span className="grid h-10 w-10 place-items-center rounded-md bg-emerald-50 text-mint">
                <Code2 aria-hidden className="h-5 w-5" />
              </span>
              <h2 className="mt-5 text-lg font-semibold text-ink">Разработчику</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Скачайте расширение, войдите в аккаунт и проверьте первый засчитанный показ.
              </p>
              <Link
                href="/install"
                className="focus-ring mt-4 inline-flex items-center gap-2 rounded-md text-sm font-semibold text-signal hover:underline"
              >
                Инструкция по установке <ArrowRight aria-hidden className="h-4 w-4" />
              </Link>
            </article>
            <article className="rounded-md border border-line bg-white p-5 shadow-sm">
              <span className="grid h-10 w-10 place-items-center rounded-md bg-blue-50 text-signal">
                <Megaphone aria-hidden className="h-5 w-5" />
              </span>
              <h2 className="mt-5 text-lg font-semibold text-ink">Рекламодателю</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Создайте объявление, задайте CPM и бюджет, затем дождитесь решения модератора.
              </p>
              <Link
                href="/advertiser"
                className="focus-ring mt-4 inline-flex items-center gap-2 rounded-md text-sm font-semibold text-signal hover:underline"
              >
                Перейти к кампаниям <ArrowRight aria-hidden className="h-4 w-4" />
              </Link>
            </article>
          </section>

          <section
            id="delivery-rules"
            aria-labelledby="delivery-rules-title"
            className="scroll-mt-24"
          >
            <div className="flex items-center gap-3">
              <BadgeRussianRuble aria-hidden className="h-6 w-6 text-mint" />
              <div>
                <h2 id="delivery-rules-title" className="text-2xl font-bold text-ink">
                  Условия показа и оплаты
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Политика 1.0. Эти правила одинаковы для рекламодателя и разработчика.
                </p>
              </div>
            </div>
            <div className="mt-5 overflow-hidden rounded-md border border-line bg-white shadow-panel">
              {[
                [
                  'Где показывается',
                  'В видимом статусе ожидания Codex или Claude Code, только пока AI выполняет запрос.',
                ],
                [
                  'Засчитанный показ',
                  'Не менее 5 непрерывных секунд в окне с фокусом, не менее 80% объявления в видимой области, без скрытия или перекрытия. Переключение окна сбрасывает незавершенный интервал.',
                ],
                [
                  'Один запрос',
                  'На одну серверную выдачу можно записать только один показ. Повтор того же adId не оплачивается.',
                ],
                [
                  'Лимиты разработчика',
                  'До 60 оплачиваемых показов за час и до 300 за скользящие 24 часа. Минимальный интервал между ними - 10 секунд.',
                ],
                [
                  'Стандартный CPM',
                  'Рекламодатель платит указанный CPM. 50% стоимости чистого показа с округлением вниз начисляется разработчику, остаток остается платформе.',
                ],
                [
                  'Премиальный CPM',
                  'К базовому CPM добавляется 50%. Объявление получает выделенную рамку, а итоговый CPM участвует в ранжировании и расчете вознаграждения.',
                ],
                [
                  'Очередь кампаний',
                  'Сначала выбирается доступная кампания с самым высоким итоговым CPM, затем более ранняя кампания при равной ставке.',
                ],
                [
                  'Когда денег не списывают',
                  'Скрытый, короткий, повторный или подозрительный показ не оплачивается рекламодателем и не начисляется разработчику.',
                ],
                [
                  'Остановка кампании',
                  'Выдача прекращается при паузе, исчерпании бюджета, баланса или заданного рекламодателем лимита показов.',
                ],
              ].map(([term, definition]) => (
                <div
                  key={term}
                  className="grid gap-2 border-b border-line px-5 py-4 last:border-b-0 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8"
                >
                  <h3 className="font-semibold text-ink">{term}</h3>
                  <p className="text-sm leading-6 text-slate-600">{definition}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Денежные суммы хранятся в копейках. Стоимость одного показа и вознаграждение
              округляются вниз до целой копейки.
            </p>
          </section>

          <section aria-labelledby="faq-title">
            <div className="flex items-center gap-3">
              <CircleHelp aria-hidden className="h-6 w-6 text-mint" />
              <h2 id="faq-title" className="text-2xl font-bold text-ink">
                Частые вопросы
              </h2>
            </div>
            <div className="mt-5 divide-y divide-line rounded-md border border-line bg-white shadow-panel">
              {questions.map((question) => (
                <article
                  key={question.title}
                  className="grid gap-2 px-5 py-5 md:grid-cols-[260px_minmax(0,1fr)] md:gap-8"
                >
                  <h3 className="font-semibold text-ink">{question.title}</h3>
                  <p className="text-sm leading-6 text-slate-600">{question.text}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="grid gap-4 border-t border-line pt-8 sm:grid-cols-3">
            <div className="flex gap-3">
              <Eye aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-mint" />
              <div>
                <p className="font-semibold text-ink">Показ</p>
                <p className="mt-1 text-sm leading-5 text-slate-500">
                  Не менее пяти секунд видимости.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <BadgeRussianRuble aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-mint" />
              <div>
                <p className="font-semibold text-ink">Начисление</p>
                <p className="mt-1 text-sm leading-5 text-slate-500">
                  50% стоимости чистого показа разработчику.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <ShieldCheck aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-mint" />
              <div>
                <p className="font-semibold text-ink">Проверка</p>
                <p className="mt-1 text-sm leading-5 text-slate-500">
                  Повторы и подозрительные события не оплачиваются.
                </p>
              </div>
            </div>
          </section>
        </div>
      </PageShell>
    </>
  );
}
