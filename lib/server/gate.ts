import { redirect } from 'next/navigation';
import { currentUser, tzOffset, type User } from './auth';
import { ConfigError } from './db';
import { state } from './data';
import { getTalk, latestTalk } from './talk';
import type { Snapshot } from '../store';
import type { StoredDraft, TalkSummary } from '../draft';

export type OpenTalk = { talk: TalkSummary; messages: unknown[]; drafts: StoredDraft[] } | null;

export type Gate =
  | { ok: true; user: User; snapshot: Snapshot; conversation?: OpenTalk }
  | { ok: false; reason: string };

/** Every room needs a signed-in person. Without a database, say so plainly instead of pretending. */
export async function gate(opts: { conversation?: boolean | string } = {}): Promise<Gate> {
  let user: User | null;
  try {
    user = await currentUser();
  } catch (e) {
    if (e instanceof ConfigError) return { ok: false, reason: e.message };
    throw e;
  }
  if (!user) redirect('/welcome');
  const uid = user.id;
  // the garden opens on the conversation asked for (?c=), or the most recent one
  async function openTalk(): Promise<OpenTalk> {
    const want = typeof opts.conversation === 'string' ? opts.conversation : await latestTalk(uid);
    if (!want) return null;
    try {
      return (await getTalk(uid, want)) as OpenTalk;
    } catch {
      const latest = await latestTalk(uid);
      return latest ? ((await getTalk(uid, latest)) as OpenTalk) : null;
    }
  }
  const [snapshot, conversation] = await Promise.all([
    state(uid, await tzOffset()) as unknown as Promise<Snapshot>,
    opts.conversation ? openTalk() : Promise.resolve(undefined),
  ]);
  return { ok: true, user, snapshot, conversation };
}
