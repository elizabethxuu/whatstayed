'use client';

/**
 * The client's view of one person's garden. The server is the source of truth;
 * this keeps a live copy, sends every change to the API, and says plainly when something fails.
 * One store per page render (React context), so nothing is ever shared between people.
 */
import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { HandDraft, MemoryExtra, StoredDraft, TalkSummary } from './draft';
import type { Profile } from './profile';
import type { Memory, Kept } from './memory';
export type MemoryInput = Memory & { date?: string; title?: string; narrative?: string; tags?: string[]; extra?: MemoryExtra };
import type { Loc, Thread } from './places';
import type { Entry } from './archive';

export type Stored = Kept & { origin: 'agent' | 'you'; createdAt: number; updatedAt: number; date?: string; extra?: MemoryExtra };
export type Page = Entry & { location?: Loc; meta?: { favorite?: boolean; draft?: boolean; prompt?: string; ai?: boolean } };
export type Person = { id: string; name: string; relation?: string; description?: string; notes?: string; createdAt: number; updatedAt: number };
export type PersonInput = { name: string; relation?: string; description?: string; notes?: string };
export type LinkKind = 'memory-person' | 'entry-person' | 'entry-memory';
export type Link = { kind: LinkKind; a: string; b: string; note?: string };
export type Collection = { id: string; name: string; description?: string; cover?: string; createdAt: number; updatedAt: number };
export type CollectionInput = { name: string; description?: string; cover?: string | null };
export type CollectionItem = { collectionId: string; kind: 'memory' | 'entry'; id: string; position: number };
export type Letter = { id: string; openOn: string; writtenAt: number; openedAt?: number; body?: string; sealed: boolean };
export type Milestone = { id: string; title: string; onDate: string; note?: string };
export type MilestoneInput = { title: string; onDate: string; note?: string };

export type Media = {
  id: string;
  ownerType: 'memory' | 'entry' | 'person' | 'profile';
  ownerId: string;
  kind: 'photo' | 'voice';
  mime: string;
  size: number;
  durationMs?: number;
  createdAt: number;
};

export type Snapshot = {
  memories: Stored[];
  entries: Page[];
  people: Person[];
  links: Link[];
  collections: Collection[];
  collectionItems: CollectionItem[];
  letters: Letter[];
  milestones: Milestone[];
  locations: Record<string, Loc>;
  threads: Thread[];
  dismissed: string[];
  media: Media[];
  talks: TalkSummary[];
  profile: Profile;
  handDrafts: StoredDraft[];
};

export type ReviewItem = {
  draftId: string;
  title: string;
  moment: string;
  narrative?: string;
  place: string;
  when?: string;
  date?: string;
  feeling?: string;
  weight: 'light' | 'tender' | 'heavy';
  people: { name: string; personId?: string }[];
  senses: string[];
  objects: string[];
  unsure: string[];
  location?: Loc | null;
  connections: { to: string; note?: string }[];
};
export type ReviewInput = { items: ReviewItem[]; trip?: { title: string; collection: boolean; narrative?: string } };

export type Toast = { id: number; text: string; kind: 'ok' | 'error' };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json: payload, ...rest } = init || {};
  let r: Response;
  try {
    r = await fetch(path, {
      ...rest,
      headers: payload !== undefined ? { 'Content-Type': 'application/json', ...(rest.headers || {}) } : rest.headers,
      body: payload !== undefined ? JSON.stringify(payload) : rest.body,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'You seem to be offline. Nothing was changed.');
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && typeof window !== 'undefined' && !path.startsWith('/api/auth') && path !== '/api/account') {
      window.location.assign('/welcome');
    }
    throw new ApiError(r.status, (data && data.error) || 'Something went wrong. Please try again.');
  }
  return data as T;
}

type Listener = () => void;

