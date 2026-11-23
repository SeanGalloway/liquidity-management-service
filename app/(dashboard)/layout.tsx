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
          <div className="mx-auto flex max-w-[1376px] flex-wrap items-start gap-6 px-4 pt-7 pb-12 sm:px-8">
            <main className="flex min-w-0 flex-[999_1_640px] flex-col gap-6">{children}</main>
            <div className="w-full max-w-[420px] flex-[1_1_340px] max-lg:max-w-none lg:sticky lg:top-6">
              <OrderTicket />
            </div>
          </div>
        </div>
      </TicketProvider>
    </SetupGate>
  );
}
