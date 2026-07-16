import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink, LifeBuoy, MessageCircle, ShieldCheck, WalletCards } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { JsonLd } from '@/components/json-ld';
import { buildPublicMetadata } from '@/lib/seo';
import { SUPPORT_TELEGRAM_URL, SUPPORT_TELEGRAM_USERNAME } from '@/lib/support';
import { breadcrumbJsonLd } from '@/lib/structured-data';

export const metadata: Metadata = buildPublicMetadata({
  title: 'Поддержка Kodpauza',
  description:
    'Связь с поддержкой Kodpauza в Telegram: вопросы по регистрации, расширению, рекламе и ручным выплатам участникам беты.',
  path: '/support',
});

const supportDetails = [
  'Роль и email аккаунта Kodpauza',
  'ОС, редактор и версия расширения',
  'Шаг, на котором возникла проблема',
  'Текст ошибки или скриншот без секретов',
];

export default function SupportPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Главная', path: '/' },
          { name: 'Поддержка', path: '/support' },
        ])}
      />
      <PageShell
        compact
        eyebrow="Поддержка"
        title="Связаться с Kodpauza"
        description="Во время закрытой беты вопросы по аккаунту, расширению, кампаниям и выплатам разбираются вручную в Telegram."
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
          <section className="rounded-md border border-line bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-md bg-blue-50 text-signal">
                <MessageCircle aria-hidden className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold text-ink">Telegram</h2>
                <p className="mt-0.5 text-sm text-slate-500">@{SUPPORT_TELEGRAM_USERNAME}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <a
                href={SUPPORT_TELEGRAM_URL}
                target="_blank"
                rel="noreferrer"
                className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Открыть чат <ExternalLink aria-hidden className="h-4 w-4" />
              </a>
              <Link
                href="/docs"
                className="focus-ring inline-flex h-11 items-center rounded-md px-2 text-sm font-semibold text-signal hover:underline"
              >
                Ответы и инструкции
              </Link>
            </div>
            <div className="mt-6 border-t border-line pt-5">
              <h3 className="text-sm font-semibold text-ink">Что прислать для помощи</h3>
              <ul className="mt-3 grid gap-2 text-sm leading-6 text-slate-600">
                {supportDetails.map((detail) => (
                  <li key={detail} className="flex gap-2">
                    <LifeBuoy aria-hidden className="mt-1.5 h-3.5 w-3.5 shrink-0 text-mint" />
                    {detail}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <div className="grid gap-5">
            <section className="rounded-md border border-line bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 font-semibold text-ink">
                <WalletCards aria-hidden className="h-5 w-5 text-mint" />
                Данные для выплаты в бете
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Сначала создайте заявку в кабинете. Затем отправьте в личный чат email аккаунта, имя
                получателя, банк и телефон, привязанный к СБП.
              </p>
            </section>
            <section className="rounded-md border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-center gap-2 font-semibold text-amber-950">
                <ShieldCheck aria-hidden className="h-5 w-5" />
                Не присылайте секреты
              </div>
              <p className="mt-2 text-sm leading-6 text-amber-900">
                Не нужны номер карты, CVC, коды из SMS, пароли, токены, исходный код, промпты и
                ответы AI. Поддержка никогда их не запрашивает.
              </p>
            </section>
          </div>
        </div>
      </PageShell>
    </>
  );
}
