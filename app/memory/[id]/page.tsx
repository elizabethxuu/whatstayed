import type { Metadata } from 'next';
import MemoryPage from '@/components/MemoryPage';
import App from '@/components/App';
import Unconfigured from '@/components/Unconfigured';
import { gate } from '@/lib/server/gate';

export const metadata: Metadata = { title: 'A memory · What Stayed' };
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate();
  if (!g.ok) return <Unconfigured reason={g.reason} />;
  return (
    <App initial={g.snapshot} email={g.user.email}>
      <MemoryPage id={id} />
    </App>
  );
}
