'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, useStore } from '@/lib/store';

type R = { key: string; kind: string; title: string; evidence: string; ask?: string; open?: string; tie?: { a: string; b: string; reason: string } };

/** Gentle ways back into the archive, each with its evidence. Dismissable; can be turned off in You. */
export default function Rediscover() {
  const [snap, store] = useStore();
  const [items, setItems] = useState<R[] | null>(null);
  const memCount = snap.memories.length;
  const threadCount = snap.threads.length;
  useEffect(() => {
    api<{ suggestions: R[] }>('/api/rediscover')
      .then((r) => setItems(r.suggestions))
      .catch(() => setItems([]));
  }, [memCount, threadCount]);
  if (!items?.length) return null;
  const drop = (key: string) => setItems((xs) => (xs ?? []).filter((x) => x.key !== key));
  return (
    <section className="today-block rediscover" aria-labelledby="rdT">
      <h2 id="rdT">Rediscover</h2>
      <ul>
        {items.map((r) => (
          <li key={r.key} className={`rd rd-${r.kind}`}>
            <p className="rd-t">{r.title}</p>
            <p className="rd-e">{r.evidence}</p>
            <p className="rd-acts">
              {r.ask && (
                <Link className="quiet strong" href={`/?ask=${encodeURIComponent(r.ask)}`}>
                  Ask the garden
                </Link>
              )}
              {r.open && (
                <Link className="quiet strong" href={r.open}>
                  Open
                </Link>
              )}
              {r.tie && (
                <button
                  type="button"
                  className="quiet strong"
                  onClick={async () => {
                    const ok = await store.tie(r.tie!.a, r.tie!.b, 'suggested', r.tie!.reason);
                    if (ok) drop(r.key);
                  }}
                >
                  Tie them
                </button>
              )}
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  store.dismiss(r.key);
                  drop(r.key);
                }}
              >
                Not now
              </button>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
