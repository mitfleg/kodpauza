import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { JsonLd } from '@/components/json-ld';
import { buildPublicMetadata } from '@/lib/seo';
import { breadcrumbJsonLd } from '@/lib/structured-data';

export const metadata: Metadata = buildPublicMetadata({
  title: 'Условия использования',
  description:
    'Условия работы Kodpauza для разработчиков и рекламодателей: модерация, подтвержденные показы, пополнение баланса и заявки на выплату.',
  path: '/terms',
});

const sections = [
  {
    title: 'Участники платформы',
    text: 'Разработчики подключают рекламные места, рекламодатели размещают кампании, администраторы проверяют соответствие правилам и обрабатывают обращения.',
  },
  {
    title: 'Модерация',
    text: 'Платформа может отклонять площадки, кампании или материалы, если они нарушают правила, ухудшают пользовательский опыт или создают финансовые риски.',
  },
  {
    title: 'Финансовые условия',
    text: 'Рекламодатель может пополнить баланс через ЮKassa. Средства зачисляются только после подтверждения платежа и расходуются на подтвержденные показы по условиям кампании. Разработчик может запросить вывод доступного вознаграждения: сумма резервируется до ручной проверки, после чего администратор подтверждает фактически выполненный внешний перевод или возвращает резерв. Автоматической банковской выплаты нет. Возвраты и коммерческие расчеты должны быть закреплены офертой, тарифами и соглашениями.',
  },
];

export default function TermsPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Главная', path: '/' },
          { name: 'Условия использования', path: '/terms' },
        ])}
      />
      <PageShell
        eyebrow="Правовая информация"
        title="Условия использования"
        description="Рабочий проект условий Kodpauza. До приема реальных платежей и выплат документ должен быть утвержден юристом."
      >
        <div className="grid gap-4">
          {sections.map((section) => (
            <section
              key={section.title}
              className="rounded-md border border-line bg-white p-5 shadow-panel"
            >
              <h2 className="text-lg font-semibold text-ink">{section.title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">{section.text}</p>
            </section>
          ))}
        </div>
      </PageShell>
    </>
  );
}
