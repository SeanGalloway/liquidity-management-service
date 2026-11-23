'use client';

import 'client-only';
import { Input } from '@client/components/ui/input';
import { Label } from '@client/components/ui/label';
import { addDays, addMonths, calculateTodayInNewYork } from '@client/lib/dates';
import { cn } from '@client/lib/utils';
import { useTicket } from './ticket-context';

const TENOR_SHORTCUTS = [
  { code: '1M', months: 1 },
  { code: '3M', months: 3 },
  { code: '6M', months: 6 },
  { code: '1Y', months: 12 },
  { code: '2Y', months: 24 },
  { code: '5Y', months: 60 },
  { code: '10Y', months: 120 },
];

export function MaturityField() {
  const { maturityDate, setMaturityDate } = useTicket();
  const today = calculateTodayInNewYork();

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="ticket-maturity">Maturity date</Label>
      <Input
        id="ticket-maturity"
        type="date"
        required
        min={addDays(today, 2)}
        max={addMonths(today, 360)}
        value={maturityDate}
        onChange={(event) => setMaturityDate(event.target.value)}
      />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tenor shortcuts">
        {TENOR_SHORTCUTS.map(({ code, months }) => {
          const date = addMonths(today, months);
          const selected = date === maturityDate;

          return (
            <button
              key={code}
              type="button"
              aria-pressed={selected}
              aria-label={`${code} from today`}
              onClick={() => setMaturityDate(date)}
              className={cn(
                'h-9 min-w-11 rounded-md border border-[#d5dae1] bg-surface px-2.5 text-[13px] font-medium pointer-coarse:h-11',
                'hover:border-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                selected && 'border-accent bg-accent-soft text-accent',
              )}
            >
              {code}
            </button>
          );
        })}
      </div>
    </div>
  );
}
