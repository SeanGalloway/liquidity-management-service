import 'server-only';

export type IsoDate = string;

export type DateRange = { from: IsoDate; to: IsoDate };

export type SecurityKind = 'bill' | 'note' | 'bond';

export type Clock = {
  now: () => Date;
  today: () => IsoDate;
};
