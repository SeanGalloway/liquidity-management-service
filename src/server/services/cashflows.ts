import 'server-only';
import {
  findCashflows,
  findNextDueCashflowForUpdate,
  markCashflowPaid,
  type CashflowsFilter,
  type ScheduledCashflow,
} from '../db/cashflows';
import type { Database } from '../db/client';
import { markHoldingMatured } from '../db/holdings';
import { withTransaction } from '../db/transaction';
import { rejectInvertedRange } from '../domain/dates';
import type { Clock } from '../domain/types';
import type { BalanceService } from './balance';

const PAYMENT_BATCH_LIMIT = 500;

export type PaymentSummary = { paid: number; totalCents: number };

type Dependencies = { db: Database; clock: Clock; balance: BalanceService };

export function createCashflowsService({ db, clock, balance }: Dependencies) {
  async function payDueCashflows(): Promise<PaymentSummary> {
    const summary: PaymentSummary = { paid: 0, totalCents: 0 };

    for (let attempt = 0; attempt < PAYMENT_BATCH_LIMIT; attempt++) {
      const paid = await payNextDueCashflow();
      if (!paid) break;

      summary.paid += 1;
      summary.totalCents += paid.amountCents;
    }

    return summary;
  }

  function payNextDueCashflow(): Promise<ScheduledCashflow | undefined> {
    return withTransaction(db, async (trx) => {
      const cashflow = await findNextDueCashflowForUpdate(clock.today(), trx);
      if (!cashflow) return undefined;

      await balance.postLedgerEntry(
        { reason: cashflow.kind, amountCents: cashflow.amountCents, cashflowId: cashflow.id },
        trx,
      );

      const paid = await markCashflowPaid(cashflow.id, trx);
      if (cashflow.kind === 'principal') await markHoldingMatured(cashflow.holdingId, trx);

      return paid;
    });
  }

  async function listCashflows(filter: CashflowsFilter): Promise<ScheduledCashflow[]> {
    rejectInvertedRange(filter.range?.from, filter.range?.to);
    return findCashflows(filter, db);
  }

  return { payDueCashflows, payNextDueCashflow, listCashflows };
}

export type CashflowsService = ReturnType<typeof createCashflowsService>;
