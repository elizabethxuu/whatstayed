import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Welcome from '@/components/Welcome';
import Unconfigured from '@/components/Unconfigured';
import { currentUser } from '@/lib/server/auth';
import { ConfigError } from '@/lib/server/db';

export const metadata: Metadata = { title: 'Welcome · What Stayed' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  try {
    if (await currentUser()) redirect('/');
  } catch (e) {
    if (e instanceof ConfigError) return <Unconfigured reason={e.message} />;
    throw e;
  }
  return <Welcome />;
}
