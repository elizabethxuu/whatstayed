import type { Metadata } from 'next';
import { Suspense } from 'react';
import Timeline from '@/components/Timeline';
import App from '@/components/App';
import Unconfigured from '@/components/Unconfigured';
import { gate } from '@/lib/server/gate';

export const metadata: Metadata = { title: 'Timeline · What Stayed' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const g = await gate();
  if (!g.ok) return <Unconfigured reason={g.reason} />;
  return (
    <App initial={g.snapshot} email={g.user.email}>
      <Suspense fallback={<main className="timeline" aria-busy="true" />}>
        <Timeline />
      </Suspense>
    </App>
  );
}
