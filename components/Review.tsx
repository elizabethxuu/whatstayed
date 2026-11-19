'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { StoredDraft, TalkSummary } from '@/lib/draft';
import { locLine, searchPlaces, type Loc } from '@/lib/places';
import { useStore, type ReviewItem } from '@/lib/store';
import MediaShelf from './MediaShelf';
import { confirmSheet } from '@/lib/confirm';

type Edit = ReviewItem & { keep: boolean; suggestions: { to: string; label: string; reason: string; accepted: boolean }[]; locState: 'finding' | 'found' | 'none' | 'set' };

const WEIGHTS = [
  ['light', 'White'],
  ['tender', 'Mist'],
  ['heavy', 'Marked'],
] as const;

/**
 * The memory review: nothing from a conversation reaches the garden until the person has read it here,
 * changed what's wrong, and chosen what to keep.
 */
export default function Review({
  talk,
  drafts,
  story,
  onClose,
  onSaved,
}: {
  talk: TalkSummary;
  drafts: StoredDraft[];
  story: string; // the person's own words from the conversation, for a trip's page
  onClose: () => void;
  onSaved: (memoryIds: string[]) => void;
}) {
  const [snap, store] = useStore();
  const waiting = useMemo(() => drafts.filter((d) => d.status === 'draft'), [drafts]);
  const [items, setItems] = useState<Edit[]>(() =>
    waiting.map((d) => {
      const x = d.data;
      return {
        draftId: d.id,
        keep: true,
        title: x.title,
        moment: x.moment,
        narrative: x.narrative ?? '',
        place: x.place,
        when: x.when ?? '',
        date: x.date ?? '',
        feeling: x.feeling ?? '',
        weight: x.weight ?? 'light',
        people: (x.people ?? []).map((name) => {
          const known = snap.people.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
          return known ? { name: known.name, personId: known.id } : { name };
        }),
        senses: x.senses ?? [],
        objects: x.objects ?? [],
        unsure: x.unsure ?? [],
        location: null,
        connections: [],
        locState: 'finding',
        suggestions: (x.related ?? [])
          .map((r) => {
            const m = snap.memories.find((mm) => mm.id === r.id);
            const other = waiting.find((dd) => dd.id === r.id);
            if (!m && !other) return null;
            return { to: r.id, label: m ? `${m.place} — ${m.moment}` : `${other!.data.place} — ${other!.data.title}`, reason: r.reason, accepted: false };
          })
          .filter((s): s is NonNullable<typeof s> => s !== null),
      };
    }),
  );
  const [trip, setTrip] = useState({ title: talk.trip?.title ?? talk.title, collection: true, narrative: story });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<{ ids: string[]; collectionId?: string } | null>(null);
  const isTrip = talk.mode === 'trip';

  // Find each place on the map (OpenStreetMap), one at a time and politely. The person can change it.
  const located = useRef(false);
  useEffect(() => {
    if (located.current) return;
    located.current = true;
    let stop = false;
    (async () => {
      const cache = new Map<string, Loc | null>();
      for (let i = 0; i < items.length; i++) {
        if (stop) return;
        const q = [items[i].place, talk.trip?.place && talk.trip.place !== items[i].place ? talk.trip.place : ''].filter(Boolean).join(', ');
        let loc = cache.get(q);
        if (loc === undefined) {
          try {
            loc = (await searchPlaces(q))[0] ?? null;
          } catch {
            loc = null;
          }
          cache.set(q, loc);
          await new Promise((r) => setTimeout(r, 1100));
        }
        setItems((xs) => xs.map((x, j) => (j === i && x.locState === 'finding' ? { ...x, location: loc ?? null, locState: loc ? 'found' : 'none' } : x)));
      }
    })();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const set = (i: number, patch: Partial<Edit>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const chosen = items.filter((x) => x.keep);

  function validate(list: Edit[]) {
    const e: Record<string, string> = {};
    for (const x of list) {
      if (!x.title.trim()) e[x.draftId + 'title'] = 'Give it a title.';
      if (x.moment.trim().length < 2) e[x.draftId + 'moment'] = 'Add a line about the moment.';
      if (!x.place.trim()) e[x.draftId + 'place'] = 'Add a place.';
      if (x.date && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(x.date)) e[x.draftId + 'date'] = 'A year, a month (2025-10) or a day (2025-10-14).';
    }
    setErrors(e);
    return !Object.keys(e).length;
  }

  async function save(all: boolean) {
    const list = all ? items : chosen;
    if (!list.length) return store.toast('Choose at least one memory to save.', 'error');
    if (!validate(list)) return;
    setBusy(true);
    const r = await store.reviewSave(talk.id, {
      items: list.map((x) => ({
        draftId: x.draftId,
        title: x.title.trim(),
        moment: x.moment.trim(),
        narrative: x.narrative?.trim() || undefined,
        place: x.place.trim(),
        when: x.when?.trim() || undefined,
        date: x.date?.trim() || undefined,
        feeling: x.feeling?.trim() || undefined,
        weight: x.weight,
        people: x.people,
        senses: x.senses,
        objects: x.objects,
        unsure: x.unsure,
        location: x.location ?? (x.place.trim() ? { name: x.place.trim(), source: 'manual' as const, updatedAt: Date.now() } : null),
        connections: x.suggestions.filter((s) => s.accepted && (list.some((l) => l.draftId === s.to) || !waiting.some((w) => w.id === s.to))).map((s) => ({ to: s.to, note: s.reason })),
      })),
      trip: isTrip ? { title: trip.title.trim() || talk.title || 'A trip', collection: trip.collection, narrative: trip.narrative.trim() || undefined } : undefined,
    });
    setBusy(false);
    if (!r) return;
    const ids = r.made.map((m) => m.memoryId);
    store.toast(ids.length === 1 ? 'Saved. A new blossom is opening.' : `Saved ${ids.length} memories. New blossoms are opening.`);
    setSaved({ ids, collectionId: r.collectionId });
    onSaved(ids);
  }

  async function discardAll() {
    if (!(await confirmSheet({ title: 'Discard every draft?', body: 'The conversation itself stays.', yes: 'Discard drafts', danger: true }))) return;
    const ok = await store.discardDrafts(talk.id);
    if (ok) onClose();
  }

  async function discardOne(i: number) {
    const ok = await store.discardDrafts(talk.id, [items[i].draftId]);
    if (ok) setItems((xs) => xs.filter((_, j) => j !== i));
  }

  if (saved) {
    const mems = saved.ids.map((id) => snap.memories.find((m) => m.id === id)).filter(Boolean) as typeof snap.memories;
    return (
      <div className="loc-veil review-veil">
        <section className="review" role="dialog" aria-modal="true" aria-labelledby="rvT">
          <p className="loc-k">Saved</p>
          <h2 id="rvT" className="rv-title">{mems.length === 1 ? 'One new blossom' : `${mems.length} new blossoms`}</h2>
          <p className="rv-sub">They’re in the garden now, and in Places and the Timeline where they have a place or a date. Add photographs if you have them.</p>
          <ol className="rv-list">
            {mems.map((m) => (
              <li key={m.id} className="rv-item saved">
                <p className="rv-saved-title">{m.extra?.title ?? m.place}</p>
                <p className="rv-saved-moment">{m.moment}</p>
                <MediaShelf owner={{ type: 'memory', id: m.id }} compact />
              </li>
            ))}
          </ol>
          <div className="rv-foot">
            {saved.collectionId && (
              <Link className="quiet" href={`/collections?c=${encodeURIComponent(saved.collectionId)}`}>
                See the trip as a collection
              </Link>
            )}
            <button type="button" className="welcome-go" onClick={onClose} autoFocus>
              Done
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="loc-veil review-veil" onClick={() => !busy && onClose()}>
      <section className="review" role="dialog" aria-modal="true" aria-labelledby="rvT" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="x" onClick={onClose} disabled={busy} aria-label="Close the review">
          Close
        </button>
        <p className="loc-k">Review</p>
        {isTrip ? (
          <label className="rv-trip-title">
            <span className="sr">Trip title</span>
            <input value={trip.title} maxLength={80} onChange={(e) => setTrip({ ...trip, title: e.target.value })} placeholder="Where, and when" />
          </label>
        ) : (
          <h2 id="rvT" className="rv-title">
            {items.length === 1 ? 'One memory from this conversation' : `${items.length} memories from this conversation`}
          </h2>
        )}
        {isTrip && <h2 id="rvT" className="sr">Review this trip</h2>}
        <p className="rv-sub">Nothing is saved until you choose. Change anything that isn’t right; fields marked “not sure” are ones you weren’t certain of or that were worked out for you.</p>

        {items.length === 0 && <p className="rv-empty">No drafts are waiting. Keep talking, and memories will be drafted here as you go.</p>}

        <ol className="rv-list">
          {items.map((x, i) => {
            const err = (k: string) => errors[x.draftId + k];
            const unsure = (k: string) => x.unsure.includes(k);
            return (
              <li key={x.draftId} className={`rv-item${x.keep ? '' : ' off'}`}>
                <label className="rv-keep">
                  <input type="checkbox" checked={x.keep} onChange={(e) => set(i, { keep: e.target.checked })} />
                  <span className="sr">Keep this memory</span>
                </label>
                <div className="rv-body">
                  <label className="rv-field rv-t">
                    <span className="sr">Title</span>
                    <input value={x.title} maxLength={80} onChange={(e) => set(i, { title: e.target.value })} aria-invalid={err('title') ? true : undefined} />
                    {unsure('title') && <em className="unsure">not sure</em>}
                    {err('title') && <em className="field-err">{err('title')}</em>}
                  </label>
                  <label className="rv-field rv-m">
                    <span className="sr">The moment</span>
                    <textarea rows={2} maxLength={600} value={x.moment} onChange={(e) => set(i, { moment: e.target.value })} aria-invalid={err('moment') ? true : undefined} />
                    {err('moment') && <em className="field-err">{err('moment')}</em>}
                  </label>

                  <div className="rv-grid">
                    <label className="rv-field">
                      <span>Where{unsure('place') && <em className="unsure">not sure</em>}</span>
                      <input value={x.place} maxLength={80} onChange={(e) => set(i, { place: e.target.value, locState: 'none', location: null })} aria-invalid={err('place') ? true : undefined} />
                      {err('place') && <em className="field-err">{err('place')}</em>}
                      <PlaceLine edit={x} onFind={(loc) => set(i, { location: loc, locState: loc ? 'set' : 'none' })} />
                    </label>
                    <label className="rv-field">
                      <span>When{(unsure('when') || unsure('date')) && <em className="unsure">not sure</em>}</span>
                      <input value={x.when} maxLength={60} placeholder="When, in your words" onChange={(e) => set(i, { when: e.target.value })} />
                      <input
                        className="rv-date"
                        value={x.date}
                        maxLength={10}
                        placeholder="Year and month, for the Timeline"
                        aria-label="Date for the Timeline"
                        onChange={(e) => set(i, { date: e.target.value.trim() })}
                        aria-invalid={err('date') ? true : undefined}
                      />
                      {err('date') && <em className="field-err">{err('date')}</em>}
                    </label>
                  </div>

                  <div className="rv-field">
                    <span>Who was there{unsure('people') && <em className="unsure">not sure</em>}</span>
                    <Chips
                      values={x.people.map((p) => p.name + (p.personId ? '' : ' · new'))}
                      onRemove={(k) => set(i, { people: x.people.filter((_, j) => j !== k) })}
                      onAdd={(name) => {
                        const known = snap.people.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
                        set(i, { people: [...x.people, known ? { name: known.name, personId: known.id } : { name }] });
                      }}
                      placeholder="Add a name"
                    />
                  </div>

                  {(x.senses.length > 0 || x.objects.length > 0) && (
                    <div className="rv-field">
                      <span>Details</span>
                      <Chips
                        values={[...x.senses, ...x.objects]}
                        onRemove={(k) => (k < x.senses.length ? set(i, { senses: x.senses.filter((_, j) => j !== k) }) : set(i, { objects: x.objects.filter((_, j) => j !== k - x.senses.length) }))}
                        onAdd={(d) => set(i, { senses: [...x.senses, d] })}
                        placeholder="Add a detail"
                      />
                    </div>
                  )}

                  <details className="rv-more">
                    <summary>More</summary>
                    <label className="rv-field">
                      <span>In their own words</span>
                      <textarea rows={3} maxLength={2000} value={x.narrative} onChange={(e) => set(i, { narrative: e.target.value })} />
                    </label>
                    <div className="rv-grid">
                      <label className="rv-field">
                        <span>In a word</span>
                        <input value={x.feeling} maxLength={40} onChange={(e) => set(i, { feeling: e.target.value })} />
                      </label>
                      <fieldset className="mem-weight rv-weight">
                        <legend>Blossom</legend>
                        {WEIGHTS.map(([v, label]) => (
                          <label key={v} className={x.weight === v ? 'on' : ''}>
                            <input type="radio" name={`w-${x.draftId}`} checked={x.weight === v} onChange={() => set(i, { weight: v })} />
                            <i className={`w-${v}`} aria-hidden="true" />
                            {label}
                          </label>
                        ))}
                      </fieldset>
                    </div>
                  </details>

                  {x.suggestions.map((s, k) => (
                    <div key={s.to} className={`rv-suggest${s.accepted ? ' on' : ''}`}>
                      <p>
                        Might connect to <span className="rv-s-label">{s.label}</span>
                      </p>
                      <label className="rv-s-note">
                        <span className="sr">Why they connect</span>
                        <input
                          value={s.reason}
                          maxLength={80}
                          onChange={(e) => set(i, { suggestions: x.suggestions.map((y, j) => (j === k ? { ...y, reason: e.target.value } : y)) })}
                        />
                      </label>
                      <button type="button" className="quiet" aria-pressed={s.accepted} onClick={() => set(i, { suggestions: x.suggestions.map((y, j) => (j === k ? { ...y, accepted: !y.accepted } : y)) })}>
                        {s.accepted ? 'Will be tied ✓' : 'Tie a red thread'}
                      </button>
                      {!s.accepted && (
                        <button type="button" className="quiet" onClick={() => set(i, { suggestions: x.suggestions.filter((_, j) => j !== k) })}>
                          Not really
                        </button>
                      )}
                    </div>
                  ))}

                  <p className="rv-item-acts">
                    <button type="button" className="quiet danger" onClick={() => discardOne(i)}>
                      Discard this draft
                    </button>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        {isTrip && items.length > 0 && (
          <div className="rv-trip">
            <label className="rv-check">
              <input type="checkbox" checked={trip.collection} onChange={(e) => setTrip({ ...trip, collection: e.target.checked })} />
              Keep the trip together as a collection
            </label>
            <label className="rv-field">
              <span>The trip, in your words (kept as a page in the Archives)</span>
              <textarea rows={5} maxLength={20000} value={trip.narrative} onChange={(e) => setTrip({ ...trip, narrative: e.target.value })} />
            </label>
          </div>
        )}

        {items.length > 0 && (
          <div className="rv-foot">
            <button type="button" className="quiet danger" onClick={discardAll} disabled={busy}>
              Discard the draft
            </button>
            <span className="rv-foot-r">
              {chosen.length !== items.length && chosen.length > 0 && (
                <button type="button" className="quiet" onClick={() => save(false)} disabled={busy}>
                  Save {chosen.length} selected
                </button>
              )}
              <button type="button" className="welcome-go" onClick={() => save(chosen.length === items.length)} disabled={busy || chosen.length === 0}>
                {busy ? 'Saving…' : chosen.length === items.length ? (items.length === 1 ? 'Save it' : `Save all ${items.length}`) : `Save ${chosen.length}`}
              </button>
            </span>
          </div>
        )}
      </section>
    </div>
  );
}

function PlaceLine({ edit, onFind }: { edit: Edit; onFind: (loc: Loc | null) => void }) {
  const [hits, setHits] = useState<Loc[] | null>(null);
  const [busy, setBusy] = useState(false);
  async function find() {
    setBusy(true);
    try {
      setHits((await searchPlaces(edit.place)).slice(0, 4));
    } catch {
      setHits([]);
    }
    setBusy(false);
  }
  if (hits)
    return (
      <span className="rv-hits">
        {hits.length === 0 && <em>Nothing found. It will be kept as written, without a pin.</em>}
        {hits.map((h, k) => (
          <button
            key={k}
            type="button"
            className="quiet"
            onClick={() => {
              onFind(h);
              setHits(null);
            }}
          >
            {locLine(h)}
          </button>
        ))}
        <button type="button" className="quiet" onClick={() => setHits(null)}>
          cancel
        </button>
      </span>
    );
  return (
    <span className="rv-loc">
      {edit.locState === 'finding' ? (
        <em>Finding it on the map…</em>
      ) : edit.location ? (
        <>
          <span className="rv-pin" aria-hidden="true" /> {locLine(edit.location)}
        </>
      ) : (
        <em>Not on the map yet</em>
      )}{' '}
      <button type="button" className="untie" onClick={find} disabled={busy || !edit.place.trim()}>
        {busy ? 'searching…' : edit.location ? 'change' : 'find'}
      </button>
    </span>
  );
}

function Chips({ values, onRemove, onAdd, placeholder }: { values: string[]; onRemove: (i: number) => void; onAdd: (v: string) => void; placeholder: string }) {
  const [v, setV] = useState('');
  return (
    <span className="chips">
      {values.map((c, i) => (
        <span key={c + i} className="chip">
          {c}
          <button type="button" aria-label={`Remove ${c}`} onClick={() => onRemove(i)}>
            ×
          </button>
        </span>
      ))}
      <input
        className="chip-add"
        value={v}
        maxLength={80}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            if (v.trim()) onAdd(v.trim());
            setV('');
          }
        }}
        onBlur={() => {
          if (v.trim()) onAdd(v.trim());
          setV('');
        }}
      />
    </span>
  );
}
