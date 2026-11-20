'use client';

import Link from 'next/link';
import Masthead from './Masthead';
import { ArchiveCounts } from './Growth';
import { useStore } from '@/lib/store';
import { placeTitle } from '@/lib/places';

const day = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const firstLine = (s: string) => s.trim().split('\n')[0].slice(0, 90) || 'An untitled page';

/** The Archive, all of it: what was kept most recently, and a door into each kind of thing kept. */
export default function ArchiveAll() {
  const [snap] = useStore();
  const memories = [...snap.memories].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  const pages = [...snap.entries].filter((e) => e.body.trim()).sort((a, b) => b.createdAt - a.createdAt).slice(0, 4);
  const places = new Set(snap.memories.map((m) => (snap.locations[m.id]?.city || m.place || '').trim().toLowerCase()).filter(Boolean)).size;
  const doors: { href: string; label: string; n: number; one: string; many: string }[] = [
    { href: '/archives', label: 'Journal', n: snap.entries.length, one: 'page', many: 'pages' },
    { href: '/places', label: 'Places', n: places, one: 'place', many: 'places' },
    { href: '/people', label: 'People', n: snap.people.length, one: 'person', many: 'people' },
    { href: '/timeline', label: 'Timeline', n: snap.memories.length, one: 'memory in time', many: 'memories in time' },
    { href: '/collections', label: 'Collections', n: snap.collections.length, one: 'collection', many: 'collections' },
    { href: '/letters', label: 'Letters', n: snap.letters.length, one: 'letter', many: 'letters' },
  ];
  const empty = snap.memories.length === 0 && snap.entries.length === 0;
  return (
    <main className="archive-all">
      <Masthead room="archive" />
      <section className="arc-head">
        <h1 className="arc-title">The Archive</h1>
        <p className="arc-sub">Everything you have kept, in one place.</p>
        <ArchiveCounts pages={snap.entries.length} />
      </section>

      {empty ? (
        <p className="quiet-note">
          Nothing here yet. <Link href="/today">Begin in Today</Link>, or <Link href="/archives?new=1">write a page</Link>.
        </p>
      ) : (
        <>
          {memories.length > 0 && (
            <section className="all-block" aria-labelledby="allM">
              <h2 id="allM" className="all-k">
                Recent memories
              </h2>
              <ul className="all-list">
                {memories.map((m) => (
                  <li key={m.id}>
                    <Link href={`/memory/${m.id}`}>
                      <span className="all-title">{m.extra?.title || m.moment}</span>
                      <span className="all-meta">
                        {snap.locations[m.id] ? placeTitle(snap.locations[m.id]) : m.place}
                        {m.when || m.date ? ` · ${m.when || m.date}` : ''}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {pages.length > 0 && (
            <section className="all-block" aria-labelledby="allP">
              <h2 id="allP" className="all-k">
                Recent pages
              </h2>
              <ul className="all-list">
                {pages.map((e) => (
                  <li key={e.id}>
                    <Link href={`/archives?e=${encodeURIComponent(e.id)}`}>
                      <span className="all-title">{firstLine(e.body)}</span>
                      <span className="all-meta">{day(e.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section className="all-block" aria-labelledby="allD">
        <h2 id="allD" className="all-k">
          Return to
        </h2>
        <ul className="all-doors">
          {doors.map((d) => (
            <li key={d.href}>
              <Link href={d.href}>
                <span className="all-door">{d.label}</span>
                <span className="all-meta">
                  {d.n} {d.n === 1 ? d.one : d.many}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
