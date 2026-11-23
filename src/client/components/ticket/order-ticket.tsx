'use client';

import 'client-only';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button } from '@client/components/ui/button';
import { formatDollarInput, formatInstantDate, parseDollarInput } from '@client/lib/format';
import { cn } from '@client/lib/utils';
import {
  useBalance,
  useOrder,
  usePlaceOrder,
  useQuote,
  useRefreshPortfolio,
} from '@client/queries';
import type { CreateOrderRequest, Quote } from '@client/types';
import { AmountField } from './amount-field';
import { MaturityField } from './maturity-field';
import { OrderResult } from './order-result';
import { QuoteSummary } from './quote-summary';
import { TICKET_ID, useTicket } from './ticket-context';

const QUOTE_DEBOUNCE_MS = 300;
const FACE_STEP_CENTS = 10_000;
const DEFAULT_FACE_CENTS = 10_000_000;

type Submission = { key: string; request: CreateOrderRequest };
type PlaceOrder = ReturnType<typeof usePlaceOrder>;

function parseFaceCents(text: string) {
  const cents = parseDollarInput(text);
  if (cents === null || cents < FACE_STEP_CENTS || cents % FACE_STEP_CENTS !== 0) return null;
  return cents;
}

function useOrderRequest(faceCents: number | null) {
  const { maturityDate } = useTicket();

  return useMemo(
    () => (faceCents !== null && maturityDate ? { maturityDate, faceCents } : null),
    [maturityDate, faceCents],
  );
}

function useDebouncedOrderRequest(request: CreateOrderRequest | null) {
  const [debounced, setDebounced] = useState(request);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(request), QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [request]);

  return debounced;
}

function useRefreshWhenSettled(status: string | undefined) {
  const refreshPortfolio = useRefreshPortfolio();
  const settled = status !== undefined && status !== 'pending';

  useEffect(() => {
    if (settled) void refreshPortfolio();
  }, [settled, refreshPortfolio]);
}

function chooseSubmission(previous: Submission | null, request: CreateOrderRequest) {
  const unchanged =
    previous?.request.maturityDate === request.maturityDate &&
    previous.request.faceCents === request.faceCents;
  return unchanged ? previous : { key: crypto.randomUUID(), request };
}

type QuotePanelProps = { quote: ReturnType<typeof useQuote>; current: boolean };

function QuotePanel({ quote, current }: QuotePanelProps) {
  const balance = useBalance();

  if (quote.error) {
    return (
      <p role="alert" className="rounded-md bg-negative-soft px-4 py-3 text-sm text-negative">
        {quote.error.message}
      </p>
    );
  }
  if (!quote.data) return null;

  return (
    <div className={cn('transition-opacity', !current && 'opacity-60')}>
      <QuoteSummary
        quote={quote.data.quote}
        faceCents={quote.data.request.faceCents}
        balance={balance.data}
      />
    </div>
  );
}

function SubmitControls({ placeOrder, ready }: { placeOrder: PlaceOrder; ready: boolean }) {
  const label = placeOrder.error ? 'Retry order' : 'Place order';

  return (
    <>
      {placeOrder.error && (
        <p role="alert" className="text-sm text-negative">
          Order not sent: {placeOrder.error.message}. Retrying reuses the same order key.
        </p>
      )}
      <Button type="submit" disabled={!ready || placeOrder.isPending}>
        {placeOrder.isPending ? 'Placing…' : label}
      </Button>
    </>
  );
}

function PricingNote({ quote }: { quote: Quote }) {
  return (
    <p className="text-xs leading-normal text-muted">
      Priced at the {formatInstantDate(quote.pricedAsOf)} close. Market order — fills in a few
      seconds at the latest stored close, which may differ from this estimate if new rates arrive
      first.
    </p>
  );
}

type TicketFormProps = {
  faceText: string;
  onFaceTextChange: (text: string) => void;
  placeOrder: PlaceOrder;
};

function TicketForm({ faceText, onFaceTextChange, placeOrder }: TicketFormProps) {
  const [submission, setSubmission] = useState<Submission | null>(null);
  const faceCents = parseFaceCents(faceText);
  const request = useOrderRequest(faceCents);
  const quoteRequest = useDebouncedOrderRequest(request);
  const quote = useQuote(quoteRequest);
  const current = Boolean(quote.data) && !quote.isPlaceholderData && request === quoteRequest;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!request || !current) return;

    const next = chooseSubmission(submission, request);
    setSubmission(next);
    placeOrder.mutate(next);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-[18px]" noValidate>
      <MaturityField />
      <AmountField value={faceText} invalid={faceCents === null} onChange={onFaceTextChange} />
      {request && <QuotePanel quote={quote} current={current} />}
      <SubmitControls placeOrder={placeOrder} ready={current} />
      {quote.data && <PricingNote quote={quote.data.quote} />}
    </form>
  );
}

export function OrderTicket() {
  const [faceText, setFaceText] = useState(formatDollarInput(DEFAULT_FACE_CENTS));
  const placeOrder = usePlaceOrder();
  const order = useOrder(placeOrder.data?.id ?? null);
  useRefreshWhenSettled(order.data?.status);

  return (
    <aside
      id={TICKET_ID}
      aria-label="New order"
      className="flex scroll-mt-4 flex-col gap-[18px] rounded-card border border-border bg-surface px-6 pt-5 pb-6"
    >
      <div>
        <h2 className="text-base font-semibold">New order</h2>
        <p className="mt-1 text-[13px] text-muted">Buy · secondary market · held to maturity</p>
      </div>

      {order.data ? (
        <OrderResult order={order.data} onReset={placeOrder.reset} />
      ) : (
        <TicketForm faceText={faceText} onFaceTextChange={setFaceText} placeOrder={placeOrder} />
      )}
    </aside>
  );
}
