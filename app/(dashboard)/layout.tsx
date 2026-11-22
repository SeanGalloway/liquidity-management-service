import type { ReactNode } from 'react';
import Link from 'next/link';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[1376px] flex-wrap items-center gap-8 px-8">
          <span className="py-4 font-bold">Liquidity</span>
          <nav className="flex gap-7 text-sm font-semibold" aria-label="Sections">
            <Link href="/portfolio" className="py-4">
              Portfolio
            </Link>
            <Link href="/research" className="py-4">
              Research
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1376px] flex-wrap items-start gap-6 px-8 py-7">
        <main className="min-w-0 flex-[999_1_640px]">{children}</main>
        <aside
          aria-label="New order"
          className="max-w-[420px] flex-[1_1_340px] rounded-card border border-border bg-surface p-6"
        >
          <h2 className="font-semibold">New order</h2>
        </aside>
      </div>
    </div>
  );
}
