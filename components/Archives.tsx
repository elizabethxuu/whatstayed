'use client';

import { useRouter } from 'next/navigation';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Masthead from './Masthead';
import { fmt, newId, PREFILL_KEY, sortEntries } from '@/lib/archive';
import { memoriesOfPage, peopleOf, useStore, type Page as Stored } from '@/lib/store';
import { locLine, placeTitle } from '@/lib/places';
import LocationEditor from './LocationEditor';
import ThreadNote from './ThreadNote';
import { CollectionPicker, ItemPicker, Names, PeoplePicker, pageTitle } from './Pickers';
import MediaShelf from './MediaShelf';
import { confirmSheet } from '@/lib/confirm';
import { clearUnsent, dropUnsent, keepUnsent } from '@/lib/unsent';

type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

export default function Archives() {
  const [snap] = useStore();
  const entries = snap.entries;
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [initialFilter, setInitialFilter] = useState<Has>('');

  // /archives?e=<id> opens that page; ?new=1 opens a fresh one; ?f=reflections|favorites|drafts filters
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const e = sp.get('e');
    const f = sp.get('f');
    if (e) setOpenId(e);
    else if (sp.get('new') === '1') setOpenId(newId());
    if (f === 'reflections' || f === 'favorites' || f === 'drafts') setInitialFilter(f);
    if (e || f || sp.get('new')) window.history.replaceState(null, '', '/archives');
  }, []);

  const open = openId ? entries.find((e) => e.id === openId) ?? null : null;

  if (openId) {
    return <Page key={openId} id={openId} entry={open} onClose={() => setOpenId(null)} />;
  }

  return <Collection key={initialFilter} entries={entries} query={query} setQuery={setQuery} onOpen={setOpenId} initialFilter={initialFilter} />;
}

type Has = '' | 'photo' | 'voice' | 'place' | 'memory' | 'favorites' | 'drafts' | 'reflections';

/* ---------- the collection ---------- */

