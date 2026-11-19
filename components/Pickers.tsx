'use client';

import Link from 'next/link';
import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { firstPhoto, mediaUrl, useStore, type CollectionItem, type Page, type Stored } from '@/lib/store';

/** The quiet sheet every chooser opens in. Escape or a click outside closes it. */
export function Sheet({ title, kicker, onClose, children, wide }: { title: string; kicker?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="loc-veil" onClick={onClose}>
      <section className={`loc-ed${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        {kicker && <p className="loc-k">{kicker}</p>}
        <h2 className="loc-t">{title}</h2>
        {children}
      </section>
    </div>
  );
}

export const pageTitle = (e: Pick<Page, 'body'>) => {
  const line = e.body.trim().split('\n')[0] || 'An untitled page';
  return line.length > 70 ? line.slice(0, 68) + '…' : line;
};

/** Who was there. Choose people already here, or add someone by name. */
export function PeoplePicker({ chosen, onToggle, onClose, kicker }: { chosen: string[]; onToggle: (pid: string, on: boolean) => Promise<unknown>; onClose: () => void; kicker?: string }) {
  const [snap, store] = useStore();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const shown = snap.people.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));

  async function add(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    const p = await store.createPerson({ name: n });
    if (p) {
      await onToggle(p.id, true);
      setName('');
    }
    setBusy(false);
  }

  return (
    <Sheet title="Who was there?" kicker={kicker} onClose={onClose}>
      {snap.people.length > 6 && (
        <label className="tie-note pick-filter">
          <span className="sr">Find someone</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find someone" />
        </label>
      )}
      {snap.people.length === 0 ? (
        <p className="loc-note">No one is here yet. Add the first person below.</p>
      ) : (
        <ul className="tie-list pick-list">
          {shown.map((p) => {
            const on = chosen.includes(p.id);
            const ph = firstPhoto(snap, 'person', p.id);
            return (
              <li key={p.id}>
                <button type="button" role="checkbox" aria-checked={on} className={on ? 'on' : ''} onClick={() => onToggle(p.id, !on)}>
                  <span className="pick-face" aria-hidden="true">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {ph ? <img src={mediaUrl(ph.id)} alt="" loading="lazy" /> : p.name.slice(0, 1)}
                  </span>
                  <span className="tie-moment">{p.name}</span>
                  {p.relation && <span className="tie-place">{p.relation}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form className="tie-note pick-new" onSubmit={add}>
        <label>
          <span>Someone new</span>
          <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Their name" />
        </label>
        <button type="submit" className="quiet strong" disabled={busy || !name.trim()}>
          Add
        </button>
      </form>
      <div className="loc-acts">
        <span />
        <button type="button" className="quiet strong" onClick={onClose}>
          Done
        </button>
      </div>
    </Sheet>
  );
}

/** Choose memories and/or pages. Used to tie a page to memories, and to fill a collection. */
export function ItemPicker({
  title,
  kicker,
  kinds,
  isOn,
  onToggle,
  onClose,
  exclude,
}: {
  title: string;
  kicker?: string;
  kinds: CollectionItem['kind'][];
  isOn: (kind: CollectionItem['kind'], id: string) => boolean;
  onToggle: (kind: CollectionItem['kind'], id: string, on: boolean) => Promise<unknown>;
  onClose: () => void;
  exclude?: string;
}) {
  const [snap] = useStore();
  const [tab, setTab] = useState<CollectionItem['kind']>(kinds[0]);
  const [q, setQ] = useState('');
  const ql = q.trim().toLowerCase();
  const rows = useMemo(() => {
    if (tab === 'memory')
      return snap.memories
        .filter((m: Stored) => m.id !== exclude && (!ql || `${m.place} ${m.moment} ${m.feeling} ${m.when ?? ''}`.toLowerCase().includes(ql)))
        .map((m) => ({ id: m.id, a: snap.locations[m.id]?.city || m.place, b: m.moment }));
    return [...snap.entries]
      .sort((x, y) => y.createdAt - x.createdAt)
      .filter((e) => e.id !== exclude && (!ql || e.body.toLowerCase().includes(ql)))
      .map((e) => ({ id: e.id, a: new Date(e.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }), b: pageTitle(e) }));
  }, [snap, tab, ql, exclude]);

  return (
    <Sheet title={title} kicker={kicker} onClose={onClose}>
      {kinds.length > 1 && (
        <div className="pick-tabs" role="tablist">
          {kinds.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={`quiet${tab === k ? ' strong' : ''}`} onClick={() => setTab(k)}>
              {k === 'memory' ? 'Memories' : 'Pages'}
            </button>
          ))}
        </div>
      )}
      <label className="tie-note pick-filter">
        <span className="sr">Search</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === 'memory' ? 'Find a memory' : 'Find a page'} />
      </label>
      {rows.length === 0 ? (
        <p className="loc-note">{q ? 'Nothing matches.' : tab === 'memory' ? 'No memories yet.' : 'No pages yet.'}</p>
      ) : (
        <ul className="tie-list pick-list">
          {rows.map((r) => {
            const on = isOn(tab, r.id);
            return (
              <li key={r.id}>
                <button type="button" role="checkbox" aria-checked={on} className={on ? 'on' : ''} onClick={() => onToggle(tab, r.id, !on)}>
                  <span className="tie-place">{r.a}</span>
                  <span className="tie-moment">{r.b}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="loc-acts">
        <span />
        <button type="button" className="quiet strong" onClick={onClose}>
          Done
        </button>
      </div>
    </Sheet>
  );
}

/** Put one memory or page into collections, or start a new one. */
export function CollectionPicker({ kind, id, onClose }: { kind: CollectionItem['kind']; id: string; onClose: () => void }) {
  const [snap, store] = useStore();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const inIt = (cid: string) => snap.collectionItems.some((i) => i.collectionId === cid && i.kind === kind && i.id === id);

  async function make(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const c = await store.createCollection({ name: name.trim() });
    if (c) {
      await store.addToCollection(c.id, kind, id);
      setName('');
    }
    setBusy(false);
  }

  return (
    <Sheet title="Keep it in a collection" onClose={onClose}>
      {snap.collections.length === 0 ? (
        <p className="loc-note">No collections yet. Start one: Childhood, Paris, Summer…</p>
      ) : (
        <ul className="tie-list pick-list">
          {snap.collections.map((c) => {
            const on = inIt(c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  className={on ? 'on' : ''}
                  onClick={() => (on ? store.removeFromCollection(c.id, kind, id) : store.addToCollection(c.id, kind, id))}
                >
                  <span className="tie-moment">{c.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form className="tie-note pick-new" onSubmit={make}>
        <label>
          <span>A new collection</span>
          <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="People I’ve loved" />
        </label>
        <button type="submit" className="quiet strong" disabled={busy || !name.trim()}>
          Make it
        </button>
      </form>
      <div className="loc-acts">
        <span />
        <button type="button" className="quiet strong" onClick={onClose}>
          Done
        </button>
      </div>
    </Sheet>
  );
}

/** A row of names, each a link to that person's page. */
export function Names({ people, empty }: { people: { id: string; name: string }[]; empty?: string }) {
  if (!people.length) return empty ? <span className="names-empty">{empty}</span> : null;
  return (
    <span className="names">
      {people.map((p, i) => (
        <span key={p.id}>
          <Link href={`/people?p=${encodeURIComponent(p.id)}`}>{p.name}</Link>
          {i < people.length - 1 ? ', ' : ''}
        </span>
      ))}
    </span>
  );
}
