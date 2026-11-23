'use client';

import 'client-only';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@client/components/ui/button';
import { Input } from '@client/components/ui/input';
import { Label } from '@client/components/ui/label';
import { Wordmark } from '@client/components/layout/wordmark';
import { formatDollarInput, parseDollarInput } from '@client/lib/format';
import { useInitializeDesk, useSetupStatus } from '@client/queries';
import { BackfillProgress } from './backfill-progress';

const DEFAULT_BALANCE_CENTS = 1_500_000_000;

function BalanceForm() {
  const [text, setText] = useState(formatDollarInput(DEFAULT_BALANCE_CENTS));
  const initialize = useInitializeDesk();
  const cents = parseDollarInput(text);
  const invalid = cents === null || cents <= 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!invalid) initialize.mutate(cents);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="starting-balance">Starting balance</Label>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[15px] text-muted">
            $
          </span>
          <Input
            id="starting-balance"
            inputMode="decimal"
            autoComplete="off"
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-invalid={invalid}
            aria-describedby="starting-balance-hint"
            className="pl-7"
          />
        </div>
        <span id="starting-balance-hint" className="text-xs text-muted">
          Cash available to buy Treasuries, posted once as the opening deposit.
        </span>
      </div>

      {initialize.error && (
        <p role="alert" className="text-sm text-negative">
          {initialize.error.message}
        </p>
      )}

      <Button type="submit" disabled={invalid || initialize.isPending}>
        {initialize.isPending ? 'Setting up…' : 'Set up desk'}
      </Button>
    </form>
  );
}

export function SetupWizard() {
  const router = useRouter();
  const { data: status, error } = useSetupStatus();
  const ready = status?.initialized && status.yields.backfill === 'done';

  useEffect(() => {
    if (ready) router.replace('/portfolio');
  }, [ready, router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-8 px-4 py-12 sm:px-6">
      <Wordmark />
      <section className="rounded-card border border-border bg-surface p-6 sm:p-8">
        <h1 className="text-xl font-semibold">Set up your desk</h1>
        <p className="mt-1.5 mb-6 text-sm text-muted">
          Enter the cash you start with. We then load a year of daily Treasury par yields so quotes
          and the research curve have history.
        </p>

        {error && (
          <p role="alert" className="text-sm text-negative">
            Could not reach the API: {error.message}
          </p>
        )}
        {status && !status.initialized && <BalanceForm />}
        {status?.initialized && <BackfillProgress yields={status.yields} />}
      </section>
    </main>
  );
}
