/**
 * The memory agent's hands: every tool it can use, each a real operation on this person's own data.
 *
 * Three kinds of tool:
 * - Reading (search, details, people, places, connections, themes, past conversations): run at once.
 * - Drafting memories: drafts wait for the person's review (see talk.ts).
 * - Changing anything else (a red thread, an edit, a deletion, a page, a person, a collection, a saved
 *   reflection): the agent can only *propose* it. A proposal is stored as a pending action and shown to
 *   the person, and only their confirmation (confirmAction) carries it out.
 *
 * Every query is scoped to the signed-in user. Every tool call is logged (tool, outcome, time taken).
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';
import { db, ms } from './db';
import { HttpError } from './http';
import { deleteMemory, ownEntry, saveEntry, tie, updateMemory } from './data';
import { addToCollection, createCollection, createPerson, link, ownCollection, ownPerson, updatePerson } from './life';
import { nameTrip, upsertDraft } from './talk';
import { draftSchema, tripSchema } from '../draft';

const nid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const parse = <T>(v: unknown): T => (typeof v === 'string' ? JSON.parse(v) : v) as T;
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const STOP = new Set(
  'a an and the of in on at to for from with my me i we our your you it its is was were be been am are this that these those there here what when where who how why do did does about remember tell any some all have has had just so very really into out up as by or not no yes can could would should will memory memories'.split(' '),
);
const words = (s: string) => norm(s).split(/[^\p{L}\p{N}']+/u).filter((w) => w.length > 1 && !STOP.has(w));

/* ---------- reading the archive ---------- */

type Mem = {
  id: string;
  place: string;
  when?: string;
  date?: string;
  moment: string;
  feeling: string;
  weight: string;
  origin: string;
  createdAt: number;
  extra?: { title?: string; narrative?: string; senses?: string[]; objects?: string[]; tags?: string[]; trip?: { title: string; talkId?: string }; unsure?: string[] };
  loc?: { name?: string; neighborhood?: string; city?: string; region?: string; country?: string };
  people: { id: string; name: string }[];
};

async function memoriesOf(user: string): Promise<Mem[]> {
  const q = await db();
  const [rows, locs, people] = await Promise.all([
    q(
      `select id, place, when_text as "when", to_char(happened_on, 'YYYY-MM-DD') as "date", moment, feeling, weight, origin, extra, ${ms('created_at')} as "createdAt"
       from memories where user_id=$1 order by created_at, id`,
      [user],
    ),
    q<{ memory_id: string; data: unknown }>('select memory_id, data from locations where user_id=$1', [user]),
    q<{ a: string; id: string; name: string }>(
      `select l.a, p.id, p.name from links l join people p on p.user_id=l.user_id and p.id=l.b where l.user_id=$1 and l.kind='memory-person'`,
      [user],
    ),
  ]);
  const locBy = new Map(locs.map((l) => [l.memory_id, parse<Mem['loc']>(l.data)]));
  return rows.map((r) => {
    const m = Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null)) as unknown as Mem;
    if (m.extra) m.extra = parse(m.extra);
    m.loc = locBy.get(m.id);
    m.people = people.filter((p) => p.a === m.id).map((p) => ({ id: p.id, name: p.name }));
    return m;
  });
}

function haystack(m: Mem) {
  const loc = m.loc ? [m.loc.name, m.loc.neighborhood, m.loc.city, m.loc.region, m.loc.country].filter(Boolean).join(' ') : '';
  return norm(
    [m.place, loc, m.when, m.date, m.moment, m.feeling, m.extra?.title, m.extra?.narrative, ...(m.extra?.senses ?? []), ...(m.extra?.objects ?? []), ...(m.extra?.tags ?? []), m.extra?.trip?.title, ...m.people.map((p) => p.name)]
      .filter(Boolean)
      .join(' '),
  );
}

/** What a tool shows the model about a memory: only what is stored, labelled by who supplied it. */
function brief(m: Mem) {
  return {
    id: m.id,
    title: m.extra?.title,
    place: m.loc?.city && norm(m.loc.city) !== norm(m.place) ? `${m.place} (${m.loc.city})` : m.place,
    when: m.when ?? m.date,
    moment: m.moment,
    feeling: m.feeling || undefined,
    people: m.people.length ? m.people.map((p) => p.name) : undefined,
    tags: m.extra?.tags?.length ? m.extra.tags : undefined,
    trip: m.extra?.trip?.title,
    savedBy: m.origin === 'agent' ? 'drafted with the agent, approved by the person' : 'the person',
    unsure: m.extra?.unsure?.length ? m.extra.unsure : undefined,
  };
}

