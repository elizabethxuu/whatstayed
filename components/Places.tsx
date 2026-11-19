'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import Masthead from './Masthead';
import Atlas from './Atlas';
import LocationEditor from './LocationEditor';
import ThreadPicker from './ThreadPicker';
import { echoOf, type Kept } from '@/lib/memory';
import { useStore } from '@/lib/store';
import MediaShelf from './MediaShelf';
import ThreadNote from './ThreadNote';
import { pageTitle } from './Pickers';
import { groupPlaces, locLine, placeKey, suggestionKey, usePlaces, type PlaceGroup } from '@/lib/places';

export default function Places() {
  const [snap] = useStore();
  const memories: Kept[] = snap.memories;
  const places = usePlaces();
  const params = useSearchParams();
  const router = useRouter();
  const openKey = params.get('p');
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ kind: 'place' | 'tie'; id: string } | null>(null);

  const groups = useMemo(() => groupPlaces(memories || [], places.store.locations), [memories, places.store.locations]);
  const keyOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) for (const i of g.items) m.set(i.memory.id, g.key);
    return m;
  }, [groups]);
  const links = useMemo(
    () =>
      places.store.threads
        .map((t) => ({ id: t.id, a: keyOf.get(t.a) || '', b: keyOf.get(t.b) || '' }))
        .filter((l) => l.a && l.b && l.a !== l.b),
    [places.store.threads, keyOf],
  );

  if (!memories) return <main className="places" aria-busy="true" />;

  const unplaced = memories.filter((m) => !places.store.locations[m.id]);
  const editingMem = editing ? memories.find((m) => m.id === editing.id) : undefined;
  const open = openKey ? groups.find((g) => g.key === openKey) : undefined;

  const editors = editingMem && editing && (
    <>
      {editing.kind === 'place' && (
        <LocationEditor
          memory={editingMem}
          current={places.store.locations[editingMem.id]}
          onClose={() => setEditing(null)}
          onSave={(loc) => {
            places.setLocation(editingMem.id, loc);
            setEditing(null);
            if (openKey && placeKey(loc) !== openKey) router.replace(`/places?p=${encodeURIComponent(placeKey(loc))}`);
          }}
          onRemove={
            places.store.locations[editingMem.id]
              ? () => {
                  places.removeLocation(editingMem.id);
                  setEditing(null);
                }
              : undefined
          }
        />
      )}
      {editing.kind === 'tie' && (
        <ThreadPicker
          from={editingMem}
          others={memories.filter((m) => m.id !== editingMem.id)}
          locations={places.store.locations}
          onClose={() => setEditing(null)}
          onTie={(other, note) => {
            places.tie(editingMem.id, other, 'you', note);
            setEditing(null);
          }}
        />
      )}
    </>
  );

  if (openKey) {
    return (
      <main className="places">
        <Masthead room="places" />
        {open ? (
          <PlacePage
            g={open}
            memories={memories}
            groups={groups}
            keyOf={keyOf}
            places={places}
            onEdit={(id) => setEditing({ kind: 'place', id })}
            onTie={(id) => setEditing({ kind: 'tie', id })}
          />
        ) : (
          <section className="pl-head">
            <Link href="/places" className="quiet">
              ← All places
            </Link>
            <p className="quiet-note">This place isn’t in your atlas any more.</p>
          </section>
        )}
        {editors}
      </main>
    );
  }

  const sel = selected ? groups.find((g) => g.key === selected) : undefined;
  const offMap = groups.filter((g) => g.lat === undefined);

  return (
    <main className="places">
      <Masthead room="places" />
      <section className="pl-head">
        <h1 className="arc-title">Places</h1>
        <p className="arc-sub">Some places never really leave us.</p>
      </section>

      <section className="pl-map">
        <Atlas groups={groups} links={links} selected={selected} onSelect={setSelected} />
        {sel && (
          <aside className={`pl-peek${(sel.lng ?? 0) > 15 ? ' left' : ''}`} aria-live="polite">
            <button type="button" className="x quiet" onClick={() => setSelected(null)}>
              Close
            </button>
            <p className="card-no">{[sel.region, sel.country].filter((x) => x && x !== sel.title).join(' · ') || 'A place'}</p>
            <h2 className="pl-peek-t">{sel.title}</h2>
            <p className="card-place">
              {sel.items.length} {sel.items.length === 1 ? 'memory' : 'memories'}
            </p>
            <ul>
              {sel.items.slice(0, 3).map(({ memory }) => (
                <li key={memory.id}>“{memory.moment}”</li>
              ))}
            </ul>
            <Link className="quiet strong" href={`/places?p=${encodeURIComponent(sel.key)}`}>
              Open this place →
            </Link>
          </aside>
        )}
        {groups.length === 0 && (
          <p className="pl-empty">
            {memories.length
              ? 'No places yet. Add a place to a memory below, and it will appear here.'
              : 'No places yet. Plant a memory in the garden, then give it a place.'}
          </p>
        )}
      </section>

      <section className="gazetteer">
        {groups.length > 0 && (
          <div>
            <h2 className="month-label">The places</h2>
            <ol className="gz-list">
              {groups.map((g) => (
                <li key={g.key}>
                  <Link href={`/places?p=${encodeURIComponent(g.key)}`} className="gz-row">
                    <span className="gz-name">{g.title}</span>
                    <span className="gz-country">{g.country && g.country !== g.title ? g.country : ''}</span>
                    <span className="gz-n">
                      {g.items.length} {g.items.length === 1 ? 'memory' : 'memories'}
                      {g.lat === undefined ? ' · not on the map' : ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
            {offMap.length > 0 && <p className="gz-hint">Places marked “not on the map” were typed by hand. Search for them to pin them.</p>}
          </div>
        )}
        {unplaced.length > 0 && (
          <div>
            <h2 className="month-label">Not yet placed</h2>
            <ol className="gz-list">
              {unplaced.map((m) => (
                <li key={m.id} className="gz-row static">
                  <span className="gz-name">{m.place}</span>
                  <span className="gz-moment">“{m.moment}”</span>
                  <button type="button" className="quiet" onClick={() => setEditing({ kind: 'place', id: m.id })}>
                    Add a place
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
      {editors}
    </main>
  );
}

function PlacePage({
  g,
  memories,
  groups,
  keyOf,
  places,
  onEdit,
  onTie,
}: {
  g: PlaceGroup;
  memories: Kept[];
  groups: PlaceGroup[];
  keyOf: Map<string, string>;
  places: ReturnType<typeof usePlaces>;
  onEdit: (id: string) => void;
  onTie: (id: string) => void;
}) {
  const ids = new Set(g.items.map((i) => i.memory.id));
  const ties = places.store.threads
    .filter((t) => ids.has(t.a) || ids.has(t.b))
    .map((t) => {
      const here = ids.has(t.a) ? t.a : t.b;
      const there = here === t.a ? t.b : t.a;
      const mHere = memories.find((m) => m.id === here);
      const mThere = memories.find((m) => m.id === there);
      if (!mHere || !mThere) return null;
      const otherKey = keyOf.get(there);
      const other = otherKey ? groups.find((x) => x.key === otherKey) : undefined;
      return { t, mHere, mThere, other };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // suggestions the agent made about memories here, still waiting for a yes or no
  const pending = g.items
    .map(({ memory }) => {
      const i = memories.findIndex((m) => m.id === memory.id);
      const j = i < 0 ? null : echoOf(memories, i);
      const k = memories.findIndex((m, idx) => idx > i && echoOf(memories, idx) === i);
      const otherIdx = j !== null ? j : k >= 0 ? k : null;
      if (otherIdx === null) return null;
      const other = memories[otherIdx];
      const key = suggestionKey(memory.id, other.id);
      if (places.store.dismissed.includes(key) || places.store.threads.some((t) => suggestionKey(t.a, t.b) === key)) return null;
      const because = (j !== null ? memory : other).because;
      return { memory, other, key, because };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const region = [g.region, g.country].filter((x) => x && x !== g.title);
  const [snap] = useStore();
  const pagesHere = snap.entries.filter((e) => e.location && placeKey(e.location) === g.key).sort((a, b) => b.createdAt - a.createdAt);

  return (
    <article className="pl-page">
      <Link href="/places" className="quiet back">
        ← All places
      </Link>
      <header className="pl-page-head">
        {region.length > 0 && <p className="card-no">{region.join(' · ')}</p>}
        <h1 className="arc-title">{g.title}</h1>
        <p className="arc-sub">
          {g.items.length === 1 ? 'One memory lives here.' : `${g.items.length} memories live here.`}
        </p>
      </header>

      <ol className="pl-mems">
        {g.items.map(({ memory, loc }) => (
          <li key={memory.id}>
            <p className="pl-where">
              {[loc.name !== g.title ? loc.name : null, loc.neighborhood].filter(Boolean).join(' · ') || locLine(loc)}
            </p>
            <blockquote className="pl-moment">“{memory.moment}”</blockquote>
            <p className="card-meta">
              {memory.when ? <span>{memory.when}</span> : null}
              <span>{memory.feeling}</span>
            </p>
            <MediaShelf owner={{ type: 'memory', id: memory.id }} compact />
            <p className="pl-acts">
              <button type="button" className="quiet" onClick={() => onEdit(memory.id)}>
                Edit place
              </button>
              <button type="button" className="quiet" onClick={() => onTie(memory.id)}>
                Tie a red thread…
              </button>
            </p>
          </li>
        ))}
      </ol>

      {pagesHere.length > 0 && (
        <section className="pl-ties">
          <h2 className="month-label">Pages written here</h2>
          <ul className="person-pages">
            {pagesHere.map((e) => (
              <li key={e.id}>
                <Link href={`/archives?e=${encodeURIComponent(e.id)}`} className="leaf">
                  <span className="leaf-date">{new Date(e.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                  <span className="leaf-body">{pageTitle(e)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(ties.length > 0 || pending.length > 0) && (
        <section className="pl-ties">
          <h2 className="month-label">Threads to other places</h2>
          <ul>
            {ties.map(({ t, mThere, other }) => (
              <li key={t.id} className="pl-tie">
                <span className="pl-tie-line" aria-hidden="true" />
                <span className="pl-tie-body">
                  {other && other.key !== g.key ? (
                    <Link href={`/places?p=${encodeURIComponent(other.key)}`} className="pl-tie-place">
                      {other.title}
                      {other.country && other.country !== other.title ? `, ${other.country}` : ''}
                    </Link>
                  ) : (
                    <span className="pl-tie-place">{other ? 'Here, too' : mThere.place}</span>
                  )}
                  <span className="pl-tie-moment">“{mThere.moment}”</span>
                  {t.note && <span className="pl-tie-note">{t.note}</span>}
                </span>
                <ThreadNote note={t.note} label={mThere.place} onSave={(n) => places.updateThread(t.id, n)} />
                <button type="button" className="untie" onClick={() => places.untie(t.id)}>
                  untie
                </button>
              </li>
            ))}
          </ul>
          {pending.map((p) => (
            <div key={p.key} className="card-suggest">
              <p>
                “{p.memory.moment.length > 50 ? p.memory.moment.slice(0, 48) + '…' : p.memory.moment}” might connect to {p.other.place}
                {p.because ? `: ${p.because}` : ''}. Tie them?
              </p>
              <button type="button" className="quiet" onClick={() => places.tie(p.memory.id, p.other.id, 'suggested', p.because)}>
                Tie them
              </button>
              <button type="button" className="quiet" onClick={() => places.dismiss(p.key)}>
                Not really
              </button>
            </div>
          ))}
        </section>
      )}
    </article>
  );
}
