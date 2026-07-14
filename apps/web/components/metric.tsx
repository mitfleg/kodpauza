import type { ReactNode } from "react";

type MetricProps = {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
};

export function Metric({ label, value, detail, icon }: MetricProps) {
  return (
    <div className="rounded-md border border-line bg-white p-5 shadow-panel">
      <div className="mb-5 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <span className="grid h-9 w-9 place-items-center rounded-md bg-slate-100 text-ink">{icon}</span>
      </div>
      <div className="text-2xl font-semibold text-ink">{value}</div>
      <p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p>
    </div>
  );
}
