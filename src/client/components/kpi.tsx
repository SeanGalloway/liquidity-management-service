import type { ReactNode } from 'react';

export function KpiGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section
      aria-label={label}
      className="flex flex-wrap gap-px overflow-hidden rounded-card border border-border bg-border"
    >
      {children}
    </section>
  );
}

type KpiTileProps = { label: string; value: ReactNode; detail?: ReactNode; valueClass?: string };

export function KpiTile({ label, value, detail, valueClass }: KpiTileProps) {
  return (
    <div className="min-w-0 flex-[1_1_200px] bg-surface px-5 py-4">
      <div className="text-xs font-semibold tracking-[0.04em] text-muted uppercase">{label}</div>
      <div className={`mt-1.5 text-2xl font-bold tracking-tight ${valueClass ?? ''}`}>{value}</div>
      {detail && <div className="mt-1 text-[13px] text-muted">{detail}</div>}
    </div>
  );
}
