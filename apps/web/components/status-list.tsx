import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";

type StatusListProps = {
  title: string;
  items: Array<{
    title: string;
    detail: string;
    icon?: ReactNode;
  }>;
};

export function StatusList({ title, items }: StatusListProps) {
  return (
    <section className="rounded-md border border-line bg-white p-5 shadow-panel">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-5 grid gap-4">
        {items.map((item) => (
          <div key={item.title} className="flex gap-3">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-emerald-50 text-mint">
              {item.icon ?? <CheckCircle2 aria-hidden className="h-4 w-4" />}
            </span>
            <div>
              <h3 className="font-medium text-ink">{item.title}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