function excerpt(body: string, q: string) {
  const text = body.trim().replace(/\s+\n/g, '\n');
  if (!q) return text.length > 420 ? text.slice(0, 420).trimEnd() + '…' : text;
  const at = text.toLowerCase().indexOf(q.toLowerCase());
  const start = Math.max(0, at - 140);
  const piece = (start ? '…' : '') + text.slice(start, start + 420) + (start + 420 < text.length ? '…' : '');
  return piece;
}

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'));
  return (
    <>
      {parts.map((p, i) => (p.toLowerCase() === q.toLowerCase() ? <mark key={i}>{p}</mark> : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}

function Collection({
  entries,
  query,
  setQuery,
  onOpen,
  initialFilter,
}: {
  entries: Stored[];
  query: string;
  setQuery: (q: string) => void;
  onOpen: (id: string) => void;
  initialFilter: Has;
}) {
  const [snap, store] = useStore();
  const [who, setWho] = useState('');
  const [has, setHas] = useState<Has>(initialFilter);
  const q = query.trim();
  const shown = useMemo(() => {
    const withPerson = who ? new Set(snap.links.filter((l) => l.kind === 'entry-person' && l.b === who).map((l) => l.a)) : null;
    const media = (kind: string) => new Set(snap.media.filter((m) => m.ownerType === 'entry' && m.kind === kind).map((m) => m.ownerId));
    const filt =
      has === 'photo' ? media('photo') : has === 'voice' ? media('voice') : has === 'memory' ? new Set(snap.links.filter((l) => l.kind === 'entry-memory').map((l) => l.a)) : null;
    return sortEntries(entries).filter(
      (e) =>
        (!q || e.body.toLowerCase().includes(q.toLowerCase()) || (e.location && locLine(e.location).toLowerCase().includes(q.toLowerCase()))) &&
        (!withPerson || withPerson.has(e.id)) &&
        (!filt || filt.has(e.id)) &&
        (has !== 'place' || !!e.location) &&
        (has !== 'favorites' || !!e.meta?.favorite) &&
        (has !== 'drafts' || !!e.meta?.draft) &&
        (has !== 'reflections' || !!e.meta?.prompt) &&
        // drafts stay out of the main list unless asked for
        (has === 'drafts' || has === 'favorites' || !e.meta?.draft || !!q),
    );
  }, [entries, q, who, has, snap.links, snap.media]);
  const filtering = !!(q || who || has);

  // group by month, like sections of a journal
  const months: { label: string; items: Stored[] }[] = [];
  for (const e of shown) {
    const label = fmt.month(e.createdAt);
    const last = months[months.length - 1];
    if (last?.label === label) last.items.push(e);
    else months.push({ label, items: [e] });
  }

  return (
    <main className="archives">
      <Masthead room="archives" />

      <section className="arc-head">
        <h1 className="arc-title">The Archives</h1>
        <p className="arc-sub">Pages and notes.</p>
        <button type="button" className="invite" onClick={() => onOpen(newId())}>
          Preserve a moment…
        </button>
      </section>

      {entries.length > 0 && (
        <div className="arc-tools">
          <label className="search">
            <span className="sr">Search your pages</span>
            <input
              type="search"
              value={query}
              placeholder="Look through what stayed…"
              onChange={(e) => setQuery(e.target.value)}
              spellCheck={false}
            />
          </label>
          <label className="arc-filter">
            <span className="sr">Pages with</span>
            <select value={has} onChange={(e) => setHas(e.target.value as typeof has)}>
              <option value="">Every page</option>
              <option value="favorites">Favourites</option>
              <option value="drafts">Drafts</option>
              <option value="reflections">Reflections</option>
              <option value="photo">With photographs</option>
              <option value="voice">With voice notes</option>
              <option value="place">With a place</option>
              <option value="memory">Tied to a memory</option>
            </select>
          </label>
          {snap.people.length > 0 && (
            <label className="arc-filter">
              <span className="sr">With someone</span>
              <select value={who} onChange={(e) => setWho(e.target.value)}>
                <option value="">With anyone</option>
                {snap.people.map((p) => (
                  <option key={p.id} value={p.id}>
                    With {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <span className="arc-count">
            {filtering ? `${shown.length} of ${entries.length}` : entries.length} {entries.length === 1 ? 'page' : 'pages'}
          </span>
        </div>
      )}

      <section className="pages" aria-label="Your pages">
        {entries.length === 0 && <p className="quiet-note">Your pages are waiting. Even the smallest thought belongs here.</p>}
        {entries.length > 0 && shown.length === 0 && <p className="quiet-note">{q ? `Nothing you’ve written matches “${q}”.` : 'No pages like that yet.'}</p>}
        {months.map((m) => (
          <div key={m.label} className="month">
            <h2 className="month-label">{m.label}</h2>
            <ol>
              {m.items.map((e) => (
                <li key={e.id} className="leaf-row">
                  <button
                    type="button"
                    className={`fav${e.meta?.favorite ? ' on' : ''}`}
                    aria-pressed={!!e.meta?.favorite}
                    aria-label={e.meta?.favorite ? 'Remove from favourites' : 'Add to favourites'}
                    onClick={() => store.setEntryMeta(e.id, { favorite: !e.meta?.favorite })}
                  >
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M10 3.2l2 4.3 4.7.5-3.5 3.2 1 4.6L10 13.5l-4.2 2.3 1-4.6L3.3 8l4.7-.5z" />
                    </svg>
                  </button>
                  <button type="button" className="leaf" onClick={() => onOpen(e.id)}>
                    <span className="leaf-date">
                      {e.meta?.draft ? <em className="unsure">draft</em> : null}
                      {e.meta?.prompt ? <em className="leaf-prompt">{e.meta.prompt}</em> : null}
                      {e.meta?.ai ? <em className="ai-mark">written by the agent</em> : null}
                      {fmt.short(e.createdAt)} <i>·</i> {fmt.time(e.createdAt)}
                      {e.updatedAt - e.createdAt > 60_000 ? <em> · revised</em> : null}
                      {e.location ? <em> · {placeTitle(e.location)}</em> : null}
                    </span>
                    <span className="leaf-body">
                      <Highlight text={excerpt(e.body, q)} q={q} />
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </section>
    </main>
  );
}

/* ---------- a single page ---------- */

function Page({ id, entry, onClose }: { id: string; entry: Stored | null; onClose: () => void }) {
  const [sheet, setSheet] = useState<'place' | 'people' | 'memories' | 'collect' | null>(null);
  const router = useRouter();
  const [snap, store] = useStore();
  const [body, setBody] = useState(entry?.body ?? '');
  const [state, setState] = useState<SaveState>(entry ? 'saved' : 'idle');
  const [created, setCreated] = useState(entry?.createdAt ?? Date.now());
  const [dating, setDating] = useState(false);
  const latest = useRef({ body, created, sent: entry?.body ?? '', sentCreated: entry?.createdAt ?? 0 });
  latest.current.body = body;
  latest.current.created = created;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<unknown>>(Promise.resolve());
  const area = useRef<HTMLTextAreaElement>(null);

  /** Send the page to the account. Saves run one after another so an older one never lands last. */
  const persist = useCallback(() => {
    const cur = latest.current;
    if (cur.body === cur.sent && cur.created === cur.sentCreated) return inflight.current;
    const payload = { id, body: cur.body, createdAt: cur.created };
    setState(cur.body.trim() ? 'saving' : 'idle');
    inflight.current = inflight.current
      .catch(() => {})
      .then(() => store.saveEntry(payload))
      .then(() => {
        latest.current.sent = payload.body;
        latest.current.sentCreated = payload.createdAt;
        clearUnsent(id, payload.body);
        if (latest.current.body === payload.body) setState(payload.body.trim() ? 'saved' : 'idle');
      })
      .catch(() => setState('failed'));
    return inflight.current;
  }, [id, store]);

  // a safety copy in this browser until the account has these words
  useEffect(() => {
    if (!body.trim()) dropUnsent(id);
    else if (body !== latest.current.sent) keepUnsent(id, body, created);
  }, [id, body, created]);

  // save a moment after typing pauses, and always on the way out
  useEffect(() => {
    const flushBeacon = () => {
      const cur = latest.current;
      if (cur.body !== cur.sent || cur.created !== cur.sentCreated) {
        if (store.beaconEntry({ id, body: cur.body, createdAt: cur.created })) {
          latest.current.sent = cur.body;
          latest.current.sentCreated = cur.created;
        }
      }
    };
    const onHide = () => document.visibilityState === 'hidden' && flushBeacon();
    window.addEventListener('pagehide', flushBeacon);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flushBeacon);
      document.removeEventListener('visibilitychange', onHide);
      if (timer.current) clearTimeout(timer.current);
      persist();
    };
  }, [persist, id, store]);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.loc-veil') && !sheet) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function schedule() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      persist();
    }, 700);
  }

  function onChange(v: string) {
    setBody(v);
    setState('saving');
    schedule();
  }

  function redate(v: string) {
    if (!v) return;
    const [y, m, d] = v.split('-').map(Number);
    const old = new Date(created);
    const next = new Date(y, m - 1, d, old.getHours(), old.getMinutes()).getTime();
    if (Number.isNaN(next)) return;
    setCreated(next);
    latest.current.created = next;
    setDating(false);
    if (latest.current.body.trim()) {
      setState('saving');
      schedule();
    }
  }

  function close() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    persist();
    onClose();
  }

  async function remove() {
    if (!(await confirmSheet({ title: 'Delete this page?', body: 'Its photographs and recordings are deleted too. This can’t be undone.', yes: 'Delete page', danger: true }))) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    await inflight.current.catch(() => {});
    dropUnsent(id);
    latest.current.sent = latest.current.body; // nothing more to save
    latest.current.sentCreated = latest.current.created;
    const ok = await store.deleteEntry(id);
    if (ok) onClose();
  }

  function toGarden() {
    persist();
    try {
      sessionStorage.setItem(PREFILL_KEY, body.trim());
    } catch {
      /* storage unavailable */
    }
    router.push('/');
  }

  const dateValue = (() => {
    const d = new Date(created);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const saved = snap.entries.find((e) => e.id === id);

  return (
    <main className="archives writing">
      <header className="page-top">
        <button type="button" className="quiet back" onClick={close}>
          ← The Archives
        </button>
        {dating ? (
          <label className="page-date">
            <span className="sr">The date of this page</span>
            <input type="date" autoFocus defaultValue={dateValue} max="9999-12-31" onChange={(e) => redate(e.target.value)} onBlur={() => setDating(false)} />
          </label>
        ) : (
          <button type="button" className="page-date quiet" onClick={() => setDating(true)} title="Change the date of this page">
            {fmt.day(created)}
          </button>
        )}
        {saved && (
          <span className="page-flags">
            <button type="button" className={`fav${saved.meta?.favorite ? ' on' : ''}`} aria-pressed={!!saved.meta?.favorite} aria-label="Favourite" onClick={() => store.setEntryMeta(id, { favorite: !saved.meta?.favorite })}>
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M10 3.2l2 4.3 4.7.5-3.5 3.2 1 4.6L10 13.5l-4.2 2.3 1-4.6L3.3 8l4.7-.5z" />
              </svg>
            </button>
            <button type="button" className="quiet" aria-pressed={!!saved.meta?.draft} onClick={() => store.setEntryMeta(id, { draft: !saved.meta?.draft })}>
              {saved.meta?.draft ? 'Draft · finish' : 'Keep as draft'}
            </button>
          </span>
        )}
        <span className={`saved s-${state}`} aria-live="polite">
          {state === 'saving' ? 'Saving' : state === 'saved' ? 'Saved' : state === 'failed' ? 'Couldn’t save' : ''}
        </span>
      </header>

      {saved?.meta?.prompt && <p className="page-prompt">{saved.meta.prompt}</p>}
      {saved?.meta?.ai && <p className="ai-note">A reflection written by the agent from your saved memories, kept because you chose to. Edit it freely.</p>}
      <label htmlFor="page" className="sr">
        Write freely
      </label>
      <textarea
        id="page"
        ref={area}
        className="sheet"
        value={body}
        placeholder="Preserve a moment…"
        onChange={(e) => onChange(e.target.value)}
        spellCheck
      />

      {saved ? (
        <div className="page-media">
          <MediaShelf owner={{ type: 'entry', id }} />
        </div>
      ) : (
        <p className="page-media-wait">Write a few words and you can add photographs, voice notes, people and places to this page.</p>
      )}

      {saved && (
        <section className="page-ties" aria-label="What this page is tied to">
          <p>
            <span className="page-k">Where</span>
            {saved.location ? <span>{locLine(saved.location)}</span> : <span className="names-empty">Nowhere in particular</span>}
            <button type="button" className="quiet" onClick={() => setSheet('place')}>
              {saved.location ? 'Change' : 'Add a place'}
            </button>
          </p>
          <p>
            <span className="page-k">With</span>
            <Names people={peopleOf(snap, 'entry-person', id)} empty="No one yet" />
            <button type="button" className="quiet" onClick={() => setSheet('people')}>
              {peopleOf(snap, 'entry-person', id).length ? 'Who else' : 'Add someone'}
            </button>
          </p>
          <div className="page-threads">
            <span className="page-k">Tied to</span>
            {memoriesOfPage(snap, id).length === 0 && <span className="names-empty">No memory yet</span>}
            <ul>
              {memoriesOfPage(snap, id).map(({ m, note }) => (
                <li key={m.id} className="pl-tie">
                  <span className="pl-tie-line" aria-hidden="true" />
                  <span className="pl-tie-body">
                    <span className="pl-tie-place">{snap.locations[m.id] ? placeTitle(snap.locations[m.id]) : m.place}</span>
                    <span className="pl-tie-moment">{m.moment}</span>
                    {note && <span className="pl-tie-note">{note}</span>}
                  </span>
                  <ThreadNote note={note} label={m.place} onSave={(n) => store.link({ kind: 'entry-memory', a: id, b: m.id, note: n }, true)} />
                  <button type="button" className="untie" onClick={() => store.unlink({ kind: 'entry-memory', a: id, b: m.id })}>
                    untie
                  </button>
                </li>
              ))}
            </ul>
            <p className="page-tie-acts">
              <button type="button" className="quiet" onClick={() => setSheet('memories')} disabled={!snap.memories.length} title={snap.memories.length ? undefined : 'Plant a memory in the garden first'}>
                Tie to a memory…
              </button>
              <button type="button" className="quiet" onClick={() => setSheet('collect')}>
                Keep in a collection…
              </button>
            </p>
          </div>
        </section>
      )}
      {saved && sheet === 'place' && (
        <LocationEditor
          memory={{ moment: pageTitle(saved), place: '' }}
          current={saved.location}
          onClose={() => setSheet(null)}
          onSave={(loc) => {
            store.setEntryLocation(id, loc);
            setSheet(null);
          }}
          onRemove={
            saved.location
              ? () => {
                  store.setEntryLocation(id, null);
                  setSheet(null);
                }
              : undefined
          }
        />
      )}
      {saved && sheet === 'people' && (
        <PeoplePicker
          kicker={`For “${pageTitle(saved)}”`}
          chosen={peopleOf(snap, 'entry-person', id).map((p) => p.id)}
          onToggle={(pid, on) => (on ? store.link({ kind: 'entry-person', a: id, b: pid }, true) : store.unlink({ kind: 'entry-person', a: id, b: pid }))}
          onClose={() => setSheet(null)}
        />
      )}
      {saved && sheet === 'memories' && (
        <ItemPicker
          title="Tie this page to…"
          kicker={`“${pageTitle(saved)}”`}
          kinds={['memory']}
          isOn={(_k, mid) => snap.links.some((l) => l.kind === 'entry-memory' && l.a === id && l.b === mid)}
          onToggle={(_k, mid, on) => (on ? store.link({ kind: 'entry-memory', a: id, b: mid }, true) : store.unlink({ kind: 'entry-memory', a: id, b: mid }))}
          onClose={() => setSheet(null)}
        />
      )}
      {saved && sheet === 'collect' && <CollectionPicker kind="entry" id={id} onClose={() => setSheet(null)} />}

      <footer className="page-foot">
        <span className="page-meta">
          {words ? `${words} ${words === 1 ? 'word' : 'words'}` : ''}
          {saved && saved.updatedAt - saved.createdAt > 60_000 ? ` · revised ${fmt.short(saved.updatedAt)}, ${fmt.time(saved.updatedAt)}` : ''}
        </span>
        <span className="page-acts">
          {body.trim() && (
            <button type="button" className="quiet" onClick={toGarden} title="Opens the garden with this page in the writing line. Nothing is sent until you send it.">
              Keep it as a memory →
            </button>
          )}
          {saved && (
            <button type="button" className="quiet danger" onClick={remove}>
              Delete this page
            </button>
          )}
        </span>
      </footer>
    </main>
  );
}
