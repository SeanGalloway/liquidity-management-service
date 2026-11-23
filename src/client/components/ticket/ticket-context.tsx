'use client';

import 'client-only';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { addMonths, calculateTodayInNewYork } from '@client/lib/dates';

export const TICKET_ID = 'order-ticket';
export const FACE_INPUT_ID = 'ticket-face';

type TicketContextValue = {
  maturityDate: string;
  setMaturityDate: (date: string) => void;
  prefillMaturity: (date: string) => void;
};

const TicketContext = createContext<TicketContextValue | null>(null);

function revealTicket() {
  document.getElementById(TICKET_ID)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  document.getElementById(FACE_INPUT_ID)?.focus({ preventScroll: true });
}

export function TicketProvider({ children }: { children: ReactNode }) {
  const [maturityDate, setMaturityDate] = useState(() => addMonths(calculateTodayInNewYork(), 3));

  function prefillMaturity(date: string) {
    setMaturityDate(date);
    revealTicket();
  }

  return (
    <TicketContext value={{ maturityDate, setMaturityDate, prefillMaturity }}>
      {children}
    </TicketContext>
  );
}

export function useTicket() {
  const value = useContext(TicketContext);
  if (!value) throw new Error('useTicket must be used inside TicketProvider');
  return value;
}
