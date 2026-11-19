'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import Masthead from './Masthead';
import { ItemPicker, Sheet, pageTitle } from './Pickers';
import { firstPhoto, itemsOf, mediaUrl, useStore, type Collection, type CollectionInput, type Media, type Snapshot } from '@/lib/store';
import { placeTitle } from '@/lib/places';
import { fmt } from '@/lib/archive';
import { confirmSheet } from '@/lib/confirm';

/** The cover: the one chosen, else the first photograph inside, else nothing but its name. */
export function coverOf(snap: Snapshot, c: Collection): Media | undefined {
  if (c.cover) {
    const m = snap.media.find((x) => x.id === c.cover);
    if (m) return m;
  }
  for (const it of itemsOf(snap, c.id)) {
    const ph = it.kind === 'memory' ? firstPhoto(snap, 'memory', it.m!.id) : firstPhoto(snap, 'entry', it.e!.id);
    if (ph) return ph;
  }
  return undefined;
}

export default function Collections() {
  const [snap, store] = useStore();
  const params = useSearchParams();
  const router = useRouter();
  const cid = params.get('c');
  const col = cid ? snap.collections.find((c) => c.id === cid) : undefined;
  const [making, setMaking] = useState(false);

  if (cid && col) return <CollectionPage key={col.id} c={col} onGone={() => router.push('/collections')} />;

  return (
    <main className="people">
      <Masthead room="collections">
        <button type="button" className="quiet" onClick={() => setMaking(true)}>
          Start a collection
        </button>
      </Masthead>
      <section className="arc-head">
        <h1 className="arc-title">Collections</h1>
        <p className="arc-sub">Group memories and pages.</p>
      </section>
      {cid && !col && <p className="quiet-note">That collection isn’t here any more.</p>}
      {snap.collections.length === 0 ? (
        <div className="empty-room">
          <p className="quiet-note">Gather memories and pages that belong together, then keep them, print them, or take them with you.</p>
          <button type="button" className="invite" onClick={() => setMaking(true)}>
            Start the first collection…
          </button>
        </div>
      ) : (
        <ul className="covers">
          {snap.collections.map((c) => {
            const cover = coverOf(snap, c);
            const n = itemsOf(snap, c.id).length;
            return (
              <li key={c.id}>
                <Link href={`/collections?c=${encodeURIComponent(c.id)}`} className="cover">
                  <span className="cover-frame" aria-hidden="true">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {cover ? <img src={mediaUrl(cover.id)} alt="" loading="lazy" decoding="async" /> : <i>{c.name}</i>}
                  </span>
                  <span className="face-name">{c.name}</span>
                  <span className="face-n">{n === 0 ? 'Empty, for now' : n === 1 ? 'One thing kept' : `${n} things kept`}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {making && (
        <CollectionEditor
          onClose={() => setMaking(false)}
          onSave={async (c) => {
            const made = await store.createCollection(c);
            if (made) router.push(`/collections?c=${encodeURIComponent(made.id)}`);
            return made;
          }}
        />
      )}
    </main>
  );
}

function CollectionEditor({ c, photos, onSave, onClose }: { c?: Collection; photos?: Media[]; onSave: (c: CollectionInput) => Promise<unknown>; onClose: () => void }) {
  const [name, setName] = useState(c?.name ?? '');
  const [description, setDescription] = useState(c?.description ?? '');
  const [cover, setCover] = useState<string | null>(c?.cover ?? null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErr('Give it a name.');
    setBusy(true);
    const ok = await onSave({ name: name.trim(), description: description.trim() || undefined, cover });
    setBusy(false);
    if (ok) onClose();
  }
  return (
    <Sheet title={c ? 'This collection' : 'A new collection'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="loc-fields mem-fields">
          <label className="wide">
            <span>Its name</span>
            <input autoFocus value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setErr(''); }} placeholder="A name for the collection" aria-invalid={err ? true : undefined} />
            {err && <em className="field-err">{err}</em>}
          </label>
          <label className="wide">
            <span>A line about it (optional)</span>
            <input value={description} maxLength={400} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>
        {photos && photos.length > 0 && (
          <fieldset className="cover-pick">
            <legend>Cover</legend>
            <label className={!cover ? 'on' : ''}>
              <input type="radio" name="cover" checked={!cover} onChange={() => setCover(null)} />
              <i>First photograph</i>
            </label>
            {photos.map((p, i) => (
              <label key={p.id} className={cover === p.id ? 'on' : ''}>
                <input type="radio" name="cover" checked={cover === p.id} onChange={() => setCover(p.id)} aria-label={`Photograph ${i + 1}`} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaUrl(p.id)} alt="" loading="lazy" />
              </label>
            ))}
          </fieldset>
        )}
        <div className="loc-acts">
          <span />
          <button type="button" className="quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="quiet strong" disabled={busy}>
            {busy ? 'Saving…' : c ? 'Save' : 'Make it'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function CollectionPage({ c, onGone }: { c: Collection; onGone: () => void }) {
  const [snap, store] = useStore();
  const [sheet, setSheet] = useState<'edit' | 'add' | null>(null);
  const items = itemsOf(snap, c.id);
  const cover = coverOf(snap, c);
  const photos = snap.media.filter(
    (m) => m.kind === 'photo' && items.some((it) => (it.kind === 'memory' ? m.ownerType === 'memory' && m.ownerId === it.m!.id : m.ownerType === 'entry' && m.ownerId === it.e!.id)),
  );

  async function remove() {
    if (!(await confirmSheet({ title: `Remove the collection “${c.name}”?`, body: 'The memories and pages in it stay.', yes: 'Remove collection', danger: true }))) return;
    if (await store.deleteCollection(c.id)) onGone();
  }

  return (
    <main className="people">
      <Masthead room="collections" />
      <article className="person coll">
        <Link href="/collections" className="quiet back">
          ← All collections
        </Link>
        <header className="person-head">
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="coll-cover" src={mediaUrl(cover.id)} alt="" />
          )}
          <h1 className="arc-title">{c.name}</h1>
          {c.description && <p className="arc-sub">{c.description}</p>}
          <p className="card-links">
            <button type="button" className="quiet" onClick={() => setSheet('add')}>
              Add memories or pages
            </button>
            <button type="button" className="quiet" onClick={() => setSheet('edit')}>
              Edit
            </button>
            <button type="button" className="quiet danger" onClick={remove}>
              Remove
            </button>
          </p>
        </header>

        {items.length === 0 ? (
          <p className="quiet-note">Nothing here yet.</p>
        ) : (
          <ol className="pl-mems coll-items">
            {items.map((it) =>
              it.kind === 'memory' ? (
                <li key={'m' + it.m!.id}>
                  <p className="pl-where">{snap.locations[it.m!.id] ? placeTitle(snap.locations[it.m!.id]) : it.m!.place}{it.m!.when ? ` · ${it.m!.when}` : ''}</p>
                  <Link href={`/?m=${encodeURIComponent(it.m!.id)}`} className="pl-moment as-link">
                    {it.m!.moment}
                  </Link>
                  <button type="button" className="untie" onClick={() => store.removeFromCollection(c.id, 'memory', it.m!.id)}>
                    take out
                  </button>
                </li>
              ) : (
                <li key={'e' + it.e!.id}>
                  <p className="pl-where">A page · {fmt.short(it.e!.createdAt)}, {new Date(it.e!.createdAt).getFullYear()}</p>
                  <Link href={`/archives?e=${encodeURIComponent(it.e!.id)}`} className="pl-moment as-link">
                    {pageTitle(it.e!)}
                  </Link>
                  <button type="button" className="untie" onClick={() => store.removeFromCollection(c.id, 'entry', it.e!.id)}>
                    take out
                  </button>
                </li>
              ),
            )}
          </ol>
        )}

        {items.length > 0 && (
          <section className="person-block coll-export">
            <h2 className="month-label">Take it with you</h2>
            <p className="sheet-p">A printed edition, typeset for paper. Use your browser’s “Save as PDF” to keep it as a PDF, or download it as a single web page with its photographs inside.</p>
            <p className="card-links">
              <Link className="quiet strong" href={`/print?c=${encodeURIComponent(c.id)}`}>
                Open the printed edition
              </Link>
            </p>
          </section>
        )}
      </article>

      {sheet === 'edit' && <CollectionEditor c={c} photos={photos} onClose={() => setSheet(null)} onSave={(x) => store.updateCollection(c.id, x)} />}
      {sheet === 'add' && (
        <ItemPicker
          title={`Into “${c.name}”`}
          kinds={['memory', 'entry']}
          isOn={(k, id) => snap.collectionItems.some((i) => i.collectionId === c.id && i.kind === k && i.id === id)}
          onToggle={(k, id, on) => (on ? store.addToCollection(c.id, k, id) : store.removeFromCollection(c.id, k, id))}
          onClose={() => setSheet(null)}
        />
      )}
    </main>
  );
}
