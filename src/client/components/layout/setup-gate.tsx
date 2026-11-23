'use client';

import 'client-only';
import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useSetupStatus } from '@client/queries';

export function SetupGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data: status, error } = useSetupStatus();
  const needsSetup = status !== undefined && !status.initialized;

  useEffect(() => {
    if (needsSetup) router.replace('/setup');
  }, [needsSetup, router]);

  if (error && !status) {
    return (
      <p role="alert" className="mx-auto max-w-lg px-4 py-16 text-sm text-negative">
        Could not reach the API: {error.message}
      </p>
    );
  }
  if (!status?.initialized) return null;
  return children;
}
