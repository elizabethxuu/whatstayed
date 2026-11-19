/**
 * A safety copy of a page while it's being written, kept in this browser only until the account confirms it.
 * If the tab closes before the save lands (some browsers drop last-moment requests), the next visit sends it.
 * It is never the record: the account is. It is cleared as soon as the account has the same words.
 */
const BASE = 'whatstayed:unsent:';
let PREFIX = BASE + 'anon:';

/** Copies belong to one account, so another person signing in on this browser never receives them. */
export function setUnsentScope(account: string) {
  let h = 5381;
  for (let i = 0; i < account.length; i++) h = ((h << 5) + h + account.charCodeAt(i)) >>> 0;
  PREFIX = `${BASE}${h.toString(36)}:`;
}
type Unsent = { id: string; body: string; createdAt: number; at: number };

export function keepUnsent(id: string, body: string, createdAt: number) {
  try {
    localStorage.setItem(PREFIX + id, JSON.stringify({ id, body, createdAt, at: Date.now() } satisfies Unsent));
  } catch {
    /* storage unavailable: the normal saves still run */
  }
}

export function clearUnsent(id: string, body: string) {
  try {
    const raw = localStorage.getItem(PREFIX + id);
    if (raw && (JSON.parse(raw) as Unsent).body === body) localStorage.removeItem(PREFIX + id);
  } catch {
    /* storage unavailable */
  }
}

export function listUnsent(): Unsent[] {
  const out: Unsent[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      try {
        const u = JSON.parse(localStorage.getItem(k) || '') as Unsent;
        if (u && typeof u.body === 'string' && typeof u.id === 'string') out.push(u);
      } catch {
        localStorage.removeItem(k);
      }
    }
  } catch {
    /* storage unavailable */
  }
  return out;
}

export function dropUnsent(id: string) {
  try {
    localStorage.removeItem(PREFIX + id);
  } catch {
    /* storage unavailable */
  }
}
