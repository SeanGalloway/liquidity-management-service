import 'server-only';
import type { Transaction } from 'kysely';
import {
  findBalance,
  findBalanceForUpdate,
  updateBalanceAmount,
  type Balance,
} from '../db/balance';
import type { Database } from '../db/client';
import { findLedgerEntries, insertLedgerEntry, type LedgerEntry } from '../db/ledger';
import { findPendingOrderTotals, type PendingOrderTotals } from '../db/orders';
import type { DB } from '../db/schema';
import { addDays, toNewYorkInstant } from '../domain/dates';
import { DomainError } from '../domain/errors';
import type { DateRange } from '../domain/types';

export type CashMovement = {
  reason: 'deposit' | 'buy' | 'coupon' | 'principal';
  amountCents: number;
  orderId?: string;
  cashflowId?: string;
};

export type BalanceSummary = { balance: Balance; pendingOrders: PendingOrderTotals };

export function createBalanceService({ db }: { db: Database }) {
  async function postLedgerEntry(
    movement: CashMovement,
    trx: Transaction<DB>,
  ): Promise<LedgerEntry> {
    const balance = await findBalanceForUpdate(trx);
    const balanceAfterCents = balance.amountCents + movement.amountCents;

    if (balanceAfterCents < 0) {
      throw new DomainError('INSUFFICIENT_FUNDS', 'Cash balance would go negative', {
        balanceCents: balance.amountCents,
        requiredCents: -movement.amountCents,
      });
    }

    const entry = await insertLedgerEntry({ ...movement, balanceAfterCents }, trx);
    await updateBalanceAmount(balanceAfterCents, trx);

    return entry;
  }

  async function getBalance(): Promise<BalanceSummary> {
    const balance = await findBalance(db);
    if (!balance) throw new DomainError('NOT_INITIALIZED', 'Run setup first');

    const pendingOrders = await findPendingOrderTotals(db);

    return { balance, pendingOrders };
  }

  function listBalanceHistory(range: Partial<DateRange>): Promise<LedgerEntry[]> {
    return findLedgerEntries(
      {
        from: range.from ? startOfMarketDay(range.from) : undefined,
        before: range.to ? startOfMarketDay(addDays(range.to, 1)) : undefined,
      },
      db,
    );
  }

  return { postLedgerEntry, getBalance, listBalanceHistory };
}

export type BalanceService = ReturnType<typeof createBalanceService>;

function startOfMarketDay(date: string): Date {
  return toNewYorkInstant(date, '00:00:00');
}