export async function searchMemories(user: string, f: { query?: string; place?: string; person?: string; from?: string; to?: string; tag?: string; limit?: number }) {
  const all = await memoriesOf(user);
  const terms = f.query ? words(f.query) : [];
  const scored = all
    .map((m) => {
      const h = haystack(m);
      if (f.place && !norm([m.place, m.loc?.city, m.loc?.country, m.loc?.name].filter(Boolean).join(' ')).includes(norm(f.place))) return null;
      if (f.person && !m.people.some((p) => norm(p.name).includes(norm(f.person!))) && !h.includes(norm(f.person))) return null;
      if (f.tag && !(m.extra?.tags ?? []).some((t) => norm(t) === norm(f.tag!))) return null;
      const d = m.date ?? '';
      if (f.from && (!d || d < f.from)) return null;
      if (f.to && (!d || d.slice(0, f.to.length) > f.to)) return null;
      const score = terms.length ? terms.filter((t) => h.includes(t)).length : 1;
      if (terms.length && score === 0) return null;
      return { m, score };
    })
    .filter((x): x is { m: Mem; score: number } => x !== null)
    .sort((a, b) => b.score - a.score || (a.m.date ?? '').localeCompare(b.m.date ?? '') || a.m.createdAt - b.m.createdAt);
  return { total: scored.length, memories: scored.slice(0, Math.min(f.limit ?? 8, 20)).map((x) => brief(x.m)) };
}

export async function memoryDetails(user: string, id: string) {
  const all = await memoriesOf(user);
  const m = all.find((x) => x.id === id);
  if (!m) throw new HttpError(404, 'There is no memory with that id in this garden.');
  const q = await db();
  const [threads, pages, cols, media] = await Promise.all([
    q<{ a: string; b: string; note: string | null; origin: string }>('select a, b, note, origin from threads where user_id=$1 and (a=$2 or b=$2)', [user, id]),
    q<{ id: string; body: string }>(`select e.id, e.body from links l join entries e on e.user_id=l.user_id and e.id=l.a where l.user_id=$1 and l.kind='entry-memory' and l.b=$2`, [user, id]),
    q<{ id: string; name: string }>(`select c.id, c.name from collection_items i join collections c on c.user_id=i.user_id and c.id=i.collection_id where i.user_id=$1 and i.kind='memory' and i.item_id=$2`, [user, id]),
    q<{ kind: string; n: number }>(`select kind, count(*)::int as n from media where user_id=$1 and owner_type='memory' and owner_id=$2 group by kind`, [user, id]),
  ]);
  return {
    ...brief(m),
    narrative: m.extra?.narrative,
    senses: m.extra?.senses,
    objects: m.extra?.objects,
    location: m.loc,
    connections: threads.map((t) => {
      const other = all.find((x) => x.id === (t.a === id ? t.b : t.a));
      return { id: other?.id, place: other?.place, moment: other?.moment, note: t.note ?? undefined, madeBy: t.origin === 'you' ? 'the person' : 'suggested, approved by the person' };
    }),
    pages: pages.map((p) => ({ id: p.id, excerpt: p.body.slice(0, 160) })),
    collections: cols,
    photographs: media.find((x) => x.kind === 'photo')?.n ?? 0,
    voiceNotes: media.find((x) => x.kind === 'voice')?.n ?? 0,
  };
}

export async function searchEntries(user: string, f: { query?: string; reflectionsOnly?: boolean; limit?: number }) {
  const q = await db();
  const rows = await q<{ id: string; body: string; meta: unknown; createdAt: number }>(
    `select id, body, meta, ${ms('created_at')} as "createdAt" from entries where user_id=$1 order by created_at desc limit 500`,
    [user],
  );
  const terms = f.query ? words(f.query) : [];
  const hits = rows
    .map((r) => ({ ...r, meta: r.meta ? parse<{ prompt?: string; ai?: boolean; draft?: boolean }>(r.meta) : undefined }))
    .filter((r) => (!f.reflectionsOnly || r.meta?.prompt || r.meta?.ai) && (!terms.length || terms.some((t) => norm(r.body + ' ' + (r.meta?.prompt ?? '')).includes(t))));
  return {
    total: hits.length,
    pages: hits.slice(0, Math.min(f.limit ?? 6, 15)).map((r) => {
      const at = terms.length ? Math.max(0, norm(r.body).indexOf(terms.find((t) => norm(r.body).includes(t)) ?? '') - 60) : 0;
      return {
        id: r.id,
        written: new Date(r.createdAt).toISOString().slice(0, 10),
        question: r.meta?.prompt,
        writtenBy: r.meta?.ai ? 'a reflection the agent wrote and the person chose to keep' : 'the person',
        excerpt: (at ? '…' : '') + r.body.slice(at, at + 280) + (r.body.length > at + 280 ? '…' : ''),
      };
    }),
  };
}

export async function searchPeople(user: string, query?: string) {
  const q = await db();
  const rows = await q<{ id: string; name: string; relation: string | null; description: string | null; n: number }>(
    `select p.id, p.name, p.relation, p.description,
       (select count(*)::int from links l where l.user_id=p.user_id and l.kind='memory-person' and l.b=p.id) as n
     from people p where p.user_id=$1 order by lower(p.name)`,
    [user],
  );
  const t = query ? norm(query) : '';
  return rows
    .filter((p) => !t || norm([p.name, p.relation, p.description].filter(Boolean).join(' ')).includes(t))
    .slice(0, 12)
    .map((p) => ({ id: p.id, name: p.name, relation: p.relation ?? undefined, description: p.description ?? undefined, memories: p.n }));
}

