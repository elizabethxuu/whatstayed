import type { Metadata } from 'next';
import { Suspense } from 'react';
import PrintCollection from '@/components/PrintCollection';
import App from '@/components/App';
import Unconfigured from '@/components/Unconfigured';
import { gate } from '@/lib/server/gate';

export const metadata: Metadata = { title: 'A collection · What Stayed' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const g = await gate();
  if (!g.ok) return <Unconfigured reason={g.reason} />;
  return (
    <App initial={g.snapshot} email={g.user.email}>
      <Suspense fallback={<main className="print" aria-busy="true" />}>
        <PrintCollection />
      </Suspense>
    </App>
  );
}