function createStore(initial: Snapshot) {
  let snap = initial;
  let toasts: Toast[] = [];
  const subs = new Set<Listener>();
  const emit = () => subs.forEach((f) => f());
  const set = (fn: (s: Snapshot) => Snapshot) => {
    snap = fn(snap);
    emit();
  };
  let tid = 0;
  const toast = (text: string, kind: Toast['kind'] = 'ok') => {
    const t = { id: ++tid, text, kind };
    toasts = [...toasts, t].slice(-3);
    emit();
    setTimeout(() => {
      toasts = toasts.filter((x) => x.id !== t.id);
      emit();
    }, kind === 'error' ? 6000 : 2800);
  };

  async function refresh() {
    const s = await api<Snapshot>('/api/state');
    snap = s;
    emit();
  }

  /** Run a change; on failure, say so and put things back as the server has them. */
  async function attempt<T>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> {
    try {
      const r = await fn();
      if (ok) toast(ok);
      return r;
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Something went wrong.', 'error');
      refresh().catch(() => {});
      return undefined;
    }
  }

  const without = <T extends { id: string }>(xs: T[], id: string) => xs.filter((x) => x.id !== id);

  return {
    get: () => snap,
    toasts: () => toasts,
    subscribe: (f: Listener) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    toast,
    refresh,

    /* memories */
    createMemory: (m: MemoryInput) =>
      attempt(async () => {
        const { memory } = await api<{ memory: Stored }>('/api/memories', { method: 'POST', json: m });
        set((s) => ({ ...s, memories: [...s.memories, memory] }));
        return memory;
      }, 'Planted.'),
    updateMemory: (id: string, m: MemoryInput) =>
      attempt(async () => {
        const { memory } = await api<{ memory: Stored }>(`/api/memories/${encodeURIComponent(id)}`, { method: 'PATCH', json: m });
        set((s) => ({ ...s, memories: s.memories.map((x) => (x.id === id ? memory : x)) }));
        return memory;
      }, 'Saved.'),
    deleteMemory: (id: string) =>
      attempt(async () => {
        await api(`/api/memories/${encodeURIComponent(id)}`, { method: 'DELETE' });
        set((s) => {
          const locations = { ...s.locations };
          delete locations[id];
          return {
            ...s,
            memories: without(s.memories, id),
            locations,
            threads: s.threads.filter((t) => t.a !== id && t.b !== id),
            media: s.media.filter((x) => !(x.ownerType === 'memory' && x.ownerId === id)),
          };
        });
        refresh().catch(() => {});
        return true;
      }, 'Memory deleted.'),

    /* places & threads */
    setLocation: (memId: string, loc: Loc) =>
      attempt(async () => {
        set((s) => ({ ...s, locations: { ...s.locations, [memId]: loc } }));
        await api(`/api/memories/${encodeURIComponent(memId)}/location`, { method: 'PUT', json: loc });
        return true;
      }, 'Place saved.'),
    removeLocation: (memId: string) =>
      attempt(async () => {
        set((s) => {
          const locations = { ...s.locations };
          delete locations[memId];
          return { ...s, locations };
        });
        await api(`/api/memories/${encodeURIComponent(memId)}/location`, { method: 'DELETE' });
        return true;
      }, 'Place removed.'),
    tie: (a: string, b: string, origin: Thread['origin'], note?: string) =>
      attempt(async () => {
        const n = note?.trim() || undefined;
        const { id } = await api<{ id: string }>('/api/threads', { method: 'POST', json: { a, b, origin, note: n } });
        set((s) => (s.threads.some((t) => t.id === id) ? s : { ...s, threads: [...s.threads, { id, a, b, note: n, origin, createdAt: Date.now() }] }));
        return id;
      }, 'Thread added.'),
    updateThread: (id: string, note?: string) =>
      attempt(async () => {
        const n = note?.trim() || undefined;
        await api(`/api/threads/${encodeURIComponent(id)}`, { method: 'PATCH', json: { note: n } });
        set((s) => ({ ...s, threads: s.threads.map((t) => (t.id === id ? { ...t, note: n } : t)) }));
        return true;
      }, 'Saved.'),
    untie: (id: string) =>
      attempt(async () => {
        set((s) => ({ ...s, threads: without(s.threads, id) }));
        await api(`/api/threads/${encodeURIComponent(id)}`, { method: 'DELETE' });
        return true;
      }, 'Thread removed.'),
    dismiss: (key: string) =>
      attempt(async () => {
        set((s) => ({ ...s, dismissed: [...new Set([...s.dismissed, key])] }));
        await api('/api/suggestions/dismiss', { method: 'POST', json: { key } });
        return true;
      }),

    /* archives */
    saveEntry: async (e: { id: string; body: string; createdAt: number; meta?: { favorite?: boolean; draft?: boolean; prompt?: string } }) => {
      // no toast: the page shows its own quiet save state
      const { entry } = await api<{ entry: Page | null }>(`/api/entries/${encodeURIComponent(e.id)}`, { method: 'PUT', json: e });
      set((s) => ({
        ...s,
        entries: entry ? [...without(s.entries, e.id), { ...entry, location: s.entries.find((x) => x.id === e.id)?.location }] : without(s.entries, e.id),
        media: entry ? s.media : s.media.filter((m) => !(m.ownerType === 'entry' && m.ownerId === e.id)),
      }));
      return entry;
    },
    /** Last-chance save while the tab closes. */
    beaconEntry: (e: { id: string; body: string; createdAt: number }) => {
      try {
        const blob = new Blob([JSON.stringify(e)], { type: 'application/json' });
        return navigator.sendBeacon(`/api/entries/${encodeURIComponent(e.id)}`, blob);
      } catch {
        return false;
      }
    },
    deleteEntry: (id: string) =>
      attempt(async () => {
        await api(`/api/entries/${encodeURIComponent(id)}`, { method: 'DELETE' });
        set((s) => ({ ...s, entries: without(s.entries, id), media: s.media.filter((m) => !(m.ownerType === 'entry' && m.ownerId === id)) }));
        refresh().catch(() => {});
        return true;
      }, 'The page is gone.'),

    /* photographs & voice */
    addMedia: (owner: { type: Media['ownerType']; id: string }, kind: Media['kind'], file: Blob, durationMs?: number) =>
      attempt(async () => {
        const f = new FormData();
        f.set('file', file, kind === 'photo' ? 'photo' : 'voice');
        f.set('ownerType', owner.type);
        f.set('ownerId', owner.id);
        f.set('kind', kind);
        if (durationMs) f.set('durationMs', String(Math.round(durationMs)));
        const { media } = await api<{ media: Media }>('/api/media', { method: 'POST', body: f });
        set((s) => ({ ...s, media: [...s.media, media] }));
        return media;
      }, kind === 'photo' ? 'Photo added.' : 'Recording added.'),
    deleteMedia: (id: string) =>
      attempt(async () => {
        set((s) => ({ ...s, media: without(s.media, id) }));
        await api(`/api/media/${encodeURIComponent(id)}`, { method: 'DELETE' });
        return true;
      }, 'Removed.'),

    setEntryLocation: (id: string, loc: Loc | null) =>
      attempt(async () => {
        await api(`/api/entries/${encodeURIComponent(id)}/location`, loc ? { method: 'PUT', json: loc } : { method: 'DELETE' });
        set((s) => ({ ...s, entries: s.entries.map((e) => (e.id === id ? { ...e, location: loc ?? undefined } : e)) }));
        return true;
      }, loc ? 'Place saved.' : 'Place removed.'),

    /* people */
    createPerson: (p: PersonInput) =>
      attempt(async () => {
        const { person } = await api<{ person: Person }>('/api/people', { method: 'POST', json: p });
        set((s) => ({ ...s, people: [...s.people, person].sort((a, b) => a.name.localeCompare(b.name)) }));
        return person;
      }, 'Added.'),
    updatePerson: (id: string, p: PersonInput) =>
      attempt(async () => {
        const { person } = await api<{ person: Person }>(`/api/people/${encodeURIComponent(id)}`, { method: 'PATCH', json: p });
        set((s) => ({ ...s, people: s.people.map((x) => (x.id === id ? person : x)) }));
        return person;
      }, 'Saved.'),
    deletePerson: (id: string) =>
      attempt(async () => {
        await api(`/api/people/${encodeURIComponent(id)}`, { method: 'DELETE' });
        set((s) => ({
          ...s,
          people: without(s.people, id),
          links: s.links.filter((l) => !(l.kind !== 'entry-memory' && l.b === id)),
          media: s.media.filter((m) => !(m.ownerType === 'person' && m.ownerId === id)),
        }));
        return true;
      }, 'Removed. Their memories stay.'),

    /* links */
    link: (l: Link, quiet = false) =>
      attempt(async () => {
        await api('/api/links', { method: 'POST', json: l });
        set((s) => ({ ...s, links: [...s.links.filter((x) => !(x.kind === l.kind && x.a === l.a && x.b === l.b)), l] }));
        return true;
      }, quiet ? undefined : 'Connected.'),
    unlink: (l: Omit<Link, 'note'>) =>
      attempt(async () => {
        set((s) => ({ ...s, links: s.links.filter((x) => !(x.kind === l.kind && x.a === l.a && x.b === l.b)) }));
        await api('/api/links', { method: 'DELETE', json: l });
        return true;
      }),

    /* collections */
    createCollection: (c: CollectionInput) =>
      attempt(async () => {
        const { collection } = await api<{ collection: Collection }>('/api/collections', { method: 'POST', json: c });
        set((s) => ({ ...s, collections: [...s.collections, collection] }));
        return collection;
      }, 'Collection made.'),
    updateCollection: (id: string, c: CollectionInput) =>
      attempt(async () => {
        const { collection } = await api<{ collection: Collection }>(`/api/collections/${encodeURIComponent(id)}`, { method: 'PATCH', json: c });
        set((s) => ({ ...s, collections: s.collections.map((x) => (x.id === id ? collection : x)) }));
        return collection;
      }, 'Saved.'),
    deleteCollection: (id: string) =>
      attempt(async () => {
        await api(`/api/collections/${encodeURIComponent(id)}`, { method: 'DELETE' });
        set((s) => ({ ...s, collections: without(s.collections, id), collectionItems: s.collectionItems.filter((i) => i.collectionId !== id) }));
        return true;
      }, 'Collection removed. Everything in it stays.'),
    addToCollection: (cid: string, kind: CollectionItem['kind'], id: string) =>
      attempt(async () => {
        await api(`/api/collections/${encodeURIComponent(cid)}/items`, { method: 'POST', json: { kind, id } });
        set((s) => {
          if (s.collectionItems.some((i) => i.collectionId === cid && i.kind === kind && i.id === id)) return s;
          const pos = Math.max(-1, ...s.collectionItems.filter((i) => i.collectionId === cid).map((i) => i.position)) + 1;
          return { ...s, collectionItems: [...s.collectionItems, { collectionId: cid, kind, id, position: pos }] };
        });
        return true;
      }, 'Added to the collection.'),
    removeFromCollection: (cid: string, kind: CollectionItem['kind'], id: string) =>
      attempt(async () => {
        set((s) => ({ ...s, collectionItems: s.collectionItems.filter((i) => !(i.collectionId === cid && i.kind === kind && i.id === id)) }));
        await api(`/api/collections/${encodeURIComponent(cid)}/items`, { method: 'DELETE', json: { kind, id } });
        return true;
      }),

    /* letters */
    writeLetter: (body: string, openOn: string) =>
      attempt(async () => {
        const { letters } = await api<{ letters: Letter[] }>('/api/letters', { method: 'POST', json: { body, openOn } });
        set((s) => ({ ...s, letters }));
        return true;
      }, 'Sealed. It will wait for you.'),
    openLetter: (id: string) =>
      attempt(async () => {
        const { letters } = await api<{ letters: Letter[] }>(`/api/letters/${encodeURIComponent(id)}`, { method: 'POST' });
        set((s) => ({ ...s, letters }));
        return true;
      }),
    deleteLetter: (id: string) =>
      attempt(async () => {
        await api(`/api/letters/${encodeURIComponent(id)}`, { method: 'DELETE' });
        set((s) => ({ ...s, letters: without(s.letters, id) }));
        return true;
      }, 'The letter is gone.'),

    /* milestones */
    addMilestone: (m: MilestoneInput) =>
      attempt(async () => {
        const { id } = await api<{ id: string }>('/api/milestones', { method: 'POST', json: m });
        set((s) => ({ ...s, milestones: [...s.milestones, { id, ...m }].sort((a, b) => a.onDate.localeCompare(b.onDate)) }));
        return id;
      }, 'Marked.'),
    updateMilestone: (id: string, m: MilestoneInput) =>
      attempt(async () => {
        await api(`/api/milestones/${encodeURIComponent(id)}`, { method: 'PATCH', json: m });
        set((s) => ({ ...s, milestones: s.milestones.map((x) => (x.id === id ? { id, ...m } : x)).sort((a, b) => a.onDate.localeCompare(b.onDate)) }));
        return true;
      }, 'Saved.'),
    deleteMilestone: (id: string) =>
      attempt(async () => {
        await api(`/api/milestones/${encodeURIComponent(id)}`, { method: 'DELETE' });
        set((s) => ({ ...s, milestones: without(s.milestones, id) }));
        return true;
      }, 'Removed.'),

    /* you */
    saveProfile: (patch: Profile, quiet = false) =>
      attempt(async () => {
        const { profile } = await api<{ profile: Profile }>('/api/profile', { method: 'PUT', json: patch });
        set((s) => ({ ...s, profile }));
        return profile;
      }, quiet ? undefined : 'Saved.'),
    clearProfile: () =>
      attempt(async () => {
        const { profile } = await api<{ profile: Profile }>('/api/profile', { method: 'DELETE' });
        set((s) => ({ ...s, profile, media: s.media.filter((m) => m.ownerType !== 'profile') }));
        return true;
      }, 'Your personal details were deleted. Your memories are untouched.'),
    changePassword: (current: string, next: string) =>
      attempt(async () => {
        await api('/api/auth/password', { method: 'PUT', json: { current, next } });
        return true;
      }, 'Password changed. Other devices have been signed out.'),

    /* pages: favourites and drafts */
    setEntryMeta: (id: string, meta: { favorite?: boolean; draft?: boolean }) =>
      attempt(async () => {
        set((s) => ({ ...s, entries: s.entries.map((e) => (e.id === id ? { ...e, meta: { ...e.meta, ...meta } } : e)) }));
        await api(`/api/entries/${encodeURIComponent(id)}/meta`, { method: 'PATCH', json: meta });
        return true;
      }),

    /* memories being added by hand */
    saveHandDraft: (id: string | null, data: HandDraft) =>
      attempt(async () => {
        const r = await api<{ id: string }>(id ? `/api/drafts/${encodeURIComponent(id)}` : '/api/drafts', { method: id ? 'PUT' : 'POST', json: data });
        const { drafts } = await api<{ drafts: StoredDraft[] }>('/api/drafts');
        set((s) => ({ ...s, handDrafts: drafts }));
        return r.id;
      }),
    deleteHandDraft: (id: string) =>
      attempt(async () => {
        await api(`/api/drafts/${encodeURIComponent(id)}`, { method: 'DELETE' });
        set((s) => ({ ...s, handDrafts: s.handDrafts.filter((d) => d.id !== id) }));
        return true;
      }),

    /* conversations */
    newTalk: (mode: 'free' | 'trip') =>
      attempt(async () => {
        const { talk } = await api<{ talk: TalkSummary }>('/api/talks', { method: 'POST', json: { mode } });
        set((s) => ({ ...s, talks: [talk, ...s.talks] }));
        return talk;
      }),
    deleteTalk: (id: string) =>
      attempt(async () => {
        await api(`/api/talks/${encodeURIComponent(id)}`, { method: 'DELETE' });
        set((s) => ({ ...s, talks: s.talks.filter((t) => t.id !== id) }));
        return true;
      }, 'Conversation deleted. Memories saved from it stay in the garden.'),
    /** Save the reviewed memories. Returns what was made, or undefined (with a notice) on failure. */
    reviewSave: (talkId: string, input: ReviewInput) =>
      attempt(async () => {
        const r = await api<{ made: { draftId: string; memoryId: string }[]; collectionId?: string; entryId?: string }>(
          `/api/talks/${encodeURIComponent(talkId)}/review`,
          { method: 'POST', json: input },
        );
        await refresh();
        return r;
      }),
    discardDrafts: (talkId: string, ids?: string[]) =>
      attempt(async () => {
        await api(`/api/talks/${encodeURIComponent(talkId)}/discard`, { method: 'POST', json: { ids } });
        refresh().catch(() => {});
        return true;
      }, ids?.length === 1 ? 'Draft discarded.' : 'Drafts discarded.'),

    /* the garden as a whole */
    clearGarden: () =>
      attempt(async () => {
        await api('/api/garden/clear', { method: 'POST' });
        set((s) => ({ ...s, memories: [], locations: {}, threads: [], dismissed: [], talks: [], media: s.media.filter((m) => m.ownerType !== 'memory') }));
        refresh().catch(() => {});
        return true;
      }, 'Garden cleared.'),
  };
}

