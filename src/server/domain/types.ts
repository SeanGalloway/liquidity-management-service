import 'server-only';
import type Decimal from 'decimal.js';

export type IsoDate = string;

export type DateRange = { from: IsoDate; to: IsoDate };

export type SecurityKind = 'bill' | 'note' | 'bond';

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
