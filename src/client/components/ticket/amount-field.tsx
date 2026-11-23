'use client';

import 'client-only';
import { Input } from '@client/components/ui/input';
import { Label } from '@client/components/ui/label';
import { FACE_INPUT_ID } from './ticket-context';

type AmountFieldProps = {
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
};

export function AmountField({ value, invalid, onChange }: AmountFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={FACE_INPUT_ID}>Face amount</Label>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[15px] text-muted">
          $
        </span>
        <Input
          id={FACE_INPUT_ID}
          inputMode="numeric"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid}
          aria-describedby="ticket-face-hint"
          className="pl-7"
        />
      </div>
      <span
        id="ticket-face-hint"
        className={invalid ? 'text-xs text-negative' : 'text-xs text-muted'}
      >
        $100 minimum, in $100 increments
      </span>
    </div>
  );
}
