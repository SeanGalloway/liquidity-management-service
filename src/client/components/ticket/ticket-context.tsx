'use client';

import 'client-only';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { addMonths, getTodayInNewYork } from '@client/lib/dates';

export const TICKET_ID = 'order-ticket';
export const FACE_INPUT_ID = 'ticket-face';

type TicketContextValue = {
  maturityDate: string;
  setMaturityDate: (date: string) => void;
  prefillMaturity: (date: string) => void;
  prefillCount: number;
};

const TicketContext = createContext<TicketContextValue | null>(null);

export function focusFaceInput() {
  document.getElementById(FACE_INPUT_ID)?.focus({ preventScroll: true });
}

export function TicketProvider({ children }: { children: ReactNode }) {
  const [maturityDate, setMaturityDate] = useState(() => addMonths(getTodayInNewYork(), 3));
  const [prefillCount, setPrefillCount] = useState(0);

  function prefillMaturity(date: string) {
    setMaturityDate(date);
    setPrefillCount((count) => count + 1);
    document.getElementById(TICKET_ID)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  return (
    <TicketContext value={{ maturityDate, setMaturityDate, prefillMaturity, prefillCount }}>
      {children}
    </TicketContext>
  );
}

export function useTicket() {
  const value = useContext(TicketContext);
  if (!value) throw new Error('useTicket must be used inside TicketProvider');
  return value;
}
