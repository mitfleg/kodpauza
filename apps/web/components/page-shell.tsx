import type { ReactNode } from "react";

type PageShellProps = {
  eyebrow?: string;
  title: string;
  description: string;
  children: ReactNode;
  aside?: ReactNode;
};

export function PageShell({ eyebrow, title, description, children, aside }: PageShellProps) {
  return (
    <div className={aside ? 'grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]' : 'grid gap-8'}>
      <section className="min-w-0">
        {eyebrow ? (
          <p className="mb-3 text-sm font-semibold text-mint">{eyebrow}</p>
        ) : null}
        <h1 className="max-w-5xl text-3xl font-bold leading-tight text-ink sm:text-4xl">{title}</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">{description}</p>
        <div className="mt-8">{children}</div>
      </section>
      {aside ? <aside className="lg:pt-24">{aside}</aside> : null}
    </div>
  );
}