export async function searchPlaces(user: string, query?: string) {
  const all = await memoriesOf(user);
  const by = new Map<string, { place: string; city?: string; country?: string; memoryIds: string[] }>();
  for (const m of all) {
    const key = norm(m.loc?.city || m.place);
    const g = by.get(key) ?? { place: m.loc?.city || m.place, city: m.loc?.city, country: m.loc?.country, memoryIds: [] };
    g.memoryIds.push(m.id);
    by.set(key, g);
  }
  const t = query ? norm(query) : '';
  return [...by.values()]
    .filter((g) => !t || norm([g.place, g.city, g.country].filter(Boolean).join(' ')).includes(t) || g.memoryIds.some((id) => norm(all.find((m) => m.id === id)!.place).includes(t)))
    .sort((a, b) => b.memoryIds.length - a.memoryIds.length)
    .slice(0, 15)
    .map((g) => ({ ...g, memories: g.memoryIds.length }));
}

/** Memories that could be related to one, each with the evidence: never a guess. */
export async function findRelated(user: string, id: string) {
  const all = await memoriesOf(user);
  const m = all.find((x) => x.id === id);
  if (!m) throw new HttpError(404, 'There is no memory with that id in this garden.');
  const q = await db();
  const tied = new Set(
    (await q<{ a: string; b: string }>('select a, b from threads where user_id=$1 and (a=$2 or b=$2)', [user, id])).map((t) => (t.a === id ? t.b : t.a)),
  );
  const city = (x: Mem) => norm(x.loc?.city || x.place);
  const out = all
    .filter((o) => o.id !== id)
    .map((o) => {
      const why: string[] = [];
      if (city(o) === city(m)) why.push(`both in ${o.loc?.city || o.place}`);
      const shared = o.people.filter((p) => m.people.some((q2) => q2.id === p.id)).map((p) => p.name);
      if (shared.length) why.push(`both with ${shared.join(' and ')}`);
      const tags = (o.extra?.tags ?? []).filter((t) => (m.extra?.tags ?? []).map(norm).includes(norm(t)));
      if (tags.length) why.push(`both tagged ${tags.join(', ')}`);
      if (o.extra?.trip?.talkId && o.extra.trip.talkId === m.extra?.trip?.talkId) why.push(`same trip: ${o.extra.trip.title}`);
      return { o, why };
    })
    .filter((x) => x.why.length)
    .sort((a, b) => b.why.length - a.why.length)
    .slice(0, 8);
  return {
    for: brief(m),
    related: out.map(({ o, why }) => ({ ...brief(o), evidence: why, alreadyTied: tied.has(o.id) })),
  };
}

export async function listConnections(user: string, id?: string) {
  const all = await memoriesOf(user);
  const q = await db();
  const rows = await q<{ id: string; a: string; b: string; note: string | null; origin: string }>(
    `select id, a, b, note, origin from threads where user_id=$1 ${id ? 'and (a=$2 or b=$2)' : ''} order by created_at desc limit 40`,
    id ? [user, id] : [user],
  );
  const label = (mid: string) => {
    const x = all.find((m) => m.id === mid);
    return x ? `${x.place}: ${x.extra?.title || x.moment}` : 'a memory no longer here';
  };
  return rows.map((t) => ({ id: t.id, a: { id: t.a, label: label(t.a) }, b: { id: t.b, label: label(t.b) }, note: t.note ?? undefined }));
}

/** Counted patterns in the archive. Only counts: what they mean is for the person. */
export async function themes(user: string) {
  const all = await memoriesOf(user);
  const q = await db();
  const entries = await q<{ body: string }>('select body from entries where user_id=$1', [user]);
  const count = (xs: string[]) => {
    const c = new Map<string, number>();
    for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
    return [...c.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, n]) => ({ name, count: n }));
  };
  const pageWords = new Map<string, number>();
  for (const e of entries) for (const w of new Set(words(e.body).filter((w) => w.length > 3))) pageWords.set(w, (pageWords.get(w) ?? 0) + 1);
  return {
    memories: all.length,
    pages: entries.length,
    places: count(all.map((m) => m.loc?.city || m.place)),
    people: count(all.flatMap((m) => m.people.map((p) => p.name))),
    tags: count(all.flatMap((m) => m.extra?.tags ?? [])),
    feelings: count(all.map((m) => m.feeling).filter(Boolean)),
    years: count(all.map((m) => m.date?.slice(0, 4)).filter((y): y is string => !!y)),
    wordsAcrossPages: [...pageWords.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([word, pages]) => ({ word, pages })),
    note: 'These are counts of what is stored. Describe them as counts; do not attribute feelings or reasons to them.',
  };
}

