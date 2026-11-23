import type { ReactNode } from 'react';
import { AppHeader } from '@client/components/layout/app-header';
import { SetupGate } from '@client/components/layout/setup-gate';
import { OrderTicket } from '@client/components/ticket/order-ticket';
import { TicketProvider } from '@client/components/ticket/ticket-context';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <SetupGate>
      <TicketProvider>
        <div className="min-h-screen">
          <AppHeader />
          <div className="mx-auto flex max-w-[1376px] flex-col gap-6 px-4 pt-7 pb-12 sm:px-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:items-start">
            <main className="flex min-w-0 flex-col gap-6">{children}</main>
            <div className="lg:sticky lg:top-6">
              <OrderTicket />
            </div>
          </div>
        </div>
      </TicketProvider>
    </SetupGate>
  );
}
