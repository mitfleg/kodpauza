import Link from 'next/link';
import {
  ArrowRight,
  BadgeRussianRuble,
  CheckCircle2,
  Code2,
  Eye,
  Megaphone,
  ShieldCheck,
  TimerReset,
} from 'lucide-react';
import { HomeActions } from '@/components/home-actions';

const workflow = [
  {
    number: '01',
    title: 'Рекламодатель запускает кампанию',
    text: 'Задаёт объявление, цену за 1000 показов, бюджет и лимит.',
  },
  {
    number: '02',
    title: 'Администратор проверяет объявление',
    text: 'После модерации кампания участвует в выдаче на выбранном месте показа.',
  },
  {
    number: '03',
    title: 'Разработчик получает начисление',
    text: 'Показ учитывается после пяти секунд видимости в активном окне VS Code.',
  },
];

export default function HomePage() {
  return (
    <div className="grid gap-12 lg:gap-16">
      <section className="grid items-center gap-8 border-b border-line pb-12 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.8fr)] lg:gap-14">
        <div>
          <p className="text-sm font-semibold text-mint">Реклама для инструментов разработчика</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight text-ink sm:text-5xl">kodpauza</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
            Показывайте короткое объявление в естественной паузе работы и распределяйте доход между платформой и разработчиком расширения.
          </p>
          <div className="mt-7">
            <HomeActions />
          </div>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
            <span className="inline-flex items-center gap-2"><CheckCircle2 aria-hidden className="h-4 w-4 text-mint" />Модерация кампаний</span>
            <span className="inline-flex items-center gap-2"><CheckCircle2 aria-hidden className="h-4 w-4 text-mint" />Подписанные события</span>
            <span className="inline-flex items-center gap-2"><CheckCircle2 aria-hidden className="h-4 w-4 text-mint" />Прозрачные начисления</span>
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-slate-700 bg-ink shadow-panel" aria-label="Пример объявления в VS Code">
          <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3 text-xs text-slate-400">
            <span>Visual Studio Code</span>
            <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400" />Подключено</span>
          </div>
          <div className="min-h-56 px-5 py-6 sm:px-6">
            <div className="h-2 w-2/3 rounded bg-slate-700" />
            <div className="mt-3 h-2 w-4/5 rounded bg-slate-800" />
            <div className="mt-3 h-2 w-1/2 rounded bg-slate-800" />
            <div className="mt-12 rounded-md border border-slate-700 bg-slate-900 px-4 py-4">
              <p className="text-xs font-medium text-slate-400">Ожидание ответа</p>
              <p className="mt-2 flex items-start gap-2 text-sm font-semibold leading-6 text-white">
                <Megaphone aria-hidden className="mt-1 h-4 w-4 shrink-0 text-emerald-400" />
                Серверы для разработки с быстрым стартом
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between bg-mint px-4 py-2 text-xs font-medium text-white">
            <span className="inline-flex items-center gap-2"><Code2 aria-hidden className="h-4 w-4" />kodpauza</span>
            <span>показ после 5 секунд</span>
          </div>
        </div>
      </section>

      <section aria-labelledby="workflow-title">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold text-mint">Как работает платформа</p>
          <h2 id="workflow-title" className="mt-3 text-3xl font-bold text-ink">Один понятный путь от кампании до начисления</h2>
        </div>
        <div className="mt-7 grid gap-4 md:grid-cols-3">
          {workflow.map((item) => (
            <article key={item.number} className="border-t-2 border-ink bg-white px-5 py-6 shadow-sm">
              <p className="text-sm font-bold text-mint">{item.number}</p>
              <h3 className="mt-4 text-lg font-semibold text-ink">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-md border border-line bg-white p-6 shadow-panel">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-emerald-50 text-mint"><Code2 aria-hidden className="h-5 w-5" /></div>
          <h2 className="mt-5 text-2xl font-bold text-ink">Для разработчика</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">Установите расширение, включите показы и следите за событиями и начислениями в одном кабинете.</p>
          <Link href="/install" className="focus-ring mt-5 inline-flex items-center gap-2 rounded-md text-sm font-semibold text-signal hover:underline">
            Установить расширение <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
        </article>
        <article className="rounded-md border border-line bg-white p-6 shadow-panel">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-blue-50 text-signal"><Megaphone aria-hidden className="h-5 w-5" /></div>
          <h2 className="mt-5 text-2xl font-bold text-ink">Для рекламодателя</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">Запускайте объявления для технической аудитории, управляйте бюджетом и контролируйте каждый засчитанный показ.</p>
          <Link href="/advertiser" className="focus-ring mt-5 inline-flex items-center gap-2 rounded-md text-sm font-semibold text-signal hover:underline">
            Перейти к кампаниям <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
        </article>
      </section>

      <section className="grid gap-4 border-t border-line pt-10 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [Eye, '5 секунд', 'Минимальная видимость для зачёта показа'],
          [BadgeRussianRuble, '50%', 'Доля разработчика от стоимости показа'],
          [ShieldCheck, 'Защита', 'Подпись событий и проверка повторов'],
          [TimerReset, 'Очередь', 'Повторная отправка при временном сбое сети'],
        ].map(([Icon, value, detail]) => {
          const ItemIcon = Icon as typeof Eye;
          return (
            <div key={String(value)} className="flex gap-3">
              <ItemIcon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-mint" />
              <div><p className="font-semibold text-ink">{String(value)}</p><p className="mt-1 text-sm leading-5 text-slate-500">{String(detail)}</p></div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
