import Link from 'next/link';
import { legalNav, publicFooterNav } from '@/lib/navigation';
import { SUPPORT_TELEGRAM_URL, SUPPORT_TELEGRAM_USERNAME } from '@/lib/support';

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto grid w-full max-w-[1440px] gap-4 px-4 py-6 text-sm text-slate-500 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:px-8">
        <p>© {new Date().getFullYear()} Kodpauza. Реклама в паузах разработки.</p>
        <div className="flex flex-wrap gap-x-5 gap-y-3 lg:justify-end">
          <nav className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Разделы сайта">
            {publicFooterNav.slice(1).map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-ink">
                {item.label}
              </Link>
            ))}
          </nav>
          <nav className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Правовые ссылки">
            {legalNav.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-ink">
                {item.label}
              </Link>
            ))}
          </nav>
          <a
            href={SUPPORT_TELEGRAM_URL}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-signal hover:underline"
          >
            Telegram @{SUPPORT_TELEGRAM_USERNAME}
          </a>
        </div>
      </div>
    </footer>
  );
}
