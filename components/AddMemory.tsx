'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { locLine, searchPlaces, type Loc } from '@/lib/places';
import { preparePhoto } from '@/lib/media';
import { confirmSheet } from '@/lib/confirm';
import type { HandDraft } from '@/lib/draft';

const STEPS = ['What do you want to remember?', 'When and where?', 'Who was there?', 'Photographs', 'Tags and connections'];
const WEIGHTS = [
  ['light', 'White'],
  ['tender', 'Mist'],
  ['heavy', 'Marked'],
] as const;

const haptic = (ms = 8) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
};

/**
 * Adding a memory by hand, one gentle step at a time. It can be saved as a draft at any point
 * and finished later. Photographs are kept in the browser until the memory is planted.
 */
export default function AddMemory({
  draftId: startId,
  initial,
  onClose,
  onPlanted,
}: {
  draftId?: string;
  initial?: HandDraft;
  onClose: () => void;
  onPlanted: (memoryId: string) => void;
}) {
  const [snap, store] = useStore();
  const [d, setD] = useState<HandDraft>({ step: 0, weight: 'light', people: [], tags: [], related: [], ...initial });
  const [draftId, setDraftId] = useState(startId ?? null);
  const [photos, setPhotos] = useState<{ blob: Blob; url: string }[]>([]);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const step = d.step ?? 0;
  const set = (patch: Partial<HandDraft>) => setD((x) => ({ ...x, ...patch }));
  const dirty = !!(d.moment?.trim() || d.title?.trim() || d.place?.trim());
  const first = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (step === 0) first.current?.focus();
  }, [step]);
  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), [photos]);

  async function close() {
    if (!dirty) return onClose();
    const keep = await confirmSheet({
      title: 'Keep this as a draft?',
      body: 'You can finish it later from Today.',
      yes: 'Keep the draft',
      no: 'Discard it',
    });
    if (keep) await saveDraft(true);
    else if (draftId) await store.deleteHandDraft(draftId);
    onClose();
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.sheet-veil') && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function saveDraft(quiet = false) {
    const id = await store.saveHandDraft(draftId, d);
    if (id) {
      setDraftId(id);
      if (!quiet) store.toast('Saved as a draft. Finish it whenever you like, from Today.');
    }
    return id;
  }

  function next() {
    setErr('');
    if (step === 0 && (d.moment?.trim().length ?? 0) < 2) return setErr('Write a line about it first, even a few words.');
    if (step === 1 && !d.place?.trim()) return setErr('Where was it? A city, a room, a train. You can be vague.');
    haptic();
    set({ step: Math.min(STEPS.length - 1, step + 1) });
  }

  async function plant() {
    if ((d.moment?.trim().length ?? 0) < 2) return set({ step: 0 });
    if (!d.place?.trim()) return set({ step: 1 });
    setBusy('Planting…');
    const m = await store.createMemory({
      place: d.place.trim(),
      moment: d.moment!.trim(),
      feeling: d.feeling?.trim() ?? '',
      weight: d.weight ?? 'light',
      when: d.when?.trim() || undefined,
      date: d.date || undefined,
      title: d.title?.trim() || undefined,
      narrative: d.narrative?.trim() || undefined,
      tags: d.tags?.length ? d.tags : undefined,
    });
    if (!m) return setBusy('');
    const loc = d.location as Loc | null | undefined;
    if (loc) await store.setLocation(m.id, loc);
    for (const p of d.people ?? []) {
      let pid = p.personId;
      if (!pid) pid = (await store.createPerson({ name: p.name }))?.id;
      if (pid) await store.link({ kind: 'memory-person', a: m.id, b: pid }, true);
    }
    for (const r of d.related ?? []) await store.tie(m.id, r, 'you');
    for (let i = 0; i < photos.length; i++) {
      setBusy(`Keeping photograph ${i + 1} of ${photos.length}…`);
      await store.addMedia({ type: 'memory', id: m.id }, 'photo', photos[i].blob);
    }
    if (draftId) await store.deleteHandDraft(draftId);
    haptic(14);
    setBusy('');
    onPlanted(m.id);
  }

  return (
    <div className="sheet-veil add-veil" onClick={close}>
      <section className="add" role="dialog" aria-modal="true" aria-labelledby="addT" onClick={(e) => e.stopPropagation()}>
        <span className="sheet-grip" aria-hidden="true" />
        <header className="add-head">
          <button type="button" className="quiet" onClick={close}>
            Close
          </button>
          <ol className="add-dots" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((s, i) => (
              <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''}>
                <button type="button" onClick={() => i <= step || dirty ? set({ step: i }) : undefined} aria-label={s} aria-current={i === step ? 'step' : undefined} />
              </li>
            ))}
          </ol>
          <button type="button" className="quiet" onClick={() => saveDraft()} disabled={!dirty || !!busy}>
            Save draft
          </button>
        </header>

        <div className="add-step" key={step}>
          <h2 id="addT" className="add-title">{STEPS[step]}</h2>

          {step === 0 && (
            <>
              <label className="rv-field rv-m">
                <span className="sr">The memory</span>
                <textarea ref={first} rows={4} maxLength={600} value={d.moment ?? ''} onChange={(e) => set({ moment: e.target.value })} placeholder="Start anywhere: a moment, a detail, a sound" />
              </label>
              <label className="rv-field">
                <span>A title (optional)</span>
                <input maxLength={80} value={d.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder="A few words" />
              </label>
              <label className="rv-field">
                <span>More, in your own words (optional)</span>
                <textarea rows={3} maxLength={2000} value={d.narrative ?? ''} onChange={(e) => set({ narrative: e.target.value })} />
              </label>
            </>
          )}

          {step === 1 && <WhenWhere d={d} set={set} />}

          {step === 2 && <WhoWasThere d={d} set={set} />}

          {step === 3 && (
            <Photos photos={photos} setPhotos={setPhotos} />
          )}

          {step === 4 && <TagsAndLinks d={d} set={set} memories={snap.memories} />}

          {err && (
            <p className="field-err" role="alert">
              {err}
            </p>
          )}
        </div>

        <footer className="add-foot">
          {step > 0 && (
            <button type="button" className="quiet" onClick={() => set({ step: step - 1 })} disabled={!!busy}>
              Back
            </button>
          )}
          <span className="add-foot-r">
            {step < STEPS.length - 1 && step > 0 && (
              <button type="button" className="quiet" onClick={plant} disabled={!!busy || !dirty}>
                Plant it now
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button type="button" className="welcome-go" onClick={next} disabled={!!busy}>
                Continue
              </button>
            ) : (
              <button type="button" className="welcome-go" onClick={plant} disabled={!!busy}>
                {busy || 'Plant it'}
              </button>
            )}
          </span>
        </footer>
      </section>
    </div>
  );
}

