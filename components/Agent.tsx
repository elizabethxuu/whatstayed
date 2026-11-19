'use client';

import type { UIMessage } from 'ai';
import { useMemo } from 'react';
import { api, useStore } from '@/lib/store';

/* ---------- what the agent is doing, in the garden's own words ---------- */

const ACTIVITY: [RegExp, string][] = [
  [/^tool-(draftMemory|nameTrip)$/, 'Growing a new blossom'],
  [/^tool-(findRelatedMemories|proposeConnection|listConnections)$/, 'Connecting memories'],
  [/^tool-(findThemes|chronologicalSummary|surfaceForgottenDetails|proposeReflection)$/, 'Preparing a reflection'],
  [/^tool-(search\w+|getMemory|recallConversations|listCollections)$/, 'Searching the archive'],
  [/^tool-propose\w+$/, 'Preparing a suggestion'],
];

export function activityOf(messages: UIMessage[], status: string, listening: boolean): string | null {
  if (listening) return 'Listening';
  if (status === 'submitted') return 'Understanding';
  if (status !== 'streaming') return null;
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return 'Understanding';
  const parts = last.parts;
  const tail = parts[parts.length - 1] as { type: string; state?: string; text?: string } | undefined;
  if (tail?.type === 'text' && tail.text) return null;
  const working = [...parts].reverse().find((p) => p.type.startsWith('tool-')) as { type: string; state?: string } | undefined;
  if (working) {
    const hit = ACTIVITY.find(([re]) => re.test(working.type));
    if (hit) return hit[1];
  }
  return 'Understanding';
}

export function AgentState({ label }: { label: string }) {
  return (
    <p className="agent-state" role="status" aria-live="polite">
      <span className="agent-petals" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="agent-label" key={label}>
        {label}
      </span>
    </p>
  );
}

/* ---------- memories the agent found: open one, and it lights on the tree ---------- */

type Found = { id: string; place: string; moment: string; when?: string; title?: string };

/** The memories found by the agent's latest searches, in the order it found them. */
export function foundIn(m?: UIMessage): Found[] {
  if (!m) return [];
  const out: Found[] = [];
  for (const p of m.parts as { type: string; state?: string; output?: unknown }[]) {
    if (p.state !== 'output-available') continue;
    const o = p.output as { memories?: Found[]; related?: Found[] } | undefined;
    if (p.type === 'tool-searchMemories' && Array.isArray(o?.memories)) out.push(...o.memories);
    if (p.type === 'tool-findRelatedMemories' && Array.isArray(o?.related)) out.push(...o.related);
  }
  const seen = new Set<string>();
  return out.filter((f) => f && typeof f.id === 'string' && !seen.has(f.id) && (seen.add(f.id), true)).slice(0, 6);
}

