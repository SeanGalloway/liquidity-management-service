'use client';

import 'client-only';
import { useSearchParams } from 'next/navigation';
import { formatShortDate, formatSignedWholeDollars } from '@client/lib/format';
import { calculateCashflowChips, calculateProjectedBalance } from '@client/lib/portfolio';
import { useHoldings, useTimeline } from '@client/queries';
import type { Holding, Timeline } from '@client/types';
import { HorizonSlider } from './horizon-slider';
import { TimelineChart } from './timeline-chart';

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-[13px] text-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-4 bg-accent" aria-hidden="true" />
        Actual
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-4 border-t-2 border-dashed border-accent" aria-hidden="true" />
        Projected
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full border-2 border-accent" aria-hidden="true" />
        Maturity
      </span>
    </div>
  );
}

function CashflowChips({ timeline, holdings }: { timeline: Timeline; holdings: Holding[] }) {
  const upcoming = timeline.events.filter((event) => event.date >= timeline.today);
  const chips = calculateCashflowChips(upcoming, holdings);
  if (chips.length === 0) {
    return <p className="mt-4 text-[13px] text-muted">No scheduled cashflows in this horizon.</p>;
  }

  return (
    <ul className="mt-4 flex flex-wrap gap-2" aria-label="Upcoming cashflows">
      {chips.map((chip) => (
        <li
          key={`${chip.date}-${chip.label}`}
          className="rounded-md border border-border px-2.5 py-1.5 text-[13px] whitespace-nowrap"
        >
          <span className="text-muted">{formatShortDate(chip.date)}</span> {chip.label}{' '}
          {formatSignedWholeDollars(chip.amountCents)}
        </li>
      ))}
    </ul>
  );
}

function TimelinePlot({ timeline, horizon }: { timeline: Timeline; horizon: string }) {
  if (timeline.actual.length > 1 || timeline.lastMaturity) {
    return <TimelineChart timeline={timeline} horizon={horizon} />;
  }

  return (
    <p className="rounded-md bg-subtle px-4 py-10 text-center text-sm text-muted">
      Your cash history and projected maturities appear here once you hold Treasuries.
    </p>
  );
}

function calculateDefaultHorizon(timeline: Timeline | undefined) {
  return timeline?.lastMaturity ?? timeline?.today ?? '';
}

export function CashTimeline() {
  const to = useSearchParams().get('to') ?? undefined;
  const timeline = useTimeline(to);
  const holdings = useHoldings();
  const data = timeline.data;
  const horizon = to ?? calculateDefaultHorizon(data);

  return (
    <section
      aria-label="Cash timeline"
      className="rounded-card border border-border bg-surface px-4 py-5 sm:px-6"
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Cash timeline</h2>
          <p className="mt-1 text-[13px] text-muted">
            Actual balance from the ledger · projected from scheduled maturities and coupons,
            assuming no new orders
          </p>
        </div>
        <Legend />
      </div>

      {timeline.error && <p className="text-sm text-negative">{timeline.error.message}</p>}
      {data && (
        <>
          <TimelinePlot timeline={data} horizon={horizon} />
          {data.lastMaturity && <CashflowChips timeline={data} holdings={holdings.data ?? []} />}
          {data.lastMaturity && (
            <HorizonSlider
              today={data.today}
              horizon={horizon}
              lastMaturity={data.lastMaturity}
              projectedCents={calculateProjectedBalance(data)}
            />
          )}
        </>
      )}
    </section>
  );
}