function WhenWhere({ d, set }: { d: HandDraft; set: (p: Partial<HandDraft>) => void }) {
  const [hits, setHits] = useState<Loc[] | null>(null);
  const [searching, setSearching] = useState(false);
  const loc = d.location as Loc | null | undefined;
  async function find() {
    if (!d.place?.trim()) return;
    setSearching(true);
    try {
      setHits((await searchPlaces(d.place)).slice(0, 5));
    } catch {
      setHits([]);
    }
    setSearching(false);
  }
  return (
    <>
      <label className="rv-field">
        <span>Where</span>
        <input value={d.place ?? ''} maxLength={80} onChange={(e) => set({ place: e.target.value, location: null })} placeholder="A city, a room, a road" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), find())} />
      </label>
      <p className="rv-loc">
        {loc ? (
          <>
            <span className="rv-pin" aria-hidden="true" /> {locLine(loc)}
          </>
        ) : (
          <em>Not on the map yet</em>
        )}{' '}
        <button type="button" className="untie" onClick={find} disabled={!d.place?.trim() || searching}>
          {searching ? 'searching…' : 'find it on the map'}
        </button>
      </p>
      {hits && (
        <p className="rv-hits">
          {hits.length === 0 && <em>Nothing found. It will be kept as written.</em>}
          {hits.map((h, k) => (
            <button
              key={k}
              type="button"
              className="quiet"
              onClick={() => {
                set({ location: h as unknown as Record<string, unknown> });
                setHits(null);
              }}
            >
              {locLine(h)}
            </button>
          ))}
        </p>
      )}
      <div className="rv-grid">
        <label className="rv-field">
          <span>When, in your words (optional)</span>
          <input value={d.when ?? ''} maxLength={60} onChange={(e) => set({ when: e.target.value })} placeholder="A season, a year, an age" />
        </label>
        <label className="rv-field">
          <span>On a day (optional)</span>
          <input type="date" value={d.date ?? ''} max="9999-12-31" onChange={(e) => set({ date: e.target.value })} />
        </label>
      </div>
    </>
  );
}

