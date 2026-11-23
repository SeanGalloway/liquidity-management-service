import { z } from 'zod';

// Primitives

export const Cents = z.number().int().meta({ description: 'Integer US cents' });
export const FaceCents = z
  .number()
  .int()
  .min(10_000)
  .multipleOf(10_000)
  .meta({ description: 'Face value in cents: $100 minimum, $100 increments', example: 75_000_000 });
export const Bps = z
  .number()
  .meta({ description: 'Basis points (may be fractional)', example: 383.2 });
export const IsoDate = z.iso.date().meta({ example: '2027-03-18' });
export const Instant = z.iso.datetime({ offset: true }).meta({ example: '2026-11-20T20:30:00Z' });
export const Uuid = z.uuid();

export const SecurityKind = z.enum(['bill', 'note', 'bond']);
export const OrderStatus = z.enum(['pending', 'executed', 'rejected', 'failed']);
export const HoldingStatus = z.enum(['active', 'matured']);
export const CashflowKind = z.enum(['coupon', 'principal']);
export const CashflowStatus = z.enum(['scheduled', 'paid']);
export const LedgerReason = z.enum(['deposit', 'buy', 'coupon', 'principal']);
export const BackfillStatus = z.enum(['idle', 'running', 'done', 'failed']);

export const ErrorResponse = z
  .object({
    error: z.object({
      code: z.string().meta({ example: 'VALIDATION_FAILED' }),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  })
  .meta({ id: 'ErrorResponse' });

function listOf<T extends z.ZodType>(item: T) {
  return z.object({ data: z.array(item) });
}

// Setup

export const SetupStatus = z
  .object({
    initialized: z.boolean(),
    yields: z.object({
      earliest: IsoDate.nullable(),
      latest: IsoDate.nullable(),
      rows: z.number().int(),
      backfill: BackfillStatus,
    }),
  })
  .meta({ id: 'SetupStatus' });

export const SetupRequest = z
  .object({ startingBalanceCents: Cents.positive().meta({ example: 1_500_000_000 }) })
  .meta({ id: 'SetupRequest' });

// Balance, ledger, cashflows, timeline

export const DateRangeQuery = z.object({
  from: IsoDate.optional(),
  to: IsoDate.optional(),
});

export const Balance = z
  .object({
    amountCents: Cents,
    updatedAt: Instant,
    pendingOrders: z.object({ count: z.number().int(), faceCents: Cents }),
  })
  .meta({ id: 'Balance' });

export const LedgerEntry = z
  .object({
    id: Uuid,
    occurredAt: Instant,
    amountCents: Cents.meta({ description: 'Signed: negative for buys' }),
    balanceAfterCents: Cents,
    reason: LedgerReason,
    ref: z.object({ type: z.enum(['order', 'cashflow']), id: Uuid }).nullable(),
  })
  .meta({ id: 'LedgerEntry' });

export const LedgerEntryList = listOf(LedgerEntry).meta({ id: 'LedgerEntryList' });

export const Cashflow = z
  .object({
    id: Uuid,
    holdingId: Uuid,
    date: IsoDate,
    kind: CashflowKind,
    amountCents: Cents,
    status: CashflowStatus,
    paidAt: Instant.nullable(),
  })
  .meta({ id: 'Cashflow' });

export const CashflowQuery = DateRangeQuery.extend({ status: CashflowStatus.optional() });
export const CashflowList = listOf(Cashflow).meta({ id: 'CashflowList' });

export const TimelineQuery = z.object({
  to: IsoDate.optional().meta({ description: 'Projection horizon; defaults to the last maturity' }),
});

const BalancePoint = z.object({ date: IsoDate, balanceCents: Cents });

export const Timeline = z
  .object({
    today: IsoDate,
    lastMaturity: IsoDate.nullable(),
    actual: z.array(BalancePoint),
    projected: z.array(BalancePoint),
    events: z.array(
      z.object({ date: IsoDate, kind: CashflowKind, holdingId: Uuid, amountCents: Cents }),
    ),
  })
  .meta({ id: 'Timeline' });

// Securities and holdings

export const Security = z
  .object({
    id: Uuid,
    cusip: z.string().nullable(),
    kind: SecurityKind,
    issueDate: IsoDate,
    maturityDate: IsoDate,
    couponRateBps: Bps.nullable().meta({ description: 'Null for bills' }),
    synthetic: z.boolean(),
  })
  .meta({ id: 'Security' });

export const Holding = z
  .object({
    id: Uuid,
    orderId: Uuid,
    security: Security,
    faceCents: Cents,
    cleanCostCents: Cents,
    accruedPaidCents: Cents,
    totalCostCents: Cents,
    purchaseYieldBps: Bps,
    purchasedAt: Instant,
    status: HoldingStatus,
    maturedAt: Instant.nullable(),
    interestToMaturityCents: Cents,
  })
  .meta({ id: 'Holding' });

export const HoldingDetail = Holding.extend({ cashflows: z.array(Cashflow) }).meta({
  id: 'HoldingDetail',
});

export const HoldingsQuery = z.object({
  status: z.enum(['active', 'matured', 'all']).default('active'),
});

export const HoldingList = listOf(Holding).meta({ id: 'HoldingList' });

// Quotes and orders

export const QuoteQuery = z.object({
  maturityDate: IsoDate,
  faceCents: z.coerce.number().pipe(FaceCents),
});

export const Quote = z
  .object({
    kind: SecurityKind,
    maturityDate: IsoDate.meta({ description: 'Business-day adjusted' }),
    days: z.number().int(),
    yieldBps: Bps,
    interpolatedFrom: z.array(z.string()).meta({ example: ['3M', '4M'] }),
    couponRateBps: Bps.nullable(),
    pricePer100: z.string().meta({ description: 'Decimal string', example: '98.7974' }),
    cleanPriceCents: Cents,
    accruedCents: Cents,
    totalCents: Cents,
    interestToMaturityCents: Cents,
    cashflows: z.array(z.object({ date: IsoDate, kind: CashflowKind, amountCents: Cents })),
    pricedAsOf: Instant,
    source: z.string().meta({ example: 'treasury.gov' }),
  })
  .meta({ id: 'Quote' });

export const IdempotencyHeaders = z.object({
  'idempotency-key': z.string().min(8).max(200).meta({ example: 'b6f0c2d4-order-1' }),
});

export const CreateOrderRequest = z
  .object({ maturityDate: IsoDate, faceCents: FaceCents })
  .meta({ id: 'CreateOrderRequest' });

export const Order = z
  .object({
    id: Uuid,
    side: z.literal('buy'),
    status: OrderStatus,
    maturityDate: IsoDate,
    faceCents: Cents,
    quote: z.object({ yieldBps: Bps, totalCents: Cents, pricedAsOf: Instant }),
    fill: z
      .object({
        executedAt: Instant,
        yieldBps: Bps,
        totalCents: Cents,
        pricedAsOf: Instant,
        holdingId: Uuid,
      })
      .nullable(),
    rejectReason: z.string().nullable().meta({ example: 'INSUFFICIENT_FUNDS' }),
    createdAt: Instant,
  })
  .meta({ id: 'Order' });

export const OrdersQuery = z.object({
  status: OrderStatus.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const OrderList = z
  .object({ data: z.array(Order), nextCursor: z.string().nullable() })
  .meta({ id: 'OrderList' });

export const IdParam = z.object({ id: Uuid });

// Market data

export const Tenor = z
  .object({ code: z.string().meta({ example: '3M' }), months: z.number(), kind: SecurityKind })
  .meta({ id: 'Tenor' });

export const TenorList = listOf(Tenor).meta({ id: 'TenorList' });

export const CurveQuery = z.object({
  date: z.union([z.literal('latest'), IsoDate]).default('latest'),
});

export const Curve = z
  .object({
    asOf: IsoDate,
    source: z.string(),
    points: z.array(z.object({ tenor: z.string(), yieldBps: Bps })),
  })
  .meta({ id: 'Curve' });

export const YieldHistoryQuery = DateRangeQuery.extend({
  tenors: z.string().meta({ description: 'Comma-separated tenor codes', example: '3M,10Y' }),
});

export const YieldHistory = z
  .object({
    series: z.array(
      z.object({
        tenor: z.string(),
        points: z.array(z.object({ date: IsoDate, yieldBps: Bps })),
      }),
    ),
  })
  .meta({ id: 'YieldHistory' });

// Ops

export const Health = z
  .object({ ok: z.boolean(), db: z.literal('up'), latestYieldAsOf: IsoDate.nullable() })
  .meta({ id: 'Health' });

export const FillOrdersResult = z
  .object({
    claimed: z.number().int(),
    executed: z.number().int(),
    rejected: z.number().int(),
    failed: z.number().int(),
  })
  .meta({ id: 'FillOrdersResult' });

export const PayCashflowsResult = z
  .object({ paid: z.number().int(), totalCents: Cents })
  .meta({ id: 'PayCashflowsResult' });

export const SkippedJob = z
  .object({ skipped: z.literal(true) })
  .meta({ id: 'SkippedJob', description: 'Another run of this job holds the lock' });

export const SyncYieldsResult = z
  .object({
    fetched: z.number().int(),
    stored: z.number().int().meta({ description: 'Rows inserted or corrected' }),
    earliest: IsoDate.nullable(),
    latest: IsoDate.nullable(),
  })
  .meta({ id: 'SyncYieldsResult' });
