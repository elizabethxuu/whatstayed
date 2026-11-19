/**
 * Gentle ways back into the archive, worked out from what is actually stored: places and people that recur,
 * drafts left unfinished, memories that share a place or a person but aren't tied, words that recur across pages.
 * Each comes with its evidence. Nothing here interprets feelings, and the person can dismiss any of them
 * or turn them off altogether.
 */
import { db } from './db';
import { getProfile } from './profile';
import { searchPlaces, themes } from './agent';

export type Rediscovery = {
  key: string;
  kind: 'place' | 'person' | 'drafts' | 'connect' | 'words';
  title: string;
  evidence: string;
  ask?: string;
  open?: string;
  tie?: { a: string; b: string; reason: string };
};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export async function rediscover(user: string): Promise<Rediscovery[]> {
  const prof = await getProfile(user);
  if (prof.proactive === false) return [];
  const q = await db();
  const [dismissed, places, t, mems, locs, links, threads, drafts, hand] = await Promise.all([
    q<{ key: string }>('select key from dismissed where user_id=$1', [user]),
    searchPlaces(user),
    themes(user),
    q<{ id: string; place: string; moment: string; extra: unknown }>('select id, place, moment, extra from memories where user_id=$1 order by created_at', [user]),
    q<{ memory_id: string; data: unknown }>('select memory_id, data from locations where user_id=$1', [user]),
    q<{ a: string; b: string; name: string }>(`select l.a, l.b, p.name from links l join people p on p.user_id=l.user_id and p.id=l.b where l.user_id=$1 and l.kind='memory-person'`, [user]),
    q<{ a: string; b: string }>('select a, b from threads where user_id=$1', [user]),
    q<{ talk_id: string; n: number; title: string }>(
      `select d.talk_id, count(*)::int as n, t.title from drafts d join talks t on t.user_id=d.user_id and t.id=d.talk_id where d.user_id=$1 and d.status='draft' and d.talk_id<>'by-hand' group by d.talk_id, t.title`,
      [user],
    ),
    q<{ n: number }>(`select count(*)::int as n from drafts where user_id=$1 and talk_id='by-hand' and status='draft'`, [user]),
  ]);
  const gone = new Set(dismissed.map((d) => d.key));
  const out: Rediscovery[] = [];
  const add = (r: Rediscovery) => !gone.has(r.key) && out.push(r);

  for (const d of drafts)
    add({ key: `rd:drafts:${d.talk_id}`, kind: 'drafts', title: `${d.n === 1 ? 'One memory is' : `${d.n} memories are`} waiting for your review`, evidence: d.title ? `From “${d.title}”.` : 'From an earlier conversation.', open: `/?c=${encodeURIComponent(d.talk_id)}` });
  if (hand[0]?.n) add({ key: 'rd:hand', kind: 'drafts', title: hand[0].n === 1 ? 'A memory you began is unfinished' : `${hand[0].n} memories you began are unfinished`, evidence: 'Saved as drafts.', open: '/today' });

  // two memories sharing a place or a person, not yet tied
  const city = new Map(locs.map((l) => [l.memory_id, (typeof l.data === 'string' ? JSON.parse(l.data) : l.data) as { city?: string }]));
  const where = (m: { id: string; place: string }) => norm(city.get(m.id)?.city || m.place);
  const tied = new Set(threads.map((x) => [x.a, x.b].sort().join('|')));
  let pairs = 0;
  outer: for (let i = 0; i < mems.length; i++)
    for (let j = i + 1; j < mems.length; j++) {
      const a = mems[i], b = mems[j];
      if (tied.has([a.id, b.id].sort().join('|'))) continue;
      const sharedPeople = links.filter((l) => l.a === a.id && links.some((k) => k.a === b.id && k.b === l.b)).map((l) => l.name);
      const reason = where(a) === where(b) ? `Both in ${city.get(a.id)?.city || a.place}` : sharedPeople.length ? `Both with ${sharedPeople[0]}` : '';
      if (!reason) continue;
      const key = `rd:tie:${[a.id, b.id].sort().join('|')}`;
      if (gone.has(key) || gone.has([a.id, b.id].sort().join('|'))) continue;
      add({ key, kind: 'connect', title: `“${a.moment}” and “${b.moment}” aren’t tied yet`, evidence: `${reason}.`, tie: { a: a.id, b: b.id, reason } });
      if (++pairs >= 2) break outer;
    }

  for (const p of places.filter((p) => p.memories >= 2).slice(0, 2))
    add({ key: `rd:place:${norm(p.place)}:${p.memories}`, kind: 'place', title: `${p.place} appears in ${p.memories} memories`, evidence: 'Revisit them together, or add what you remember now.', ask: `What do you remember about ${p.place}?` });
  for (const p of t.people.filter((p) => p.count >= 2).slice(0, 2))
    add({ key: `rd:person:${norm(p.name)}:${p.count}`, kind: 'person', title: `${p.name} is in ${p.count} memories`, evidence: 'See them side by side.', ask: `What memories do I have with ${p.name}?` });
  for (const w of t.wordsAcrossPages.slice(0, 1))
    add({ key: `rd:word:${w.word}:${w.pages}`, kind: 'words', title: `“${w.word}” comes up in ${w.pages} of your pages`, evidence: 'Counted from what you’ve written.', ask: `Find my pages that mention ${w.word}.` });

  return out.slice(0, 6);
}
