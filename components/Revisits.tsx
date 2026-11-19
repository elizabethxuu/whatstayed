'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { revisits, type Revisit } from '@/lib/revisit';

/** A quiet line or two at the foot of the tree: what comes back today. */
export default function Revisits({ onOpen }: { onOpen: (memoryId: string) => void }) {
  const [snap] = useStore();
  const [items, setItems] = useState<Revisit[]>([]);
  // worked out in the browser, so "today" is the person's own day
  useEffect(() => setItems(revisits(snap).slice(0, 2)), [snap]);
  if (!items.length) return null;
  return (
    <aside className="revisits" aria-label="Today">
      {items.map((r) => (
        <p key={r.kind + r.id} className={`revisit r-${r.kind}`}>
          <span className="revisit-k">{r.label}</span>{' '}
          {r.kind === 'memory' ? (
            <button type="button" className="quiet" onClick={() => onOpen(r.id)}>
              {r.text}
            </button>
          ) : r.kind === 'entry' ? (
            <Link className="quiet" href={`/archives?e=${encodeURIComponent(r.id)}`}>
              {r.text}
            </Link>
          ) : r.kind === 'letter' ? (
            <Link className="quiet" href={`/letters#${r.id}`}>
              {r.text} Read it →
            </Link>
          ) : (
            <Link className="quiet" href="/timeline">
              {r.text}
            </Link>
          )}
        </p>
      ))}
    </aside>
  );
}
