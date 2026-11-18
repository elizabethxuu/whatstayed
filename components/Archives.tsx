'use client';

import { useRouter } from 'next/navigation';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Masthead from './Masthead';
import { fmt, loadEntries, newId, PREFILL_KEY, saveEntries, sortEntries, type Entry } from '@/lib/archive';

type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

export default function Archives() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => setEntries(loadEntries()), []);

  const commit = useCallback((next: Entry[]) => {
    setEntries(next);
    return saveEntries(next);
  }, []);

  if (!entries) return <main className="archives" aria-busy="true" />;

  const open = openId ? entries.find((e) => e.id === openId) ?? null : null;

  if (openId) {
    return (
      <Page
        key={openId}
        id={openId}
        entry={open}
        all={entries}
        commit={commit}
        onClose={() => setOpenId(null)}
      />
    );
  }

  return <Collection entries={entries} query={query} setQuery={setQuery} onOpen={setOpenId} />;
}

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
}: {
  entries: Entry[];
  query: string;
  setQuery: (q: string) => void;
  onOpen: (id: string) => void;
}) {
  const q = query.trim();
  const shown = useMemo(
    () => sortEntries(entries).filter((e) => !q || e.body.toLowerCase().includes(q.toLowerCase())),
    [entries, q],
  );

  // group by month, like sections of a journal
  const months: { label: string; items: Entry[] }[] = [];
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
        <p className="arc-sub">Things I wanted to remember.</p>
        <button type="button" className="invite" onClick={() => onOpen(newId())}>
          Leave something here…
        </button>
      </section>

      {entries.length > 0 && (
        <div className="arc-tools">
          <label className="search">
            <span className="sr">Search your pages</span>
            <input
              type="search"
              value={query}
              placeholder="Search"
              onChange={(e) => setQuery(e.target.value)}
              spellCheck={false}
            />
          </label>
          <span className="arc-count">
            {q ? `${shown.length} of ${entries.length}` : entries.length} {entries.length === 1 ? 'page' : 'pages'}
          </span>
        </div>
      )}

      <section className="pages" aria-label="Your pages">
        {entries.length === 0 && <p className="quiet-note">Nothing here yet. Even the smallest thought deserves a place.</p>}
        {entries.length > 0 && shown.length === 0 && <p className="quiet-note">Nothing you’ve written matches “{q}”.</p>}
        {months.map((m) => (
          <div key={m.label} className="month">
            <h2 className="month-label">{m.label}</h2>
            <ol>
              {m.items.map((e) => (
                <li key={e.id}>
                  <button type="button" className="leaf" onClick={() => onOpen(e.id)}>
                    <span className="leaf-date">
                      {fmt.short(e.createdAt)} <i>·</i> {fmt.time(e.createdAt)}
                      {e.updatedAt - e.createdAt > 60_000 ? <em> · revised</em> : null}
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

function Page({
  id,
  entry,
  all,
  commit,
  onClose,
}: {
  id: string;
  entry: Entry | null;
  all: Entry[];
  commit: (next: Entry[]) => boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [body, setBody] = useState(entry?.body ?? '');
  const [state, setState] = useState<SaveState>(entry ? 'saved' : 'idle');
  const created = useRef(entry?.createdAt ?? Date.now());
  const latest = useRef({ body, all });
  latest.current = { body, all };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  const persist = useCallback(() => {
    const { body: b, all: list } = latest.current;
    const exists = list.some((e) => e.id === id);
    if (!b.trim()) {
      // a blank page is not kept
      if (exists) {
        const next = list.filter((e) => e.id !== id);
        latest.current = { body: b, all: next };
        commit(next);
      }
      setState('idle');
      return;
    }
    const now = Date.now();
    const next = exists
      ? list.map((e) => (e.id === id ? { ...e, body: b, updatedAt: e.body === b ? e.updatedAt : now } : e))
      : [...list, { id, body: b, createdAt: created.current, updatedAt: now }];
    latest.current = { body: b, all: next };
    setState(commit(next) ? 'saved' : 'failed');
  }, [commit, id]);

  // save a moment after typing pauses, and always on the way out
  useEffect(() => {
    const flush = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        persist();
      }
    };
    const onHide = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [persist]);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function onChange(v: string) {
    setBody(v);
    setState('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      persist();
    }, 700);
  }

  function close() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    persist();
    onClose();
  }

  function remove() {
    if (!window.confirm('Delete this page? It can’t be brought back.')) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    latest.current = { body: '', all: latest.current.all };
    commit(latest.current.all.filter((e) => e.id !== id));
    onClose();
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

  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const saved = all.find((e) => e.id === id);

  return (
    <main className="archives writing">
      <header className="page-top">
        <button type="button" className="quiet back" onClick={close}>
          ← The Archives
        </button>
        <span className="page-date">{fmt.day(created.current)}</span>
        <span className={`saved s-${state}`} aria-live="polite">
          {state === 'saving' ? 'Saving' : state === 'saved' ? 'Saved' : state === 'failed' ? 'Couldn’t save' : ''}
        </span>
      </header>

      <label htmlFor="page" className="sr">
        Write freely
      </label>
      <textarea
        id="page"
        ref={area}
        className="sheet"
        value={body}
        placeholder="Leave something here…"
        onChange={(e) => onChange(e.target.value)}
        spellCheck
      />

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
