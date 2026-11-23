'use client';

import 'client-only';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Slider } from '@client/components/ui/slider';
import { addDays, calculateDaysBetween } from '@client/lib/dates';
import { formatDate, formatWholeDollars } from '@client/lib/format';

const MIN_HORIZON_DAYS = 30;

type HorizonSliderProps = {
  today: string;
  horizon: string;
  lastMaturity: string;
  projectedCents: number;
};

export function HorizonSlider({
  today,
  horizon,
  lastMaturity,
  projectedCents,
}: HorizonSliderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const maxDays = calculateDaysBetween(today, lastMaturity);
  const [days, setDays] = useState(() => calculateDaysBetween(today, horizon));
  const shownDate = addDays(today, days);

  function commit(value: number) {
    const to = addDays(today, value);
    router.replace(to === lastMaturity ? pathname : `${pathname}?to=${to}`, { scroll: false });
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-divider pt-4">
      <span id="horizon-label" className="text-[13px] font-semibold">
        Projection horizon
      </span>
      <Slider
        aria-labelledby="horizon-label"
        aria-valuetext={formatDate(shownDate)}
        min={Math.min(MIN_HORIZON_DAYS, maxDays)}
        max={maxDays}
        step={1}
        value={[days]}
        onValueChange={([value]) => setDays(value ?? days)}
        onValueCommit={([value]) => commit(value ?? days)}
        className="min-h-11 flex-[1_1_240px]"
      />
      <span className="text-[13px] text-muted">
        Through <strong className="text-ink">{formatDate(shownDate)}</strong> · projected cash{' '}
        <strong className="text-ink">{formatWholeDollars(projectedCents)}</strong> · last maturity{' '}
        {formatDate(lastMaturity)}
      </span>
    </div>
  );
}