export async function chronology(user: string, from?: string, to?: string) {
  const all = await memoriesOf(user);
  const dated = all.filter((m) => m.date && (!from || m.date >= from) && (!to || m.date.slice(0, to.length) <= to)).sort((a, b) => a.date!.localeCompare(b.date!));
  return { dated: dated.slice(0, 40).map(brief), undated: all.filter((m) => !m.date).length };
}

/** Details already kept that are easy to forget: senses, objects, stories, in memories not opened recently. */
export async function forgottenDetails(user: string) {
  const all = await memoriesOf(user);
  const withDetail = all.filter((m) => m.extra?.senses?.length || m.extra?.objects?.length || m.extra?.narrative);
  const pick = (withDetail.length ? withDetail : all).sort((a, b) => a.createdAt - b.createdAt).slice(0, 5);
  return pick.map((m) => ({ ...brief(m), senses: m.extra?.senses, objects: m.extra?.objects, narrative: m.extra?.narrative }));
}

/** Earlier conversations, in the person's own words, so something said weeks ago can be found again. */
export async function recallConversations(user: string, query: string, exceptTalk?: string) {
  const q = await db();
  const rows = await q<{ id: string; title: string; messages: unknown; updatedAt: number }>(
    `select id, title, messages, ${ms('updated_at')} as "updatedAt" from talks where user_id=$1 ${exceptTalk ? 'and id<>$2' : ''} order by updated_at desc limit 60`,
    exceptTalk ? [user, exceptTalk] : [user],
  );
  const terms = words(query);
  const hits: { conversation: string; title: string; date: string; theySaid: string }[] = [];
  for (const r of rows) {
    const msgs = parse<{ role?: string; parts?: { type?: string; text?: string }[] }[]>(r.messages) ?? [];
    for (const m of msgs) {
      if (m.role !== 'user') continue;
      const text = (m.parts ?? []).filter((p) => p.type === 'text').map((p) => p.text ?? '').join(' ');
      if (terms.length && terms.some((t) => norm(text).includes(t))) {
        hits.push({ conversation: r.id, title: r.title, date: new Date(r.updatedAt).toISOString().slice(0, 10), theySaid: text.slice(0, 400) });
      }
    }
    if (hits.length >= 6) break;
  }
  return { found: hits.length, excerpts: hits.slice(0, 6) };
}

export async function listCollections(user: string, query?: string) {
  const q = await db();
  const rows = await q<{ id: string; name: string; description: string | null; n: number }>(
    `select c.id, c.name, c.description, (select count(*)::int from collection_items i where i.user_id=c.user_id and i.collection_id=c.id) as n
     from collections c where c.user_id=$1 order by c.updated_at desc`,
    [user],
  );
  const t = query ? norm(query) : '';
  return rows.filter((c) => !t || norm(c.name + ' ' + (c.description ?? '')).includes(t)).slice(0, 15).map((c) => ({ id: c.id, name: c.name, description: c.description ?? undefined, items: c.n }));
}

/* ---------- proposals: changes wait for the person ---------- */

export const ACTIONS = {
  tie: z.object({ a: z.string().min(1).max(80), b: z.string().min(1).max(80), reason: z.string().trim().min(1).max(80) }),
  'update-memory': z.object({
    id: z.string().min(1).max(80),
    changes: z
      .object({
        place: z.string().trim().min(1).max(80).optional(),
        moment: z.string().trim().min(2).max(600).optional(),
        when: z.string().trim().max(60).optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        feeling: z.string().trim().max(40).optional(),
        title: z.string().trim().max(80).optional(),
        narrative: z.string().trim().max(2000).optional(),
      })
      .refine((c) => Object.keys(c).length > 0, 'Nothing to change.'),
    reason: z.string().trim().max(160).optional(),
  }),
  'delete-memory': z.object({ id: z.string().min(1).max(80) }),
  'create-entry': z.object({ body: z.string().trim().min(2).max(20_000), prompt: z.string().trim().max(200).optional(), memoryIds: z.array(z.string().max(80)).max(6).optional() }),
  'edit-entry': z.object({ id: z.string().min(1).max(80), body: z.string().trim().min(2).max(20_000) }),
  'save-reflection': z.object({ title: z.string().trim().min(1).max(120), body: z.string().trim().min(10).max(6000), memoryIds: z.array(z.string().max(80)).max(12) }),
  'create-person': z.object({ name: z.string().trim().min(1).max(80), relation: z.string().trim().max(60).optional(), description: z.string().trim().max(600).optional(), memoryIds: z.array(z.string().max(80)).max(12).optional() }),
  'update-person': z.object({ id: z.string().min(1).max(80), name: z.string().trim().min(1).max(80).optional(), relation: z.string().trim().max(60).optional(), description: z.string().trim().max(600).optional() }),
  'create-collection': z.object({ name: z.string().trim().min(1).max(80), description: z.string().trim().max(400).optional(), memoryIds: z.array(z.string().max(80)).max(30) }),
  'add-to-collection': z.object({ collectionId: z.string().min(1).max(80), memoryIds: z.array(z.string().max(80)).min(1).max(30) }),
} as const;
export type ActionKind = keyof typeof ACTIONS;
export type Action = { id: string; talkId: string | null; kind: ActionKind; payload: Record<string, unknown>; summary: string; status: 'pending' | 'done' | 'declined' | 'failed'; error?: string; createdAt: number };

