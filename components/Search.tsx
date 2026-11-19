'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Masthead from './Masthead';
import { pageTitle } from './Pickers';
import { peopleOf, useStore } from '@/lib/store';
import { groupPlaces, locLine, placeTitle } from '@/lib/places';

type Hit = { key: string; href: string; k: string; title: string; text?: string };

function snippet(text: string, q: string) {
  const t = text.replace(/\s+/g, ' ').trim();
  const at = t.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return t.length > 160 ? t.slice(0, 158) + '…' : t;
  const s = Math.max(0, at - 60);
  return (s ? '…' : '') + t.slice(s, s + 170) + (s + 170 < t.length ? '…' : '');
}

function Mark({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'));
  return <>{parts.map((p, i) => (p.toLowerCase() === q.toLowerCase() ? <mark key={i}>{p}</mark> : <Fragment key={i}>{p}</Fragment>))}</>;
}

/** One search across everything kept: memories, pages, places, people, collections, opened letters. */
export default function Search() {
  const [snap] = useStore();
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(params.get('q') || '');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    const t = setTimeout(() => router.replace(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : '/search', { scroll: false }), 300);
    return () => clearTimeout(t);
  }, [q, router]);

  const ql = q.trim().toLowerCase();
  const groups = useMemo(() => {
    if (!ql) return [];
    const has = (...xs: (string | undefined | null)[]) => xs.some((x) => x && x.toLowerCase().includes(ql));
    const mem: Hit[] = snap.memories
      .filter((m) => {
        const loc = snap.locations[m.id];
        return has(m.place, m.moment, m.feeling, m.when, m.date, loc && locLine(loc), ...peopleOf(snap, 'memory-person', m.id).map((p) => p.name));
      })
      .map((m) => ({ key: m.id, href: `/?m=${encodeURIComponent(m.id)}`, k: [snap.locations[m.id] ? placeTitle(snap.locations[m.id]) : m.place, m.when].filter(Boolean).join(' · '), title: `“${m.moment}”` }));
    const pages: Hit[] = [...snap.entries]
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter((e) => has(e.body, e.location && locLine(e.location), ...peopleOf(snap, 'entry-person', e.id).map((p) => p.name)))
      .map((e) => ({
        key: e.id,
        href: `/archives?e=${encodeURIComponent(e.id)}`,
        k: new Date(e.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }),
        title: pageTitle(e),
        text: snippet(e.body, q.trim()),
      }));
    const places: Hit[] = groupPlaces(snap.memories, snap.locations)
      .filter((g) => has(g.title, g.country, g.region, ...g.items.map((i) => i.loc.name), ...g.items.map((i) => i.loc.neighborhood)))
      .map((g) => ({ key: g.key, href: `/places?p=${encodeURIComponent(g.key)}`, k: [g.region, g.country].filter((x) => x && x !== g.title).join(' · '), title: g.title, text: g.items.length === 1 ? '1 memory' : `${g.items.length} memories live here.` }));
    const people: Hit[] = snap.people
      .filter((p) => has(p.name, p.relation, p.description, p.notes))
      .map((p) => ({ key: p.id, href: `/people?p=${encodeURIComponent(p.id)}`, k: p.relation || 'Someone', title: p.name, text: p.description || (p.notes && has(p.notes) ? snippet(p.notes, q.trim()) : undefined) }));
    const cols: Hit[] = snap.collections
      .filter((c) => has(c.name, c.description))
      .map((c) => ({ key: c.id, href: `/collections?c=${encodeURIComponent(c.id)}`, k: 'Collection', title: c.name, text: c.description }));
    const letters: Hit[] = snap.letters
      .filter((l) => !l.sealed && has(l.body))
      .map((l) => ({ key: l.id, href: `/letters#${l.id}`, k: `For ${l.openOn}`, title: 'A letter to my future self', text: snippet(l.body || '', q.trim()) }));
    return [
      { label: 'Memories', hits: mem },
      { label: 'Pages', hits: pages },
      { label: 'Places', hits: places },
      { label: 'People', hits: people },
      { label: 'Collections', hits: cols },
      { label: 'Letters', hits: letters },
    ].filter((g) => g.hits.length);
  }, [ql, q, snap]);

  const total = groups.reduce((n, g) => n + g.hits.length, 0);
  const sealed = snap.letters.filter((l) => l.sealed).length;

  return (
    <main className="people search-room">
      <Masthead room="search" />
      <section className="search-head">
        <label htmlFor="everything" className="sr">
          Search everything you’ve kept
        </label>
        <input
          id="everything"
          ref={input}
          type="search"
          className="search-big"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="A place, a person, a word…"
          spellCheck={false}
          autoComplete="off"
        />
        <p className="arc-count" aria-live="polite">
          {ql ? (total ? `${total} ${total === 1 ? 'thing' : 'things'} found` : 'Nothing found') : 'Memories, pages, places, people, collections and opened letters'}
        </p>
      </section>

      {ql && total === 0 && (
        <p className="quiet-note">
          No results for “{q.trim()}”.{sealed ? ' Sealed letters aren’t searched until they open.' : ''}
        </p>
      )}
      <div className="results">
        {groups.map((g) => (
          <section key={g.label} className="result-group">
            <h2 className="month-label">
              {g.label} <span>{g.hits.length}</span>
            </h2>
            <ul>
              {g.hits.slice(0, 30).map((h) => (
                <li key={h.key}>
                  <Link href={h.href} className="leaf">
                    {h.k && <span className="leaf-date">{h.k}</span>}
                    <span className="leaf-body">
                      <Mark text={h.title} q={q.trim()} />
                    </span>
                    {h.text && h.text.trim() !== h.title.trim() && (
                      <span className="result-text">
                        <Mark text={h.text} q={q.trim()} />
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
