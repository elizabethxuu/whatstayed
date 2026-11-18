import type { UIMessage } from 'ai';
import Garden from '@/components/Garden';
import App from '@/components/App';
import Unconfigured from '@/components/Unconfigured';
import { gate } from '@/lib/server/gate';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const g = await gate({ conversation: true });
  if (!g.ok) return <Unconfigured reason={g.reason} />;
  return (
    <App initial={g.snapshot} email={g.user.email}>
      <Garden initial={(g.conversation ?? []) as UIMessage[]} />
    </App>
  );
}
