import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Onboarding from '@/components/Onboarding';
import Unconfigured from '@/components/Unconfigured';
import { currentUser } from '@/lib/server/auth';
import { ConfigError } from '@/lib/server/db';

export const metadata: Metadata = { title: 'Welcome · What Stayed' };
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const { reset } = await searchParams;
  const token = reset && /^[\w-]{20,200}$/.test(reset) ? reset : undefined;
  try {
    if (!token && (await currentUser())) redirect('/today');
  } catch (e) {
    if (e instanceof ConfigError) return <Unconfigured reason={e.message} />;
    throw e;
  }
  return <Onboarding resetToken={token} />;
}
