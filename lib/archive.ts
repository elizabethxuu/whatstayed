/** The Archives: free-form pages, kept only in this browser. */

export type Entry = {
  id: string;
  body: string;
  createdAt: number; // ms since epoch
  updatedAt: number;
};

const KEY = 'whatstayed:archives:v1';
/** Hand-off from an archive page to the garden's writing line. Never sent automatically. */
export const PREFILL_KEY = 'whatstayed:prefill';

export function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function loadEntries(): Entry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is Entry =>
        e && typeof e.id === 'string' && typeof e.body === 'string' && typeof e.createdAt === 'number',
    );
  } catch {
    return [];
  }
}

export function saveEntries(entries: Entry[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

/** Newest first. */
export function sortEntries(entries: Entry[]) {
  return [...entries].sort((a, b) => b.createdAt - a.createdAt);
}

export const fmt = {
  day: (t: number) =>
    new Date(t).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  short: (t: number) => new Date(t).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
  time: (t: number) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  month: (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
};
