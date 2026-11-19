'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import Masthead from './Masthead';
import MediaShelf from './MediaShelf';
import { ItemPicker, Sheet, pageTitle } from './Pickers';
import { firstPhoto, mediaUrl, memoriesOfPerson, pagesOfPerson, useStore, type Person, type PersonInput } from '@/lib/store';
import { placeTitle } from '@/lib/places';
import { fmt } from '@/lib/archive';

export default function People() {
  const [snap, store] = useStore();
  const params = useSearchParams();
  const router = useRouter();
  const pid = params.get('p');
  const person = pid ? snap.people.find((p) => p.id === pid) : undefined;
  const [adding, setAdding] = useState(false);

  if (pid && person) return <PersonPage key={person.id} person={person} onGone={() => router.push('/people')} />;

  return (
    <main className="people">
      <Masthead room="people">
        <button type="button" className="quiet" onClick={() => setAdding(true)}>
          Add someone
        </button>
      </Masthead>
      <section className="arc-head">
        <h1 className="arc-title">People</h1>
        <p className="arc-sub">The ones who keep reappearing.</p>
      </section>

      {pid && !person && <p className="quiet-note">That person isn’t here any more.</p>}

      {snap.people.length === 0 ? (
        <div className="empty-room">
          <p className="quiet-note">No one is here yet. A friend, a grandmother, someone you met once on a train.</p>
          <button type="button" className="invite" onClick={() => setAdding(true)}>
            Add the first person…
          </button>
        </div>
      ) : (
        <ul className="faces">
          {snap.people.map((p) => {
            const ph = firstPhoto(snap, 'person', p.id);
            const n = memoriesOfPerson(snap, p.id).length + pagesOfPerson(snap, p.id).length;
            return (
              <li key={p.id}>
                <Link href={`/people?p=${encodeURIComponent(p.id)}`} className="face">
                  <span className="face-frame" aria-hidden="true">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {ph ? <img src={mediaUrl(ph.id)} alt="" loading="lazy" decoding="async" /> : <i>{p.name.slice(0, 1)}</i>}
                  </span>
                  <span className="face-name">{p.name}</span>
                  {p.relation && <span className="face-rel">{p.relation}</span>}
                  <span className="face-n">{n === 0 ? 'Nothing kept yet' : n === 1 ? 'In one memory' : `In ${n} memories and pages`}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {adding && (
        <PersonEditor
          onClose={() => setAdding(false)}
          onSave={async (p) => {
            const made = await store.createPerson(p);
            if (made) router.push(`/people?p=${encodeURIComponent(made.id)}`);
            return made;
          }}
        />
      )}
    </main>
  );
}

function PersonEditor({ person, onSave, onClose }: { person?: Person; onSave: (p: PersonInput) => Promise<unknown>; onClose: () => void }) {
  const [name, setName] = useState(person?.name ?? '');
  const [relation, setRelation] = useState(person?.relation ?? '');
  const [description, setDescription] = useState(person?.description ?? '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErr('A name, even a nickname.');
    setBusy(true);
    const ok = await onSave({ name: name.trim(), relation: relation.trim() || undefined, description: description.trim() || undefined, notes: person?.notes });
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Sheet title={person ? 'About them' : 'Add a person'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="loc-fields mem-fields">
          <label>
            <span>Name</span>
            <input autoFocus value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setErr(''); }} aria-invalid={err ? true : undefined} aria-describedby={err ? 'pn-err' : undefined} placeholder="Nai Nai" />
            {err && <em id="pn-err" className="field-err">{err}</em>}
          </label>
          <label>
            <span>Who they are to you (optional)</span>
            <input value={relation} maxLength={60} onChange={(e) => setRelation(e.target.value)} placeholder="My grandmother" />
          </label>
          <label className="wide">
            <span>A few words (optional)</span>
            <textarea rows={3} maxLength={600} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A short description" />
          </label>
        </div>
        <div className="loc-acts">
          <span />
          <button type="button" className="quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="quiet strong" disabled={busy}>
            {busy ? 'Saving…' : person ? 'Save' : 'Add them'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function PersonPage({ person, onGone }: { person: Person; onGone: () => void }) {
  const [snap, store] = useStore();
  const [sheet, setSheet] = useState<'edit' | 'memories' | 'pages' | null>(null);
  const [notes, setNotes] = useState(person.notes ?? '');
  const [noteState, setNoteState] = useState<'' | 'saving' | 'saved'>('');
  const mems = memoriesOfPerson(snap, person.id);
  const pages = pagesOfPerson(snap, person.id);
  const dirty = notes !== (person.notes ?? '');

  // keep unsaved notes if someone navigates away mid-thought
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function saveNotes() {
    if (!dirty) return;
    setNoteState('saving');
    const ok = await store.updatePerson(person.id, { name: person.name, relation: person.relation, description: person.description, notes: notes.trim() || undefined });
    setNoteState(ok ? 'saved' : '');
  }

  async function remove() {
    if (!window.confirm(`Remove ${person.name}? Their photographs go too. The memories and pages you shared stay where they are.`)) return;
    if (await store.deletePerson(person.id)) onGone();
  }

  return (
    <main className="people">
      <Masthead room="people" />
      <article className="person">
        <Link href="/people" className="quiet back">
          ← Everyone
        </Link>
        <header className="person-head">
          {person.relation && <p className="card-no">{person.relation}</p>}
          <h1 className="arc-title">{person.name}</h1>
          {person.description && <p className="arc-sub">{person.description}</p>}
          <p className="card-links">
            <button type="button" className="quiet" onClick={() => setSheet('edit')}>
              Edit
            </button>
            <button type="button" className="quiet danger" onClick={remove}>
              Remove
            </button>
          </p>
        </header>

        <section className="person-block">
          <h2 className="month-label">Photographs</h2>
          <MediaShelf owner={{ type: 'person', id: person.id }} />
        </section>

        <section className="person-block">
          <h2 className="month-label">Memories with {person.name}</h2>
          {mems.length === 0 ? (
            <p className="names-empty">None yet.</p>
          ) : (
            <ol className="pl-mems">
              {mems.map((m) => (
                <li key={m.id}>
                  <p className="pl-where">{snap.locations[m.id] ? placeTitle(snap.locations[m.id]) : m.place}</p>
                  <Link href={`/?m=${encodeURIComponent(m.id)}`} className="pl-moment as-link">
                    “{m.moment}”
                  </Link>
                  <p className="card-meta">
                    {m.when ? <span>{m.when}</span> : null}
                    <span>{m.feeling}</span>
                  </p>
                </li>
              ))}
            </ol>
          )}
          <button type="button" className="quiet" onClick={() => setSheet('memories')} disabled={!snap.memories.length} title={snap.memories.length ? undefined : 'Plant a memory in the garden first'}>
            Add a shared memory…
          </button>
        </section>

        <section className="person-block">
          <h2 className="month-label">Pages</h2>
          {pages.length === 0 ? (
            <p className="names-empty">None yet.</p>
          ) : (
            <ul className="person-pages">
              {pages.map((e) => (
                <li key={e.id}>
                  <Link href={`/archives?e=${encodeURIComponent(e.id)}`} className="leaf">
                    <span className="leaf-date">{fmt.short(e.createdAt)}, {new Date(e.createdAt).getFullYear()}</span>
                    <span className="leaf-body">{pageTitle(e)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="quiet" onClick={() => setSheet('pages')} disabled={!snap.entries.length} title={snap.entries.length ? undefined : 'Write a page in the Archives first'}>
            Add a page…
          </button>
        </section>

        <section className="person-block">
          <h2 className="month-label">Notes</h2>
          <label htmlFor="pnotes" className="sr">
            Private notes about {person.name}
          </label>
          <textarea
            id="pnotes"
            className="person-notes"
            value={notes}
            maxLength={20000}
            placeholder="Notes…"
            onChange={(e) => {
              setNotes(e.target.value);
              setNoteState('');
            }}
            onBlur={saveNotes}
          />
          <p className="card-links">
            <button type="button" className="quiet strong" onClick={saveNotes} disabled={!dirty || noteState === 'saving'}>
              {noteState === 'saving' ? 'Saving…' : 'Save notes'}
            </button>
            <span className="saved" aria-live="polite">
              {noteState === 'saved' && !dirty ? 'Saved' : dirty ? 'Not saved yet' : ''}
            </span>
          </p>
        </section>
      </article>

      {sheet === 'edit' && <PersonEditor person={person} onClose={() => setSheet(null)} onSave={(p) => store.updatePerson(person.id, { ...p, notes: notes.trim() || undefined })} />}
      {sheet === 'memories' && (
        <ItemPicker
          title="Memories"
          kicker={person.name}
          kinds={['memory']}
          isOn={(_k, id) => snap.links.some((l) => l.kind === 'memory-person' && l.a === id && l.b === person.id)}
          onToggle={(_k, id, on) => (on ? store.link({ kind: 'memory-person', a: id, b: person.id }, true) : store.unlink({ kind: 'memory-person', a: id, b: person.id }))}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'pages' && (
        <ItemPicker
          title="Pages"
          kicker={person.name}
          kinds={['entry']}
          isOn={(_k, id) => snap.links.some((l) => l.kind === 'entry-person' && l.a === id && l.b === person.id)}
          onToggle={(_k, id, on) => (on ? store.link({ kind: 'entry-person', a: id, b: person.id }, true) : store.unlink({ kind: 'entry-person', a: id, b: person.id }))}
          onClose={() => setSheet(null)}
        />
      )}
    </main>
  );
}