const label = (all: Mem[], id: string) => {
  const m = all.find((x) => x.id === id);
  return m ? `“${m.extra?.title || m.moment}” (${m.place})` : id;
};

/** Check a proposal against what really exists, and describe it in plain words for the confirmation card. */
async function describe(user: string, kind: ActionKind, p: Record<string, unknown>): Promise<string> {
  const all = await memoriesOf(user);
  const must = (id: string) => {
    if (!all.some((m) => m.id === id)) throw new HttpError(404, `There is no memory with id ${id} in this garden.`);
  };
  switch (kind) {
    case 'tie': {
      const { a, b, reason } = p as z.infer<(typeof ACTIONS)['tie']>;
      if (a === b) throw new HttpError(400, 'A memory can’t be tied to itself.');
      must(a);
      must(b);
      const q = await db();
      if ((await q('select 1 from threads where user_id=$1 and ((a=$2 and b=$3) or (a=$3 and b=$2))', [user, a, b])).length) throw new HttpError(409, 'Those two are already tied.');
      return `Tie a red thread between ${label(all, a)} and ${label(all, b)}: ${reason}`;
    }
    case 'update-memory': {
      const { id, changes } = p as z.infer<(typeof ACTIONS)['update-memory']>;
      must(id);
      return `Change ${label(all, id)}: ${Object.entries(changes).map(([k, v]) => `${k} → “${v}”`).join('; ')}`;
    }
    case 'delete-memory': {
      const { id } = p as z.infer<(typeof ACTIONS)['delete-memory']>;
      must(id);
      return `Delete ${label(all, id)}, with its place, threads and photographs. This can’t be undone.`;
    }
    case 'create-entry': {
      const { body, memoryIds } = p as z.infer<(typeof ACTIONS)['create-entry']>;
      (memoryIds ?? []).forEach(must);
      return `Keep a new page in your Archives: “${body.length > 90 ? body.slice(0, 88) + '…' : body}”`;
    }
    case 'edit-entry': {
      const { id } = p as z.infer<(typeof ACTIONS)['edit-entry']>;
      await ownEntry(user, id);
      return 'Replace the words on one of your pages with the version shown.';
    }
    case 'save-reflection': {
      const { title, memoryIds } = p as z.infer<(typeof ACTIONS)['save-reflection']>;
      memoryIds.forEach(must);
      return `Keep this reflection (written by the agent) in your Archives: “${title}”`;
    }
    case 'create-person': {
      const { name, memoryIds } = p as z.infer<(typeof ACTIONS)['create-person']>;
      (memoryIds ?? []).forEach(must);
      return `Add ${name} to People${memoryIds?.length ? `, with ${memoryIds.length === 1 ? 'one memory' : `${memoryIds.length} memories`}` : ''}`;
    }
    case 'update-person': {
      const { id, ...rest } = p as z.infer<(typeof ACTIONS)['update-person']>;
      await ownPerson(user, id);
      return `Update a person: ${Object.entries(rest).filter(([, v]) => v).map(([k, v]) => `${k} → “${v}”`).join('; ')}`;
    }
    case 'create-collection': {
      const { name, memoryIds } = p as z.infer<(typeof ACTIONS)['create-collection']>;
      memoryIds.forEach(must);
      return `Start a collection, “${name}”, with ${memoryIds.length === 1 ? 'one memory' : `${memoryIds.length} memories`}`;
    }
    case 'add-to-collection': {
      const { collectionId, memoryIds } = p as z.infer<(typeof ACTIONS)['add-to-collection']>;
      await ownCollection(user, collectionId);
      memoryIds.forEach(must);
      return `Add ${memoryIds.length === 1 ? label(all, memoryIds[0]) : `${memoryIds.length} memories`} to a collection`;
    }
  }
}

export async function propose(user: string, talkId: string | null, kind: ActionKind, input: unknown) {
  const payload = ACTIONS[kind].parse(input) as Record<string, unknown>;
  const summary = await describe(user, kind, payload);
  const q = await db();
  const id = nid('a');
  await q('insert into actions (user_id, id, talk_id, kind, payload, summary) values ($1,$2,$3,$4,$5::jsonb,$6)', [user, id, talkId, kind, JSON.stringify(payload), summary]);
  return { proposed: true, actionId: id, summary, status: 'waiting for the person to confirm or decline; nothing has changed yet' };
}

