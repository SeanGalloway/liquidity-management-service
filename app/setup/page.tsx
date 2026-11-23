import { Suspense } from 'react';
import { SetupWizard } from '@client/components/setup/setup-wizard';

export default function SetupPage() {
  return (
    <Suspense>
      <SetupWizard />
    </Suspense>
  );
}
