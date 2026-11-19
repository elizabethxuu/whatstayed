import type { Metadata } from 'next';
import Today from '@/components/Today';
import App from '@/components/App';
import Unconfigured from '@/components/Unconfigured';
import { gate } from '@/lib/server/gate';

export const metadata: Metadata = { title: 'Today · What Stayed' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const g = await gate();
  if (!g.ok) return <Unconfigured reason={g.reason} />;
  return (
    <App initial={g.snapshot} email={g.user.email}>
      <Today />
    </App>
  );
}