const ACTION_COLS = `id, talk_id as "talkId", kind, payload, summary, status, error, ${ms('created_at')} as "createdAt"`;
const toAction = (r: Record<string, unknown>) => ({ ...r, payload: parse(r.payload), error: r.error ?? undefined, talkId: r.talkId ?? null }) as Action;

export async function listActions(user: string, talkId?: string) {
  const q = await db();
  const rows = await q(`select ${ACTION_COLS} from actions where user_id=$1 ${talkId ? 'and talk_id=$2' : ''} order by created_at limit 200`, talkId ? [user, talkId] : [user]);
  return rows.map(toAction);
}

/** The person's decision. Only a confirmation runs the change, and a failure is recorded as a failure. */
export async function decideAction(user: string, id: string, decision: 'confirm' | 'decline') {
  const q = await db();
  const rows = await q(`select ${ACTION_COLS} from actions where user_id=$1 and id=$2`, [user, id]);
  if (!rows.length) throw new HttpError(404, 'That suggestion isn’t here any more.');
  const a = toAction(rows[0]);
  if (a.status !== 'pending') return a;
  if (decision === 'decline') {
    await q(`update actions set status='declined', decided_at=now() where user_id=$1 and id=$2`, [user, id]);
    return { ...a, status: 'declined' as const };
  }
  try {
    const result = await run(user, a);
    await q(`update actions set status='done', result=$3::jsonb, decided_at=now() where user_id=$1 and id=$2`, [user, id, JSON.stringify(result ?? null)]);
    return { ...a, status: 'done' as const, result };
  } catch (e) {
    const msg = e instanceof HttpError ? e.message : 'It couldn’t be done just now.';
    if (!(e instanceof HttpError)) console.error(e);
    await q(`update actions set status='failed', error=$3, decided_at=now() where user_id=$1 and id=$2`, [user, id, msg]);
    return { ...a, status: 'failed' as const, error: msg };
  }
}

async function run(user: string, a: Action): Promise<unknown> {
  const p = ACTIONS[a.kind].parse(a.payload);
  switch (a.kind) {
    case 'tie': {
      const t = p as z.infer<(typeof ACTIONS)['tie']>;
      return { threadId: await tie(user, { a: t.a, b: t.b, note: t.reason.slice(0, 80), origin: 'suggested' }) };
    }
    case 'update-memory': {
      const { id, changes } = p as z.infer<(typeof ACTIONS)['update-memory']>;
      const cur = (await memoriesOf(user)).find((m) => m.id === id);
      if (!cur) throw new HttpError(404, 'That memory isn’t here any more.');
      await updateMemory(user, id, {
        place: changes.place ?? cur.place,
        moment: changes.moment ?? cur.moment,
        when: changes.when ?? cur.when ?? null,
        date: changes.date ?? cur.date ?? null,
        feeling: changes.feeling ?? cur.feeling,
        weight: cur.weight as 'light' | 'tender' | 'heavy',
        title: changes.title ?? cur.extra?.title ?? null,
        narrative: changes.narrative ?? cur.extra?.narrative ?? null,
      });
      return { updated: id };
    }
    case 'delete-memory':
      await deleteMemory(user, (p as { id: string }).id);
      return { deleted: (p as { id: string }).id };
    case 'create-entry': {
      const e = p as z.infer<(typeof ACTIONS)['create-entry']>;
      const id = nid('e');
      await saveEntry(user, { id, body: e.body, createdAt: Date.now(), meta: e.prompt ? { prompt: e.prompt } : undefined });
      for (const m of e.memoryIds ?? []) await link(user, { kind: 'entry-memory', a: id, b: m });
      return { entryId: id };
    }
    case 'edit-entry': {
      const e = p as z.infer<(typeof ACTIONS)['edit-entry']>;
      await ownEntry(user, e.id);
      const q = await db();
      const cur = await q<{ createdAt: number }>(`select ${ms('created_at')} as "createdAt" from entries where user_id=$1 and id=$2`, [user, e.id]);
      await saveEntry(user, { id: e.id, body: e.body, createdAt: cur[0].createdAt });
      return { entryId: e.id };
    }
    case 'save-reflection': {
      const r = p as z.infer<(typeof ACTIONS)['save-reflection']>;
      const id = nid('e');
      await saveEntry(user, { id, body: `${r.title}\n\n${r.body}`, createdAt: Date.now(), meta: { ai: true } });
      for (const m of r.memoryIds) await link(user, { kind: 'entry-memory', a: id, b: m, note: 'In a reflection' });
      return { entryId: id };
    }
    case 'create-person': {
      const c = p as z.infer<(typeof ACTIONS)['create-person']>;
      const person = (await createPerson(user, { name: c.name, relation: c.relation, description: c.description })) as { id: string };
      for (const m of c.memoryIds ?? []) await link(user, { kind: 'memory-person', a: m, b: person.id });
      return { personId: person.id };
    }
    case 'update-person': {
      const u = p as z.infer<(typeof ACTIONS)['update-person']>;
      const q = await db();
      const cur = await q<{ name: string; relation: string | null; description: string | null; notes: string | null }>('select name, relation, description, notes from people where user_id=$1 and id=$2', [user, u.id]);
      if (!cur.length) throw new HttpError(404, 'That person isn’t here any more.');
      await updatePerson(user, u.id, { name: u.name ?? cur[0].name, relation: u.relation ?? cur[0].relation, description: u.description ?? cur[0].description, notes: cur[0].notes });
      return { personId: u.id };
    }
    case 'create-collection': {
      const c = p as z.infer<(typeof ACTIONS)['create-collection']>;
      const col = (await createCollection(user, { name: c.name, description: c.description })) as { id: string };
      for (const m of c.memoryIds) await addToCollection(user, col.id, { kind: 'memory', id: m });
      return { collectionId: col.id };
    }
    case 'add-to-collection': {
      const c = p as z.infer<(typeof ACTIONS)['add-to-collection']>;
      for (const m of c.memoryIds) await addToCollection(user, c.collectionId, { kind: 'memory', id: m });
      return { collectionId: c.collectionId };
    }
  }
}

