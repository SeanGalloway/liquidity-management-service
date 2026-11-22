import 'server-only';
import type { Transaction } from 'kysely';
import { findBalanceForUpdate, updateBalanceAmount } from '../db/balance';
import { insertLedgerEntry, type LedgerEntry } from '../db/ledger';
import type { DB } from '../db/schema';
import { DomainError } from '../domain/errors';

export type CashMovement = {
  reason: 'deposit' | 'buy' | 'coupon' | 'principal';
  amountCents: number;
  orderId?: string;
  cashflowId?: string;
};

export function createBalanceService() {
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

  return { postLedgerEntry };
}

export type BalanceService = ReturnType<typeof createBalanceService>;
