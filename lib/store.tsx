'use client';

/**
 * The client's view of one person's garden. The server is the source of truth;
 * this keeps a live copy, sends every change to the API, and says plainly when something fails.
 * One store per page render (React context), so nothing is ever shared between people.
 */
import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Memory, Kept } from './memory';
import type { Loc, Thread } from './places';
import type { Entry } from './archive';

export type Stored = Kept & { origin: 'agent' | 'you'; createdAt: number; updatedAt: number };

export type Media = {
  id: string;
  ownerType: 'memory' | 'entry';
  ownerId: string;
  kind: 'photo' | 'voice';
  mime: string;
  size: number;
  durationMs?: number;
  createdAt: number;
};

export type Snapshot = {
  memories: Stored[];
  entries: Entry[];
  locations: Record<string, Loc>;
  threads: Thread[];
  dismissed: string[];
  media: Media[];
};

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
    createMemory: (m: Memory) =>
      attempt(async () => {
        const { memory } = await api<{ memory: Stored }>('/api/memories', { method: 'POST', json: m });
        set((s) => ({ ...s, memories: [...s.memories, memory] }));
        return memory;
      }, 'Planted.'),
    updateMemory: (id: string, m: Memory) =>
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
        return true;
      }, 'The memory has been let go.'),

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
      }, 'A red thread, tied.'),
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
      }, 'Untied.'),
    dismiss: (key: string) =>
      attempt(async () => {
        set((s) => ({ ...s, dismissed: [...new Set([...s.dismissed, key])] }));
        await api('/api/suggestions/dismiss', { method: 'POST', json: { key } });
        return true;
      }),

    /* archives */
    saveEntry: async (e: { id: string; body: string; createdAt: number }) => {
      // no toast: the page shows its own quiet save state
      const { entry } = await api<{ entry: Entry | null }>(`/api/entries/${encodeURIComponent(e.id)}`, { method: 'PUT', json: e });
      set((s) => ({
        ...s,
        entries: entry ? [...without(s.entries, e.id), entry] : without(s.entries, e.id),
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
      }, kind === 'photo' ? 'Photograph kept.' : 'Recording kept.'),
    deleteMedia: (id: string) =>
      attempt(async () => {
        set((s) => ({ ...s, media: without(s.media, id) }));
        await api(`/api/media/${encodeURIComponent(id)}`, { method: 'DELETE' });
        return true;
      }, 'Removed.'),

    /* the garden as a whole */
    clearGarden: () =>
      attempt(async () => {
        await api('/api/garden/clear', { method: 'POST' });
        set((s) => ({ ...s, memories: [], locations: {}, threads: [], dismissed: [], media: s.media.filter((m) => m.ownerType !== 'memory') }));
        return true;
      }, 'The garden is clear. Your Archives stay.'),
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
export const mediaFor = (snap: Snapshot, type: Media['ownerType'], id: string) =>
  snap.media.filter((m) => m.ownerType === type && m.ownerId === id);