/* ---------- logging and the tool set ---------- */

async function logTool(user: string, talkId: string | null, name: string, ok: boolean, msTaken: number, error?: string) {
  try {
    const q = await db();
    await q('insert into tool_log (user_id, talk_id, tool, ok, ms, error) values ($1,$2,$3,$4,$5,$6)', [user, talkId, name, ok, Math.round(msTaken), error?.slice(0, 300) ?? null]);
  } catch {
    /* logging never breaks a reply */
  }
}

const transient = (e: unknown) => !(e instanceof HttpError) && !(e instanceof z.ZodError);

/**
 * Runs a tool for this person, logs it, retries a read once on a passing database error, and turns any
 * failure into a plain result the agent must report, so it can never claim something worked when it didn't.
 */
function guarded<I, O>(user: string, talkId: string | null, name: string, fn: (input: I) => Promise<O>, retry: boolean) {
  return async (input: I) => {
    const t0 = Date.now();
    for (let attempt = 0; ; attempt++) {
      try {
        const out = await fn(input);
        await logTool(user, talkId, name, true, Date.now() - t0);
        return out as O | { error: string };
      } catch (e) {
        if (retry && attempt === 0 && transient(e)) continue;
        const msg = e instanceof HttpError ? e.message : e instanceof z.ZodError ? 'Some of that didn’t look right: ' + e.issues.map((i) => i.message).join('; ') : 'That didn’t work on our side.';
        if (transient(e)) console.error(`[agent] ${name} failed`, e);
        await logTool(user, talkId, name, false, Date.now() - t0, msg);
        return { error: msg, failed: true, note: 'Nothing was done. Tell the person plainly that this did not work.' };
      }
    }
  };
}

const id = z.string().min(1).max(80);

