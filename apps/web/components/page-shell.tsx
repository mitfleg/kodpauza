import type { ReactNode } from "react";

type PageShellProps = {
  eyebrow?: string;
  title: string;
  description: string;
  children: ReactNode;
  aside?: ReactNode;
  compact?: boolean;
};

export function PageShell({ eyebrow, title, description, children, aside, compact = false }: PageShellProps) {
  return (
    <div className={aside ? `grid ${compact ? 'gap-5' : 'gap-8'} lg:grid-cols-[minmax(0,1fr)_340px]` : `grid ${compact ? 'gap-5' : 'gap-8'}`}>
      <section className="min-w-0">
        {eyebrow ? (
          <p className={`${compact ? 'mb-2' : 'mb-3'} text-sm font-semibold text-mint`}>{eyebrow}</p>
        ) : null}
        <h1 className={`max-w-5xl font-bold leading-tight text-ink ${compact ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl'}`}>{title}</h1>
        <p className={`${compact ? 'mt-2 text-sm leading-6' : 'mt-4 text-base leading-7'} max-w-3xl text-slate-600`}>{description}</p>
        <div className={compact ? 'mt-5' : 'mt-8'}>{children}</div>
      </section>
      {aside ? <aside className={compact ? 'lg:pt-16' : 'lg:pt-24'}>{aside}</aside> : null}
    </div>
  );
}
