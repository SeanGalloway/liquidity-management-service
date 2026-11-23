'use client';

import 'client-only';
import { useState } from 'react';
import { useTicket } from '@client/components/ticket/ticket-context';
import {
  calculateCompareDate,
  COMPARE_OPTIONS,
  type CompareKey,
  type TenorRow,
} from '@client/lib/curve';
import { addMonths, calculateTodayInNewYork } from '@client/lib/dates';
import { formatDate } from '@client/lib/format';
import { cn } from '@client/lib/utils';
import { useCurve } from '@client/queries';
import type { Curve } from '@client/types';
import { calculateCurvePoints, YieldCurveChart } from './yield-curve-chart';

function CompareChips({
  value,
  onChange,
}: {
  value: CompareKey;
  onChange: (key: CompareKey) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Compare with">
      <span className="text-[13px] text-muted">Compare with</span>
      {COMPARE_OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={option.key === value}
          onClick={() => onChange(option.key)}
          className={cn(
            'h-9 rounded-md border border-[#d5dae1] bg-surface px-2.5 text-[13px] font-medium pointer-coarse:h-11',
            'hover:border-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
            option.key === value && 'border-accent bg-accent-soft text-accent',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Legend({ curve, compare }: { curve: Curve; compare: Curve | undefined }) {
  return (
    <div className="mt-3 flex flex-wrap gap-4 text-[13px] text-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-4 bg-accent" aria-hidden="true" />
        {formatDate(curve.asOf)}
      </span>
      {compare && (
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-faint" aria-hidden="true" />
          {formatDate(compare.asOf)}
        </span>
      )}
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 border border-border bg-[#f2f5fa]" aria-hidden="true" />
        Bills — orderable as zero-coupon
      </span>
    </div>
  );
}

export function CurveCard({ curve, rows }: { curve: Curve; rows: TenorRow[] }) {
  const [compareKey, setCompareKey] = useState<CompareKey>('1M');
  const compare = useCurve(calculateCompareDate(curve.asOf, compareKey));
  const compareData = compareKey === 'none' ? undefined : compare.data;
  const compareLabel = COMPARE_OPTIONS.find((option) => option.key === compareKey)?.label ?? null;
  const { prefillMaturity } = useTicket();

  return (
    <section
      aria-label="Yield curve"
      className="rounded-card border border-border bg-surface px-4 pt-5 pb-6 sm:px-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">U.S. Treasury par yield curve</h2>
          <p className="mt-1 text-[13px] text-muted">
            Click any point to start an order at that maturity
          </p>
        </div>
        <CompareChips value={compareKey} onChange={setCompareKey} />
      </div>
      <Legend curve={curve} compare={compareData} />
      <div className="mt-5">
        <YieldCurveChart
          points={calculateCurvePoints(rows, compareData)}
          compareLabel={compareLabel}
          onPick={(point) => prefillMaturity(addMonths(calculateTodayInNewYork(), point.months))}
        />
      </div>
    </section>
  );
}
