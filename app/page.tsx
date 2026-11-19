import Garden from '@/components/Garden';
import App from '@/components/App';
import Unconfigured from '@/components/Unconfigured';
import { gate } from '@/lib/server/gate';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const g = await gate({ conversation: c && /^[\w-]{1,80}$/.test(c) ? c : true });
  if (!g.ok) return <Unconfigured reason={g.reason} />;
  return (
    <App initial={g.snapshot} email={g.user.email}>
      {/* a fresh garden for each conversation, so nothing from one can leak into another */}
      <Garden key={g.conversation?.talk.id ?? 'new'} open={g.conversation ?? null} />
    </App>
  );
}
