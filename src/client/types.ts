import type { z } from 'zod';
import type * as Contracts from '@shared/contracts';

export type SetupStatus = z.output<typeof Contracts.SetupStatus>;
export type Balance = z.output<typeof Contracts.Balance>;
export type Timeline = z.output<typeof Contracts.Timeline>;
export type TimelineEvent = Timeline['events'][number];
export type Holding = z.output<typeof Contracts.Holding>;
export type Quote = z.output<typeof Contracts.Quote>;
export type Order = z.output<typeof Contracts.Order>;
export type OrderList = z.output<typeof Contracts.OrderList>;
export type CreateOrderRequest = z.output<typeof Contracts.CreateOrderRequest>;
export type Tenor = z.output<typeof Contracts.Tenor>;
export type Curve = z.output<typeof Contracts.Curve>;
export type YieldSeries = z.output<typeof Contracts.YieldHistory>['series'][number];
export type SecurityKind = z.output<typeof Contracts.SecurityKind>;
export type OrderStatus = z.output<typeof Contracts.OrderStatus>;
