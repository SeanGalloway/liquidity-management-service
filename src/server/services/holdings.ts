import 'server-only';
import { findCashflowsForHolding, type ScheduledCashflow } from '../db/cashflows';
import type { Database } from '../db/client';
import {
  findHoldingsWithSecurity,
  findHoldingWithSecurity,
  type HoldingStatusFilter,
  type HoldingWithSecurity,
} from '../db/holdings';
import { DomainError } from '../domain/errors';

export type HoldingDetail = { holding: HoldingWithSecurity; cashflows: ScheduledCashflow[] };

export function createHoldingsService({ db }: { db: Database }) {
  function listHoldings(status: HoldingStatusFilter): Promise<HoldingWithSecurity[]> {
    return findHoldingsWithSecurity(status, db);
  }

  async function getHolding(id: string): Promise<HoldingDetail> {
    const holding = await findHoldingWithSecurity(id, db);
    if (!holding) throw new DomainError('NOT_FOUND', `Holding ${id} not found`);

    const cashflows = await findCashflowsForHolding(id, db);

    return { holding, cashflows };
  }

  return { listHoldings, getHolding };
}

export type HoldingsService = ReturnType<typeof createHoldingsService>;