export function agentTools(user: string, talkId: string, mode: 'free' | 'trip') {
  // the SDK's tool() typing is very generic; each tool's input is still validated against its zod schema at runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const make = (description: string, inputSchema: z.ZodTypeAny, execute: (i: any) => Promise<unknown>) => tool({ description, inputSchema, execute } as never) as Tool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const read = (name: string, description: string, inputSchema: z.ZodTypeAny, fn: (i: any) => Promise<unknown>) => make(description, inputSchema, guarded(user, talkId, name, fn, true));
  const ask = (name: string, kind: ActionKind, description: string) => make(description, ACTIONS[kind], guarded(user, talkId, name, (i: unknown) => propose(user, talkId, kind, i), false));

  return {
    /* finding things */
    searchMemories: read(
      'searchMemories',
      'Search this person’s saved memories. Use for any question about what they remember. Returns only stored records.',
      z.object({
        query: z.string().max(200).optional().describe('Words to look for: a place, a person, a thing, an activity.'),
        place: z.string().max(80).optional(),
        person: z.string().max(80).optional(),
        tag: z.string().max(30).optional(),
        from: z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/).optional().describe('Earliest date, e.g. 2019 or 2019-06'),
        to: z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/).optional(),
        limit: z.number().int().min(1).max(20).optional(),
      }),
      (i) => searchMemories(user, i),
    ),
    getMemory: read('getMemory', 'Everything stored about one memory: story, details, people, place, connections, pages, collections.', z.object({ id }), (i) => memoryDetails(user, i.id)),
    searchJournal: read(
      'searchJournal',
      'Search their written pages and saved reflections in the Archives.',
      z.object({ query: z.string().max(200).optional(), reflectionsOnly: z.boolean().optional(), limit: z.number().int().min(1).max(15).optional() }),
      (i) => searchEntries(user, i),
    ),
    searchPeople: read('searchPeople', 'Find people they keep, with how many memories each appears in.', z.object({ query: z.string().max(80).optional() }), (i) => searchPeople(user, i.query)),
    searchPlaces: read('searchPlaces', 'Places in their garden, with the memories in each.', z.object({ query: z.string().max(80).optional() }), (i) => searchPlaces(user, i.query)),
    findRelatedMemories: read(
      'findRelatedMemories',
      'Memories that share a place, a person, a tag or a trip with one memory, each with its evidence. Use before suggesting a connection.',
      z.object({ memoryId: id }),
      (i) => findRelated(user, i.memoryId),
    ),
    listConnections: read('listConnections', 'Red threads that already exist, for one memory or overall.', z.object({ memoryId: id.optional() }), (i) => listConnections(user, i.memoryId)),
    listCollections: read('listCollections', 'Their collections.', z.object({ query: z.string().max(80).optional() }), (i) => listCollections(user, i.query)),
    recallConversations: read(
      'recallConversations',
      'Find what they said in earlier conversations (their own words, with dates). Use when they refer to something they told you before.',
      z.object({ query: z.string().min(1).max(200) }),
      (i) => recallConversations(user, i.query, talkId),
    ),
    /* reflecting */
    findThemes: read('findThemes', 'Counted patterns across their archive: places, people, tags, feelings, years, words that recur across pages. Counts only.', z.object({}), () => themes(user)),
    chronologicalSummary: read(
      'chronologicalSummary',
      'Their dated memories in order, optionally within a range, for a summary of a period.',
      z.object({ from: z.string().regex(/^\d{4}(-\d{2})?/).optional(), to: z.string().regex(/^\d{4}(-\d{2})?/).optional() }),
      (i) => chronology(user, i.from, i.to),
    ),
    surfaceForgottenDetails: read('surfaceForgottenDetails', 'Older memories with sensory details, objects or stories already kept, to bring back.', z.object({}), () => forgottenDetails(user)),

    /* capturing */
    draftMemory: make(
      'Draft one distinct memory from the conversation for the person to review. Not saved until they confirm it.',
      draftSchema,
      guarded(user, talkId, 'draftMemory', async (input: z.infer<typeof draftSchema>) => ({ drafted: true, draftId: await upsertDraft(user, talkId, nid('d'), input), status: 'waiting for the person’s review; not saved yet' }), false),
    ),
    ...(mode === 'trip'
      ? {
          nameTrip: make(
            'Name the trip this conversation is about, once you know where (and if possible when) it was.',
            tripSchema,
            guarded(user, talkId, 'nameTrip', async (input: z.infer<typeof tripSchema>) => (await nameTrip(user, talkId, input), { named: true }), false),
          ),
        }
      : {}),

    /* changes: proposed, then confirmed by the person */
    proposeConnection: ask('proposeConnection', 'tie', 'Suggest a red thread between two memories, with the evidence as the reason. The person must confirm it.'),
    proposeMemoryUpdate: ask('proposeMemoryUpdate', 'update-memory', 'Suggest a correction to a saved memory, using only what the person said. They must confirm it.'),
    proposeMemoryDeletion: ask('proposeMemoryDeletion', 'delete-memory', 'Ask to delete a memory the person asked to remove. They must confirm it.'),
    proposeJournalEntry: ask('proposeJournalEntry', 'create-entry', 'Offer to keep their own words as a page in the Archives. They must confirm it.'),
    proposeJournalEdit: ask('proposeJournalEdit', 'edit-entry', 'Offer a revised version of one of their pages, as they asked. They must confirm it.'),
    proposeReflection: ask(
      'proposeReflection',
      'save-reflection',
      'Offer to keep a reflection you wrote, built only from the listed memories. It will be marked as written by the agent. They must confirm it.',
    ),
    proposePerson: ask('proposePerson', 'create-person', 'Offer to add someone they mentioned to People. They must confirm it.'),
    proposePersonUpdate: ask('proposePersonUpdate', 'update-person', 'Offer to update a person’s details, as they said. They must confirm it.'),
    proposeCollection: ask('proposeCollection', 'create-collection', 'Offer to start a collection of memories. They must confirm it.'),
    proposeAddToCollection: ask('proposeAddToCollection', 'add-to-collection', 'Offer to add memories to an existing collection. They must confirm it.'),
  };
}

/** A short, current picture of the archive for the system prompt. Everything else is fetched with tools. */
export async function agentContext(user: string) {
  const all = await memoriesOf(user);
  const q = await db();
  const [people, counts] = await Promise.all([
    q<{ name: string }>('select name from people where user_id=$1 order by updated_at desc limit 20', [user]),
    q<{ entries: number; threads: number; collections: number }>(
      `select (select count(*)::int from entries where user_id=$1) as entries, (select count(*)::int from threads where user_id=$1) as threads, (select count(*)::int from collections where user_id=$1) as collections`,
      [user],
    ),
  ]);
  return { memories: all, recent: all.slice(-12), people: people.map((p) => p.name), counts: { memories: all.length, ...counts[0] } };
}

