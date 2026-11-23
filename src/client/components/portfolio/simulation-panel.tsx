'use client';

import 'client-only';
import Link from 'next/link';
import { useSetupStatus } from '@client/queries';

export function SimulationPanel() {
  const { data: status } = useSetupStatus();
  if (!status?.resetEnabled) return null;

  return (
    <section
      aria-label="Simulation"
      className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-simulation-line bg-simulation-soft px-4 py-4 sm:px-6"
    >
      <div>
        <h2 className="text-sm font-semibold text-simulation">Simulation</h2>
        <p className="mt-0.5 text-[13px] text-simulation">
          Demo tools are enabled. Return to setup to reset this portfolio and start over.
        </p>
      </div>
      <Link
        href="/setup?manage=1"
        className="inline-flex h-9 items-center rounded-md border border-simulation-line bg-surface px-3 text-[13px] font-semibold text-simulation hover:bg-simulation-soft focus-visible:ring-[3px] focus-visible:ring-simulation-line focus-visible:outline-none pointer-coarse:h-11"
      >
        Return to setup
      </Link>
    </section>
  );
}
