'use client';

import 'client-only';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@client/lib/utils';
import { RatesStamp } from './rates-stamp';
import { Wordmark } from './wordmark';

const SECTIONS = [
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/research', label: 'Research' },
];

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-[1376px] flex-wrap items-center gap-x-8 px-4 sm:px-8">
        <div className="py-3.5">
          <Wordmark />
        </div>
        <nav className="flex gap-7" aria-label="Sections">
          {SECTIONS.map(({ href, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center border-b-2 px-0.5 py-3.5 text-sm font-semibold',
                  active
                    ? 'border-accent text-ink'
                    : 'border-transparent text-muted hover:text-ink',
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="py-3 sm:ml-auto">
          <RatesStamp />
        </div>
      </div>
    </header>
  );
}
