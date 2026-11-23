import 'server-only';
import type Decimal from 'decimal.js';
import type { z } from 'zod';
import type {
  CashflowKind as CashflowKindSchema,
  CashflowStatus as CashflowStatusSchema,
  HoldingStatus as HoldingStatusSchema,
  LedgerReason as LedgerReasonSchema,
  OrderStatus as OrderStatusSchema,
  SecurityKind as SecurityKindSchema,
} from '@shared/contracts';

export type IsoDate = string;

export type DateRange = { from: IsoDate; to: IsoDate };

export type SecurityKind = z.infer<typeof SecurityKindSchema>;

export type OrderStatus = z.infer<typeof OrderStatusSchema>;
export type HoldingStatus = z.infer<typeof HoldingStatusSchema>;
export type LedgerReason = z.infer<typeof LedgerReasonSchema>;
export type CashflowKind = z.infer<typeof CashflowKindSchema>;
export type CashflowStatus = z.infer<typeof CashflowStatusSchema>;

export type Clock = {
  now: () => Date;
  today: () => IsoDate;
};

export type CurvePointValue = { tenorCode: string; months: number; yieldBps: Decimal };

export type Curve = {
  asOfDate: IsoDate;
  observedAt: Date;
  source: string;
  points: CurvePointValue[];
};

export type SecuritySpec = {
  kind: SecurityKind;
  cusip: string | null;
  issueDate: IsoDate;
  maturityDate: IsoDate;
  couponRateBps: Decimal | null;
  synthetic: boolean;
};
