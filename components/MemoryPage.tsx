'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Masthead from './Masthead';
import MediaShelf from './MediaShelf';
import MemoryEditor from './MemoryEditor';
import LocationEditor from './LocationEditor';
import ThreadPicker from './ThreadPicker';
import ThreadNote from './ThreadNote';
import { CollectionPicker, PeoplePicker, pageTitle } from './Pickers';
import { mediaFor, mediaUrl, pagesOfMemory, peopleOf, useStore } from '@/lib/store';
import { locLine, placeKey, placeTitle, usePlaces } from '@/lib/places';
import { confirmSheet } from '@/lib/confirm';
import { REVISITED } from './Today';

/** Every memory opens into its own page: its photographs, words, date, place, people and connections. */
export default function MemoryPage({ id }: { id: string }) {
  const [snap, store] = useStore();
  const places = usePlaces();
  const router = useRouter();
  const [editing, setEditing] = useState<'memory' | 'place' | 'people' | 'tie' | 'collect' | null>(null);
  const [view, setView] = useState<string | null>(null);
  const m = snap.memories.find((x) => x.id === id);

  // remembered on this device, for "Recently revisited" on Today
  useEffect(() => {
    if (!m) return;
    try {
      const list = JSON.parse(localStorage.getItem(REVISITED) || '[]') as string[];
      localStorage.setItem(REVISITED, JSON.stringify([id, ...list.filter((x) => x !== id)].slice(0, 12)));
    } catch {
      /* storage unavailable */
    }
  }, [id, m]);

  if (!m) {
    return (
      <main className="memory">
        <Masthead room="garden" />
        <section className="mem-page">
          <p className="rv-empty">This memory isn’t here any more.</p>
          <Link className="quiet strong" href="/">
            Back to the garden
          </Link>
        </section>
      </main>
    );
  }

  const loc = snap.locations[m.id];
  const people = peopleOf(snap, 'memory-person', m.id);
  const pages = pagesOfMemory(snap, m.id);
  const photos = mediaFor(snap, 'memory', m.id).filter((x) => x.kind === 'photo');
  const cols = snap.collectionItems
    .filter((c) => c.kind === 'memory' && c.id === m.id)
    .map((c) => snap.collections.find((k) => k.id === c.collectionId))
    .filter((c): c is NonNullable<typeof c> => !!c);
  const ties = places.store.threads
    .filter((t) => t.a === m.id || t.b === m.id)
    .map((t) => ({ t, other: snap.memories.find((o) => o.id === (t.a === m.id ? t.b : t.a)) }))
    .filter((x): x is { t: (typeof x)['t']; other: NonNullable<(typeof x)['other']> } => !!x.other);
  const date = m.date
    ? new Date(m.date + 'T12:00:00').toLocaleDateString('en-US', m.extra?.precision === 'year' ? { year: 'numeric' } : m.extra?.precision === 'month' ? { month: 'long', year: 'numeric' } : { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  const unsureWhen = m.extra?.unsure?.some((u) => u === 'when' || u === 'date');

  async function remove() {
    const ok = await confirmSheet({
      title: 'Delete this memory?',
      body: 'Its place, threads, photographs and recordings are deleted too. This can’t be undone.',
      yes: 'Delete memory',
      danger: true,
    });
    if (!ok) return;
    if (await store.deleteMemory(m!.id)) router.push('/');
  }

  return (
    <main className="memory">
      <Masthead room="garden" />
      <article className="mem-page">
        <p className="mem-back">
          <button type="button" className="quiet" onClick={() => (history.length > 1 ? router.back() : router.push('/'))}>
            ← Back
          </button>
          <Link className="quiet" href={`/?m=${encodeURIComponent(m.id)}`}>
            See it on the tree
          </Link>
        </p>

        {photos.length > 0 && (
          <div className={`mem-hero n${Math.min(photos.length, 3)}`}>
            {photos.slice(0, 3).map((ph) => (
              <button key={ph.id} type="button" onClick={() => setView(ph.id)} aria-label="Open photograph">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaUrl(ph.id)} alt="" decoding="async" />
              </button>
            ))}
          </div>
        )}

        <p className="mem-place">{loc ? placeTitle(loc) : m.place}</p>
        {m.extra?.title && <h1 className="mem-title">{m.extra.title}</h1>}
        {m.extra?.title ? <p className="mem-moment">{m.moment}</p> : <h1 className="mem-title mem-moment">{m.moment}</h1>}
        {m.extra?.narrative && <p className="mem-narrative">{m.extra.narrative}</p>}

        <dl className="mem-facts">
          {(m.when || date) && (
            <div>
              <dt>When</dt>
              <dd>
                {m.when || date}
                {m.when && date && m.when !== date ? <span className="mem-soft"> · {date}</span> : null}
                {unsureWhen && <em className="unsure">not sure</em>}
              </dd>
            </div>
          )}
          <div>
            <dt>Where</dt>
            <dd>
              {loc ? locLine(loc) : m.place}{' '}
              {loc?.lat !== undefined && (
                <Link className="quiet" href={`/places?p=${encodeURIComponent(placeKey(loc))}`}>
                  on the map
                </Link>
              )}
              <button type="button" className="untie" onClick={() => setEditing('place')}>
                {loc ? 'change' : 'add a place'}
              </button>
            </dd>
          </div>
          <div>
            <dt>With</dt>
            <dd>
              {people.length
                ? people.map((p, i) => (
                    <span key={p.id}>
                      {i ? ', ' : ''}
                      <Link href={`/people?p=${encodeURIComponent(p.id)}`}>{p.name}</Link>
                    </span>
                  ))
                : 'No one yet'}{' '}
              <button type="button" className="untie" onClick={() => setEditing('people')}>
                {people.length ? 'change' : 'who was there?'}
              </button>
            </dd>
          </div>
          {m.feeling && (
            <div>
              <dt>Mood</dt>
              <dd>{m.feeling}</dd>
            </div>
          )}
          {(m.extra?.senses?.length || m.extra?.objects?.length) ? (
            <div>
              <dt>Details</dt>
              <dd>{[...(m.extra?.senses ?? []), ...(m.extra?.objects ?? [])].join(' · ')}</dd>
            </div>
          ) : null}
          {m.extra?.tags?.length ? (
            <div>
              <dt>Tags</dt>
              <dd className="mem-tags">
                {m.extra.tags.map((t) => (
                  <Link key={t} href={`/search?q=${encodeURIComponent(t)}`} className="chip">
                    {t}
                  </Link>
                ))}
              </dd>
            </div>
          ) : null}
          {m.extra?.trip && (
            <div>
              <dt>Trip</dt>
              <dd>{m.extra.trip.title}</dd>
            </div>
          )}
        </dl>

        <section className="mem-section" aria-labelledby="mtT">
          <h2 id="mtT">Connections</h2>
          {ties.length === 0 && pages.length === 0 && cols.length === 0 && <p className="mem-soft">Not tied to anything yet.</p>}
          {ties.map(({ t, other }) => (
            <p key={t.id} className="card-thread">
              Tied to <Link href={`/memory/${other.id}`}>{other.extra?.title || `${other.place}: ${other.moment}`}</Link>
              {t.note ? ` · ${t.note}` : ''} <ThreadNote note={t.note} label={other.place} onSave={(n) => places.updateThread(t.id, n)} />
              <button type="button" className="untie" onClick={() => places.untie(t.id)}>
                untie
              </button>
            </p>
          ))}
          {pages.map(({ e, note }) => (
            <p key={e.id} className="mem-link">
              Written about in <Link href={`/archives?e=${encodeURIComponent(e.id)}`}>{pageTitle(e)}</Link>
              {note ? ` · ${note}` : ''}
            </p>
          ))}
          {cols.map((c) => (
            <p key={c.id} className="mem-link">
              In the collection <Link href={`/collections?c=${encodeURIComponent(c.id)}`}>{c.name}</Link>
            </p>
          ))}
          <p className="card-links">
            {snap.memories.length > 1 && (
              <button type="button" className="quiet" onClick={() => setEditing('tie')}>
                Tie a red thread…
              </button>
            )}
            <button type="button" className="quiet" onClick={() => setEditing('collect')}>
              Keep in a collection…
            </button>
          </p>
        </section>

        <section className="mem-section" aria-labelledby="mpT">
          <h2 id="mpT">Photographs and voice</h2>
          <MediaShelf owner={{ type: 'memory', id: m.id }} />
        </section>

        <p className="mem-acts">
          <button type="button" className="quiet strong" onClick={() => setEditing('memory')}>
            Edit
          </button>
          <button type="button" className="quiet danger" onClick={remove}>
            Delete
          </button>
        </p>
      </article>

      {view && (
        <div className="loc-veil light" onClick={() => setView(null)} role="dialog" aria-modal="true" aria-label="Photograph">
          <figure className="lightbox" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mediaUrl(view)} alt="" />
            <figcaption>
              <span />
              <button type="button" className="quiet" onClick={() => setView(null)} autoFocus>
                Close
              </button>
            </figcaption>
          </figure>
        </div>
      )}
      {editing === 'memory' && <MemoryEditor memory={m} onClose={() => setEditing(null)} onSave={(x) => store.updateMemory(m.id, x)} />}
      {editing === 'place' && (
        <LocationEditor
          memory={m}
          current={loc}
          onClose={() => setEditing(null)}
          onSave={(l) => {
            places.setLocation(m.id, l);
            setEditing(null);
          }}
          onRemove={
            loc
              ? () => {
                  places.removeLocation(m.id);
                  setEditing(null);
                }
              : undefined
          }
        />
      )}
      {editing === 'people' && (
        <PeoplePicker
          kicker={m.extra?.title || m.moment.slice(0, 50)}
          chosen={people.map((p) => p.id)}
          onToggle={(pid, on) => (on ? store.link({ kind: 'memory-person', a: m.id, b: pid }, true) : store.unlink({ kind: 'memory-person', a: m.id, b: pid }))}
          onClose={() => setEditing(null)}
        />
      )}
      {editing === 'collect' && <CollectionPicker kind="memory" id={m.id} onClose={() => setEditing(null)} />}
      {editing === 'tie' && (
        <ThreadPicker
          from={m}
          others={snap.memories.filter((o) => o.id !== m.id)}
          locations={places.store.locations}
          onClose={() => setEditing(null)}
          onTie={(other, note) => {
            places.tie(m.id, other, 'you', note);
            setEditing(null);
          }}
        />
      )}
    </main>
  );
}
