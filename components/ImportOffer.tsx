'use client';

import { useEffect, useState } from 'react';
import { api, useStore } from '@/lib/store';
import { LEGACY_CHAT_KEY } from '@/lib/memory';
import { LEGACY_ARCHIVES_KEY } from '@/lib/archive';
import { LEGACY_PLACES_KEY } from '@/lib/places';

type Found = { messages: unknown[]; entries: unknown[]; places: Record<string, unknown> | null; memories: number };

const DONE = 'whatstayed:import-handled';

function read(key: string) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * An earlier version kept everything in this browser. If any of it is still here,
 * offer — once — to bring it into the account. Nothing moves unless the person says so.
 */
export default function ImportOffer({ email }: { email: string }) {
  const [, store] = useStore();
  const [found, setFound] = useState<Found | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DONE)) return;
    } catch {
      return;
    }
    const messages = read(LEGACY_CHAT_KEY);
    const entries = read(LEGACY_ARCHIVES_KEY);
    const places = read(LEGACY_PLACES_KEY);
    const msgs = Array.isArray(messages) ? messages : [];
    const memories = msgs.reduce(
      (n: number, m: { parts?: { type?: string }[] }) => n + (m.parts || []).filter((p) => p.type === 'tool-plantMemory').length,
      0,
    );
    const ents = Array.isArray(entries) ? entries.filter((e) => e && typeof e.body === 'string' && e.body.trim()) : [];
    if (!memories && !ents.length && !msgs.length) return;
    setFound({ messages: msgs, entries: ents, places: places && typeof places === 'object' ? places : null, memories });
  }, []);

  if (!found) return null;

  function settle(clear: boolean) {
    try {
      localStorage.setItem(DONE, new Date().toISOString());
      if (clear) [LEGACY_CHAT_KEY, LEGACY_ARCHIVES_KEY, LEGACY_PLACES_KEY].forEach((k) => localStorage.removeItem(k));
    } catch {
      /* storage unavailable */
    }
    setFound(null);
  }

  async function bring() {
    if (!found) return;
    setBusy(true);
    try {
      const r = await api<{ imported: { memories: number; entries: number; places: number; threads: number } }>('/api/import', {
        method: 'POST',
        json: { messages: found.messages, entries: found.entries, places: found.places ?? undefined },
      });
      await store.refresh();
      const n = r.imported;
      store.toast(`Brought in ${n.memories} ${n.memories === 1 ? 'memory' : 'memories'} and ${n.entries} ${n.entries === 1 ? 'page' : 'pages'}.`);
      settle(true);
      // the garden reads its conversation once on load
      if (location.pathname === '/') location.reload();
    } catch (e) {
      store.toast(e instanceof Error ? e.message : 'That didn’t work. Nothing was changed.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="loc-veil" role="dialog" aria-modal="true" aria-labelledby="imp-t">
      <div className="loc-ed">
        <h2 id="imp-t" className="loc-t">Something is still kept in this browser</h2>
        <p className="sheet-p">
          Before accounts, What Stayed kept things only on this device. We found{' '}
          {[
            found.memories ? `${found.memories} ${found.memories === 1 ? 'memory' : 'memories'}` : null,
            found.entries.length ? `${found.entries.length} ${found.entries.length === 1 ? 'page' : 'pages'} from your Journal` : null,
          ]
            .filter(Boolean)
            .join(' and ') || 'an earlier conversation'}
          . Bring {found.memories + found.entries.length === 1 ? 'it' : 'them'} into {email}?
        </p>
        <p className="loc-note">Nothing already in your account is overwritten. Once it’s in, the copy in this browser is cleared.</p>
        <div className="loc-acts">
          <button type="button" className="quiet strong" onClick={bring} disabled={busy}>
            {busy ? 'Bringing them in…' : 'Bring them in'}
          </button>
          <button type="button" className="quiet" onClick={() => settle(false)} disabled={busy}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
