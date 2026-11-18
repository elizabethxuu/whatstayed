import type { Metadata } from 'next';
import Archives from '@/components/Archives';
import App from '@/components/App';
import Unconfigured from '@/components/Unconfigured';
import { gate } from '@/lib/server/gate';

export const metadata: Metadata = {
  title: 'The Archives · What Stayed',
  description: 'Things I wanted to remember.',
};
export const dynamic = 'force-dynamic';

export default async function Page() {
  const g = await gate();
  if (!g.ok) return <Unconfigured reason={g.reason} />;
  return (
    <App initial={g.snapshot} email={g.user.email}>
      <Archives />
    </App>
  );
}
