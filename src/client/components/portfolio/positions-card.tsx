'use client';

import 'client-only';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@client/components/ui/tabs';
import { useBalance, useHoldings, useOrders } from '@client/queries';
import { HoldingsTable } from './holdings-table';
import { OrdersTable } from './orders-table';

const NOTES = {
  holdings: 'Held to maturity · one row per lot',
  orders: 'Market orders · priced at latest stored close',
};

const TRIGGER_CLASS =
  'h-auto min-h-11 flex-none gap-2 rounded-none border-0 border-b-2 border-transparent px-0.5 pt-3.5 pb-3 text-sm font-semibold text-muted data-[state=active]:border-accent data-[state=active]:text-ink after:hidden';

function Count({ children }: { children: number | string }) {
  return (
    <span className="rounded-full bg-divider px-1.5 py-px text-xs font-semibold text-muted">
      {children}
    </span>
  );
}

export function PositionsCard() {
  const [tab, setTab] = useState<keyof typeof NOTES>('holdings');
  const holdings = useHoldings();
  const orders = useOrders();
  const pendingCount = useBalance().data?.pendingOrders.count ?? 0;
  const loadedOrders = orders.data?.pages.reduce((total, page) => total + page.data.length, 0);

  return (
    <section
      aria-label="Positions and orders"
      className="rounded-card border border-border bg-surface"
    >
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as keyof typeof NOTES)}
        className="gap-0"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-3 border-b border-border px-4 pt-1 sm:px-6">
          <TabsList variant="line" className="h-auto gap-6 p-0">
            <TabsTrigger value="holdings" className={TRIGGER_CLASS}>
              Holdings <Count>{holdings.data?.length ?? '–'}</Count>
            </TabsTrigger>
            <TabsTrigger value="orders" className={TRIGGER_CLASS}>
              Orders{' '}
              <Count>{orders.hasNextPage ? `${loadedOrders}+` : (loadedOrders ?? '–')}</Count>
              {pendingCount > 0 && (
                <span
                  className="size-2 rounded-full bg-pending-dot"
                  role="img"
                  aria-label={`${pendingCount} pending`}
                />
              )}
            </TabsTrigger>
          </TabsList>
          <span className="py-2 text-[13px] text-muted">{NOTES[tab]}</span>
        </div>
        <TabsContent value="holdings" className="px-1 pb-2 sm:px-3">
          <HoldingsTable holdings={holdings} />
        </TabsContent>
        <TabsContent value="orders" className="px-1 pb-2 sm:px-3">
          <OrdersTable orders={orders} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
