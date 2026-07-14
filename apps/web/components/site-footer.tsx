import Link from "next/link";
import { legalNav } from "@/lib/navigation";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 py-6 text-sm text-slate-500 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <p>© {new Date().getFullYear()} kodpauza. Реклама в паузах разработки.</p>
        <nav className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Правовые ссылки">
          {legalNav.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-ink">
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