function WhoWasThere({ d, set }: { d: HandDraft; set: (p: Partial<HandDraft>) => void }) {
  const [snap] = useStore();
  const [name, setName] = useState('');
  const people = d.people ?? [];
  const add = (n: string) => {
    const v = n.trim();
    if (!v || people.some((p) => p.name.toLowerCase() === v.toLowerCase())) return;
    const known = snap.people.find((p) => p.name.toLowerCase() === v.toLowerCase());
    set({ people: [...people, known ? { name: known.name, personId: known.id } : { name: v }] });
    setName('');
  };
  const suggestions = snap.people.filter((p) => !people.some((x) => x.personId === p.id)).slice(0, 8);
  return (
    <>
      <div className="chips">
        {people.map((p, i) => (
          <span key={p.name} className="chip">
            {p.name}
            {!p.personId && ' · new'}
            <button type="button" aria-label={`Remove ${p.name}`} onClick={() => set({ people: people.filter((_, j) => j !== i) })}>
              ×
            </button>
          </span>
        ))}
        <input className="chip-add" value={name} maxLength={80} placeholder="Add a name" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ',') && (e.preventDefault(), add(name))} onBlur={() => add(name)} />
      </div>
      {suggestions.length > 0 && (
        <p className="add-suggest">
          {suggestions.map((p) => (
            <button key={p.id} type="button" className="ob-choice small" onClick={() => add(p.name)}>
              {p.name}
            </button>
          ))}
        </p>
      )}
      <div className="rv-grid">
        <label className="rv-field">
          <span>Mood, in a word (optional)</span>
          <input value={d.feeling ?? ''} maxLength={40} onChange={(e) => set({ feeling: e.target.value })} placeholder="Calm" />
        </label>
        <fieldset className="mem-weight rv-weight">
          <legend>Blossom</legend>
          {WEIGHTS.map(([v, label]) => (
            <label key={v} className={d.weight === v ? 'on' : ''}>
              <input type="radio" name="add-w" checked={d.weight === v} onChange={() => set({ weight: v })} />
              <i className={`w-${v}`} aria-hidden="true" />
              {label}
            </label>
          ))}
        </fieldset>
      </div>
    </>
  );
}

function Photos({ photos, setPhotos }: { photos: { blob: Blob; url: string }[]; setPhotos: React.Dispatch<React.SetStateAction<{ blob: Blob; url: string }[]>> }) {
  const [, store] = useStore();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    setBusy(true);
    for (const f of files) {
      try {
        const blob = await preparePhoto(f);
        setPhotos((xs) => [...xs, { blob, url: URL.createObjectURL(blob) }]);
      } catch (err) {
        store.toast(err instanceof Error ? err.message : 'That photograph couldn’t be used.', 'error');
      }
    }
    setBusy(false);
  }
  return (
    <>
      <p className="you-note">Your browser will ask which photographs to share; only the ones you choose are used. They’re kept with the memory when you plant it.</p>
      {photos.length > 0 && (
        <ul className="shelf-photos">
          {photos.map((p, i) => (
            <li key={p.url}>
              <button type="button" onClick={() => setPhotos((xs) => xs.filter((_, j) => j !== i))} aria-label={`Remove photograph ${i + 1}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="quiet strong" onClick={() => file.current?.click()} disabled={busy}>
        {busy ? 'Preparing…' : photos.length ? 'Add another photograph' : 'Add photographs'}
      </button>
      <input ref={file} type="file" accept="image/*" multiple hidden onChange={pick} />
    </>
  );
}

function TagsAndLinks({ d, set, memories }: { d: HandDraft; set: (p: Partial<HandDraft>) => void; memories: { id: string; place: string; moment: string; extra?: { tags?: string[] } }[] }) {
  const [tag, setTag] = useState('');
  const tags = useMemo(() => d.tags ?? [], [d.tags]);
  const known = useMemo(() => [...new Set(memories.flatMap((m) => m.extra?.tags ?? []))].filter((t) => !tags.includes(t)).slice(0, 10), [memories, tags]);
  const add = (t: string) => {
    const v = t.trim().replace(/^#/, '');
    if (v && !tags.includes(v) && tags.length < 12) set({ tags: [...tags, v] });
    setTag('');
  };
  const related = d.related ?? [];
  return (
    <>
      <div className="rv-field">
        <span>Tags</span>
        <div className="chips">
          {tags.map((t, i) => (
            <span key={t} className="chip">
              {t}
              <button type="button" aria-label={`Remove tag ${t}`} onClick={() => set({ tags: tags.filter((_, j) => j !== i) })}>
                ×
              </button>
            </span>
          ))}
          <input className="chip-add" value={tag} maxLength={30} placeholder="Add a tag" onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ',') && (e.preventDefault(), add(tag))} onBlur={() => add(tag)} />
        </div>
        {known.length > 0 && (
          <p className="add-suggest">
            {known.map((t) => (
              <button key={t} type="button" className="ob-choice small" onClick={() => add(t)}>
                {t}
              </button>
            ))}
          </p>
        )}
      </div>
      {memories.length > 0 && (
        <div className="rv-field">
          <span>Tie a red thread to… (optional)</span>
          <ul className="add-related">
            {memories
              .slice()
              .reverse()
              .slice(0, 30)
              .map((m) => (
                <li key={m.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={related.includes(m.id)}
                      onChange={(e) => set({ related: e.target.checked ? [...related, m.id] : related.filter((r) => r !== m.id) })}
                    />
                    <span>
                      <b>{m.place}</b> {m.moment}
                    </span>
                  </label>
                </li>
              ))}
          </ul>
        </div>
      )}
    </>
  );
}
