'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Masthead from './Masthead';
import Flower from './Flower';
import { mediaFor, mediaUrl, useStore, type Stored } from '@/lib/store';
import { placeTitle } from '@/lib/places';

type Way = 'day' | 'month5' | 'summer' | 'city' | 'person';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** When a memory happened, as precisely as it was kept: its own date, or else the day it was kept. */
const dayOf = (m: Stored) => (m.date && m.date.length >= 7 ? m.date : new Date(m.createdAt).toISOString().slice(0, 10));
const fmtWhen = (m: Stored) => {
  if (m.when) return m.when;
  if (!m.date) return `Kept ${new Date(m.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
  const [y, mo, d] = m.date.split('-').map(Number);
  return d ? `${MONTHS[mo - 1]} ${d}, ${y}` : `${MONTHS[mo - 1]} ${y}`;
};

/**
 * Rewind: choose a way back, and the memories play in order, like turning the pages of an album.
 * Only memories with a matching date are shown for date-based rewinds; nothing is guessed.
 */
export default function Rewind() {
  const [snap] = useStore();
  const [way, setWay] = useState<Way | null>(null);
  const [city, setCity] = useState('');
  const [person, setPerson] = useState('');
  const [playing, setPlaying] = useState(false);
  const now = useMemo(() => new Date(), []);

  const cities = useMemo(() => [...new Set(snap.memories.map((m) => snap.locations[m.id]?.city || m.place))].sort(), [snap]);
  const people = useMemo(() => snap.people.filter((p) => snap.links.some((l) => l.kind === 'memory-person' && l.b === p.id)), [snap]);

  const { list, title, empty } = useMemo(() => {
    const y = now.getFullYear();
    const md = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const ym5 = `${y - 5}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const sortByDay = (xs: Stored[]) => [...xs].sort((a, b) => dayOf(a).localeCompare(dayOf(b)));
    switch (way) {
      case 'day':
        return {
          list: snap.memories.filter((m) => m.date?.length === 10 && m.date.slice(0, 4) === String(y - 1) && m.date.slice(5) === md),
          title: `This day last year: ${MONTHS[now.getMonth()]} ${now.getDate()}, ${y - 1}`,
          empty: 'Nothing is dated to this day last year yet. Add a date to a memory, and it will come back here.',
        };
      case 'month5':
        return {
          list: sortByDay(snap.memories.filter((m) => m.date?.slice(0, 7) === ym5)),
          title: `${MONTHS[now.getMonth()]} ${y - 5}, five years ago`,
          empty: `Nothing is dated to ${MONTHS[now.getMonth()]} ${y - 5} yet.`,
        };
      case 'summer': {
        // the most recent June–August that holds dated memories
        const summers = snap.memories.filter((m) => m.date && +m.date.slice(5, 7) >= 6 && +m.date.slice(5, 7) <= 8 && m.date.slice(0, 10) <= now.toISOString().slice(0, 10));
        const last = Math.max(...summers.map((m) => +m.date!.slice(0, 4)), 0);
        return {
          list: sortByDay(summers.filter((m) => +m.date!.slice(0, 4) === last)),
          title: last ? `My last summer: June to August ${last}` : 'My last summer',
          empty: 'No memories are dated between June and August yet.',
        };
      }
      case 'city':
        return {
          list: sortByDay(snap.memories.filter((m) => (snap.locations[m.id]?.city || m.place) === city)),
          title: city ? `${city}, from the first memory` : 'Choose a place',
          empty: 'Choose a place to begin.',
        };
      case 'person': {
        const ids = new Set(snap.links.filter((l) => l.kind === 'memory-person' && l.b === person).map((l) => l.a));
        const name = snap.people.find((p) => p.id === person)?.name;
        return { list: sortByDay(snap.memories.filter((m) => ids.has(m.id))), title: name ? `With ${name}` : 'Choose someone', empty: 'Choose someone to begin.' };
      }
      default:
        return { list: [], title: '', empty: '' };
    }
  }, [way, city, person, snap, now]);

  const WAYS: [Way, string, string][] = [
    ['day', 'This day last year', 'What happened on this date, a year ago'],
    ['month5', 'This month, five years ago', `${MONTHS[now.getMonth()]} ${now.getFullYear() - 5}`],
    ['summer', 'My last summer', 'June to August, the most recent one you kept'],
    ['city', 'My first memory of a place', 'Start at the beginning of a city'],
    ['person', 'Memories with someone', 'Everything you kept with them, in order'],
  ];

  return (
    <main className="rewind">
      <Masthead room="rewind" />
      <header className="arc-head">
        <h1 className="arc-title">Rewind</h1>
        <p className="arc-sub">Open the album at a different page. Your memories play in the order they happened.</p>
      </header>

      <ul className="rw-ways">
        {WAYS.map(([k, t, h]) => (
          <li key={k}>
            <button type="button" aria-pressed={way === k} onClick={() => setWay(k)}>
              <span className="rw-t">{t}</span>
              <span className="rw-h">{h}</span>
            </button>
          </li>
        ))}
      </ul>

      {way === 'city' && (
        <label className="arc-filter rw-pick">
          <span className="sr">Which place</span>
          <select value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">Choose a place…</option>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      )}
      {way === 'person' && (
        <label className="arc-filter rw-pick">
          <span className="sr">Who</span>
          <select value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="">Choose someone…</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {way && (
        <section className="rw-result" aria-live="polite">
          <p className="rw-title">{title}</p>
          {list.length === 0 ? (
            <p className="quiet-note">{empty}</p>
          ) : (
            <>
              <p className="rw-count">{list.length === 1 ? 'One memory' : `${list.length} memories`}</p>
              <button type="button" className="welcome-go" onClick={() => setPlaying(true)}>
                Play the album
              </button>
            </>
          )}
        </section>
      )}

      {playing && list.length > 0 && <Album list={list} title={title} onClose={() => setPlaying(false)} />}
    </main>
  );
}

/** A full-screen sequence, one memory at a time, slowly moving; tap or swipe to turn the page. */
function Album({ list, title, onClose }: { list: Stored[]; title: string; onClose: () => void }) {
  const [snap] = useStore();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const touch = useRef<number | null>(null);
  const last = list.length; // the final page asks what you remember now
  const go = useCallback((d: number) => setI((x) => Math.max(0, Math.min(last, x + d))), [last]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === ' ') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);
  useEffect(() => {
    if (paused || i >= last) return;
    const t = setTimeout(() => go(1), 7000);
    return () => clearTimeout(t);
  }, [i, paused, last, go]);

  const m = list[i];
  const photo = m ? mediaFor(snap, 'memory', m.id).find((x) => x.kind === 'photo') : undefined;
  const ask = `Looking back at ${title.replace(/:.*/, '').toLowerCase()}: ${list.slice(0, 4).map((x) => `“${x.extra?.title || x.moment}” (${x.place})`).join(', ')}. What do I remember about these now?`;

  return (
    <div
      className="album"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}
    >
      <ol className="album-bars" aria-hidden="true">
        {[...list, null].map((_, k) => (
          <li key={k} className={k < i ? 'done' : k === i ? (paused ? 'on paused' : 'on') : ''}>
            <i />
          </li>
        ))}
      </ol>
      <button type="button" className="album-x quiet" onClick={onClose}>
        Close
      </button>

      {m ? (
        <article className="album-page" key={m.id}>
          <div className="album-bg">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(photo.id)} alt="" />
            ) : (
              <Flower size={220} className="album-flower" />
            )}
          </div>
          <div className="album-words">
            <p className="album-when">{fmtWhen(m)}</p>
            <p className="album-place">{snap.locations[m.id] ? placeTitle(snap.locations[m.id]) : m.place}</p>
            <h2 className="album-title">{m.extra?.title || m.moment}</h2>
            {m.extra?.title && <p className="album-moment">{m.moment}</p>}
            {m.extra?.narrative && <p className="album-story">{m.extra.narrative.length > 280 ? m.extra.narrative.slice(0, 278) + '…' : m.extra.narrative}</p>}
            <Link className="quiet strong" href={`/memory/${m.id}`}>
              Open this memory
            </Link>
          </div>
        </article>
      ) : (
        <article className="album-page album-end">
          <Flower size={64} />
          <h2 className="album-title">This is what found its way back.</h2>
          <p className="album-moment">What do you remember about them now?</p>
          <p className="album-end-acts">
            <Link className="welcome-go" href={`/?ask=${encodeURIComponent(ask.slice(0, 400))}`}>
              Tell me what you remember
            </Link>
            <button type="button" className="quiet" onClick={() => setI(0)}>
              Play again
            </button>
          </p>
        </article>
      )}

      <button type="button" className="album-prev" aria-label="Previous" onClick={() => go(-1)} disabled={i === 0} />
      <button type="button" className="album-next" aria-label="Next" onClick={() => go(1)} disabled={i >= last} />
      <button type="button" className="album-pause quiet" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
        {paused ? 'Play' : 'Pause'}
      </button>
    </div>
  );
}
