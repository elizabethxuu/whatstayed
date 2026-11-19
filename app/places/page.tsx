import type { Metadata } from 'next';
import { Suspense } from 'react';
import Places from '@/components/Places';
import App from '@/components/App';
import Unconfigured from '@/components/Unconfigured';
import { gate } from '@/lib/server/gate';

export const metadata: Metadata = {
  title: 'Places · What Stayed',
  description: 'Every memory, on the map.',
};
export const dynamic = 'force-dynamic';

export default async function Page() {
  const g = await gate();
  if (!g.ok) return <Unconfigured reason={g.reason} />;
  return (
    <App initial={g.snapshot} email={g.user.email}>
      <Suspense fallback={<main className="places" aria-busy="true" />}>
        <Places />
      </Suspense>
    </App>
  );
}
