import type { Metadata } from 'next';
import Onboarding from '@/components/Onboarding';
import Unconfigured from '@/components/Unconfigured';
import { gate } from '@/lib/server/gate';

export const metadata: Metadata = { title: 'Begin · What Stayed' };
export const dynamic = 'force-dynamic';

/** Right after an account is made: a few skippable questions that shape Today and the agent. */
export default async function Page() {
  const g = await gate();
  if (!g.ok) return <Unconfigured reason={g.reason} />;
  return <Onboarding signedIn />;
}