export type Store = ReturnType<typeof createStore>;

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ initial, children }: { initial: Snapshot; children: ReactNode }) {
  const [store] = useState(() => createStore(initial));
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStoreApi(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

/** A live snapshot; re-renders when anything changes. */
export function useStore(): [Snapshot, Store] {
  const s = useStoreApi();
  const snap = useSyncExternalStore(s.subscribe, s.get, s.get);
  return [snap, s];
}

export function useToasts(): Toast[] {
  const s = useStoreApi();
  return useSyncExternalStore(s.subscribe, s.toasts, s.toasts);
}

export const mediaUrl = (id: string) => `/api/media/${id}`;

/* ---------- reading the snapshot ---------- */

export const peopleOf = (snap: Snapshot, kind: 'memory-person' | 'entry-person', id: string) =>
  snap.links.filter((l) => l.kind === kind && l.a === id).map((l) => snap.people.find((p) => p.id === l.b)).filter((p): p is Person => !!p);
export const memoriesOfPerson = (snap: Snapshot, pid: string) =>
  snap.links.filter((l) => l.kind === 'memory-person' && l.b === pid).map((l) => snap.memories.find((m) => m.id === l.a)).filter((m): m is Stored => !!m);
export const pagesOfPerson = (snap: Snapshot, pid: string) =>
  snap.links.filter((l) => l.kind === 'entry-person' && l.b === pid).map((l) => snap.entries.find((e) => e.id === l.a)).filter((e): e is Page => !!e);
export const memoriesOfPage = (snap: Snapshot, eid: string) =>
  snap.links.filter((l) => l.kind === 'entry-memory' && l.a === eid).map((l) => ({ m: snap.memories.find((m) => m.id === l.b), note: l.note })).filter((x): x is { m: Stored; note: string | undefined } => !!x.m);
export const pagesOfMemory = (snap: Snapshot, mid: string) =>
  snap.links.filter((l) => l.kind === 'entry-memory' && l.b === mid).map((l) => ({ e: snap.entries.find((e) => e.id === l.a), note: l.note })).filter((x): x is { e: Page; note: string | undefined } => !!x.e);
export const itemsOf = (snap: Snapshot, cid: string) =>
  snap.collectionItems
    .filter((i) => i.collectionId === cid)
    .sort((a, b) => a.position - b.position)
    .map((i) => (i.kind === 'memory' ? { kind: 'memory' as const, m: snap.memories.find((m) => m.id === i.id) } : { kind: 'entry' as const, e: snap.entries.find((e) => e.id === i.id) }))
    .filter((x) => ('m' in x ? !!x.m : !!x.e));
export const firstPhoto = (snap: Snapshot, type: Media['ownerType'], id: string) => snap.media.find((m) => m.ownerType === type && m.ownerId === id && m.kind === 'photo');
export const mediaFor = (snap: Snapshot, type: Media['ownerType'], id: string) =>
  snap.media.filter((m) => m.ownerType === type && m.ownerId === id);