export function FoundMemories({ found, onOpen }: { found: Found[]; onOpen: (id: string) => void }) {
  const [snap] = useStore();
  const here = found.filter((f) => snap.memories.some((m) => m.id === f.id));
  if (!here.length) return null;
  return (
    <div className="agent-found" aria-label="Found in your garden">
      <p className="agent-k">Found in your garden</p>
      <ul>
        {here.map((f) => (
          <li key={f.id}>
            <button type="button" onClick={() => onOpen(f.id)}>
              <span className="agent-found-place">{f.place}</span>
              <span className="agent-found-moment">{f.title || f.moment}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- proposals: nothing changes until the person says so ---------- */

export type Action = {
  id: string;
  kind: string;
  summary: string;
  status: 'pending' | 'done' | 'declined' | 'failed';
  error?: string;
  payload: Record<string, unknown>;
  createdAt: number;
};

const VERB: Record<string, string> = {
  tie: 'Tie them',
  'update-memory': 'Make the change',
  'delete-memory': 'Delete it',
  'create-entry': 'Keep the page',
  'edit-entry': 'Replace the words',
  'save-reflection': 'Keep the reflection',
  'create-person': 'Add them',
  'update-person': 'Update',
  'create-collection': 'Start the collection',
  'add-to-collection': 'Add them',
};
const DONE: Record<string, string> = {
  tie: 'Tied. A red thread now joins them.',
  'update-memory': 'Changed.',
  'delete-memory': 'Deleted.',
  'create-entry': 'Kept in your Archives.',
  'edit-entry': 'The page now reads as shown.',
  'save-reflection': 'Kept in your Archives, marked as written by the agent.',
  'create-person': 'Added to People.',
  'update-person': 'Updated.',
  'create-collection': 'The collection is started.',
  'add-to-collection': 'Added to the collection.',
};

export function Proposals({ actions, onDecided }: { actions: Action[]; onDecided: (a: Action) => void }) {
  const [, store] = useStore();
  // pending ones, and anything decided in the last few minutes so the outcome is visible
  const shown = actions.filter((a) => a.status === 'pending' || Date.now() - a.createdAt < 10 * 60_000).slice(-4);
  if (!shown.length) return null;
  async function decide(a: Action, decision: 'confirm' | 'decline') {
    try {
      const r = await api<{ action: Action }>(`/api/actions/${encodeURIComponent(a.id)}`, { method: 'POST', json: { decision } });
      try {
        navigator.vibrate?.(decision === 'confirm' ? 14 : 6);
      } catch {
        /* not supported */
      }
      if (r.action.status === 'failed') store.toast(r.action.error || 'That couldn’t be done.', 'error');
      if (r.action.status === 'done') await store.refresh().catch(() => {});
      onDecided(r.action);
    } catch (e) {
      store.toast(e instanceof Error ? e.message : 'That couldn’t be done.', 'error');
    }
  }
  return (
    <ul className="agent-actions" aria-label="Suggestions waiting for you">
      {shown.map((a) => (
        <li key={a.id} className={`agent-action s-${a.status}${a.kind === 'delete-memory' ? ' grave' : ''}`}>
          <p className="agent-k">{a.kind === 'save-reflection' ? 'Suggested · written by the agent' : 'Suggested'}</p>
          <p className="agent-summary">{a.summary}</p>
          {a.kind === 'save-reflection' && typeof a.payload.body === 'string' && <p className="agent-reflection">{a.payload.body}</p>}
          {a.kind === 'edit-entry' && typeof a.payload.body === 'string' && <p className="agent-reflection">{a.payload.body}</p>}
          {a.status === 'pending' ? (
            <p className="agent-acts">
              <button type="button" className={`agent-yes${a.kind === 'delete-memory' ? ' danger' : ''}`} onClick={() => decide(a, 'confirm')}>
                {VERB[a.kind] ?? 'Confirm'}
              </button>
              <button type="button" className="quiet" onClick={() => decide(a, 'decline')}>
                Not now
              </button>
            </p>
          ) : (
            <p className="agent-outcome" role="status">
              {a.status === 'done' ? DONE[a.kind] ?? 'Done.' : a.status === 'declined' ? 'Left as it was.' : `That didn’t work: ${a.error ?? 'nothing was changed.'}`}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ---------- where to begin: prompts from what is really in the garden ---------- */

export type Mode = 'remember' | 'ask' | 'reflect';

export function usePrompts(mode: Mode, focusPlace?: string) {
  const [snap] = useStore();
  return useMemo(() => {
    const count = <T,>(xs: T[]) => {
      const c = new Map<T, number>();
      xs.forEach((x) => c.set(x, (c.get(x) ?? 0) + 1));
      return [...c.entries()].sort((a, b) => b[1] - a[1]);
    };
    const places = count(snap.memories.map((m) => snap.locations[m.id]?.city || m.place));
    const people = count(snap.links.filter((l) => l.kind === 'memory-person').map((l) => l.b))
      .map(([id, n]) => [snap.people.find((p) => p.id === id)?.name, n] as const)
      .filter((x): x is readonly [string, number] => !!x[0]);
    const out: string[] = [];
    if (mode === 'remember') {
      out.push('I want to remember a trip…');
      if (places[0]) out.push(`Something else from ${places[0][0]}…`);
      if (people[0]) out.push(`A day with ${people[0][0]}…`);
      out.push('A meal I still think about…');
    } else if (mode === 'ask') {
      if (focusPlace) out.push(`Connect this to my ${focusPlace} memories`);
      places.slice(0, 2).forEach(([p]) => out.push(`What do you remember about ${p}?`));
      if (people[0]) out.push(`What memories do I have with ${people[0][0]}?`);
      if (snap.talks.length > 1) out.push('What did I tell you about…');
    } else {
      if (snap.memories.length) out.push('Reflect on my garden');
      const years = count(snap.memories.map((m) => m.date?.slice(0, 4)).filter((y): y is string => !!y));
      if (years[0]) out.push(`Summarize ${years[0][0]} for me`);
      if (snap.entries.length > 2) out.push('What themes come up in my pages?');
      if (!snap.memories.length) out.push('Reflect on my garden');
    }
    return out.slice(0, 4);
  }, [snap, mode, focusPlace]);
}
