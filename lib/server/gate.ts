import { redirect } from 'next/navigation';
import { currentUser, type User } from './auth';
import { ConfigError } from './db';
import { getConversation, state } from './data';
import type { Snapshot } from '../store';

export type Gate =
  | { ok: true; user: User; snapshot: Snapshot; conversation?: unknown[] }
  | { ok: false; reason: string };

/** Every room needs a signed-in person. Without a database, say so plainly instead of pretending. */
export async function gate(opts: { conversation?: boolean } = {}): Promise<Gate> {
  let user: User | null;
  try {
    user = await currentUser();
  } catch (e) {
    if (e instanceof ConfigError) return { ok: false, reason: e.message };
    throw e;
  }
  if (!user) redirect('/welcome');
  const [snapshot, conversation] = await Promise.all([
    state(user.id) as Promise<Snapshot>,
    opts.conversation ? getConversation(user.id) : Promise.resolve(undefined),
  ]);
  return { ok: true, user, snapshot, conversation };
}
