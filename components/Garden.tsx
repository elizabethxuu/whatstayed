'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Tree from './Tree';
import Masthead from './Masthead';
import { PREFILL_KEY } from '@/lib/archive';
import { echoOf, extractMemories } from '@/lib/memory';
import { locLine, placeKey as placeKeyOf, placeTitle, suggestionKey, usePlaces } from '@/lib/places';
import { api, pagesOfMemory, peopleOf, useStore, type Stored } from '@/lib/store';
import { CollectionPicker, Names, PeoplePicker, pageTitle } from './Pickers';
import Revisits from './Revisits';
import LocationEditor from './LocationEditor';
import ThreadPicker from './ThreadPicker';
import MemoryEditor from './MemoryEditor';
import MediaShelf from './MediaShelf';
import ThreadNote from './ThreadNote';
import Link from 'next/link';
import type { CSSProperties } from 'react';

function textOf(m?: UIMessage) {
  if (!m) return '';
  return m.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join(' ')
    .trim();
}

export default function Garden({ initial }: { initial: UIMessage[] }) {
  const { messages, sendMessage, status, error, setMessages, clearError } = useChat({
    messages: initial,
    transport: new DefaultChatTransport({ api: '/api/remember' }),
  });
  const [draft, setDraft] = useState('');
  const [snap, store] = useStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [hint, setHint] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const busy = status === 'submitted' || status === 'streaming';

  // The conversation is kept in the account, a moment after each reply settles.
  const savedCount = useRef(initial.length);
  const lastSaved = useRef(JSON.stringify(initial.map((m) => m.id)) + initial.length);
  const saveConversation = useCallback(async (msgs: UIMessage[]) => {
    const sig = JSON.stringify(msgs.map((m) => m.id)) + msgs.length;
    if (sig === lastSaved.current) return;
    try {
      await api('/api/conversation', { method: 'PUT', json: { messages: msgs.slice(-400) } });
      lastSaved.current = sig;
      savedCount.current = msgs.length;
    } catch (e) {
      store.toast(e instanceof Error ? e.message : 'The conversation couldn’t be saved.', 'error');
    }
  }, [store]);
  useEffect(() => {
    if (status === 'ready' && messages.length !== savedCount.current) saveConversation(messages);
  }, [messages, status, saveConversation]);

  // The agent plants straight into the account; when it has, fetch the garden again.
  const planted = useMemo(() => extractMemories(messages as never).map((m) => m.id), [messages]);
  const handled = useRef(new Set(planted)); // planted before this visit: never re-fetched, even if since let go
  useEffect(() => {
    if (status !== 'ready') return;
    const fresh = planted.filter((id) => !handled.current.has(id));
    if (!fresh.length) return;
    fresh.forEach((id) => handled.current.add(id));
    store
      .refresh()
      .then(() => setSelectedId(fresh[fresh.length - 1]))
      .catch(() => store.toast('The new memory was planted, but the garden couldn’t refresh. Reload to see it.', 'error'));
  }, [planted, status, store]);

  // /?m=<id> opens that memory (from People, the Timeline, search or a collection)
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get('m');
    if (m) {
      setSelectedId(m);
      window.history.replaceState(null, '', '/');
    }
  }, []);

  // A page carried over from the Archives lands in the writing line, unsent.
  useEffect(() => {
    try {
      const carried = sessionStorage.getItem(PREFILL_KEY);
      if (carried) {
        sessionStorage.removeItem(PREFILL_KEY);
        setDraft(carried.slice(0, 1200));
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.loc-veil')) return;
      setShowLog(false);
      setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const memories: Stored[] = snap.memories;
  const places = usePlaces();
  const [editing, setEditing] = useState<'place' | 'tie' | 'memory' | 'new' | 'people' | 'collect' | null>(null);
  const selected = selectedId ? memories.findIndex((m) => m.id === selectedId) : -1;
  const setSelected = useCallback((i: number | null) => setSelectedId(i === null ? null : memories[i]?.id ?? null), [memories]);

  // the red thread on the tree: only connections the person made or approved
  const threads = useMemo(() => {
    const at = new Map(memories.map((m, i) => [m.id, i]));
    return places.store.threads
      .map((t) => [at.get(t.a), at.get(t.b)] as const)
      .filter((p): p is readonly [number, number] => p[0] !== undefined && p[1] !== undefined);
  }, [memories, places.store.threads]);

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && textOf(m));
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const voice = lastAssistant ? textOf(lastAssistant) : '';
  const latestIsUser = messages.length > 0 && messages[messages.length - 1].role === 'user';

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (busy) return;
    if (text.length < 2) {
      setHint(text ? 'Say a little more, even a few words.' : 'Write a few words first: a place, a moment.');
      inputRef.current?.focus();
      return;
    }
    setHint('');
    clearError();
    sendMessage({ text });
    setDraft('');
    setSelectedId(null);
  }

  async function beginAgain() {
    if (!window.confirm('Clear your tree, its places, threads and photographs, and begin again? Your Archives stay. This can’t be undone.')) return;
    const ok = await store.clearGarden();
    if (!ok) return;
    setMessages([]);
    savedCount.current = 0;
    lastSaved.current = '[]0';
    handled.current = new Set();
    setSelectedId(null);
    setShowLog(false);
    inputRef.current?.focus();
  }

  async function letGo() {
    if (!sel) return;
    if (!window.confirm('Let this memory go? Its place, threads, photographs and recordings go with it. This can’t be undone.')) return;
    const ok = await store.deleteMemory(sel.id);
    if (ok) setSelectedId(null);
  }

  const sel = selected >= 0 ? memories[selected] : null;
  const selPeople = sel ? peopleOf(snap, 'memory-person', sel.id) : [];
  const selPages = sel ? pagesOfMemory(snap, sel.id) : [];
  const selLoc = sel ? places.store.locations[sel.id] : undefined;
  const selTies = sel
    ? places.store.threads
        .filter((t) => t.a === sel.id || t.b === sel.id)
        .map((t) => {
          const other = memories.find((m) => m.id === (t.a === sel.id ? t.b : t.a));
          if (!other) return null;
          const ol = places.store.locations[other.id];
          return { t, name: ol ? placeTitle(ol) : other.place };
        })
        .filter((x): x is { t: (typeof places.store.threads)[number]; name: string } => x !== null)
    : [];
  // The agent may suggest a connection; it only becomes a thread if the person approves it.
  const suggestion = useMemo(() => {
    if (selected < 0 || !sel) return null;
    const back = echoOf(memories, selected);
    if (back === null) return null;
    const other = memories[back];
    const key = suggestionKey(sel.id, other.id);
    const tied = places.store.threads.some((t) => suggestionKey(t.a, t.b) === key);
    if (tied || places.store.dismissed.includes(key)) return null;
    return { other, key, because: sel.because };
  }, [memories, selected, sel, places.store]);

  return (
    <main className={`garden${busy ? ' listening' : ''}`}>
      <h1 className="sr">What Stayed, the garden</h1>
      <Masthead room="garden">
        <button type="button" className="quiet" onClick={() => setEditing('new')}>
          Plant by hand
        </button>
        {messages.length > 0 && (
          <button type="button" className="quiet" onClick={() => setShowLog((v) => !v)} aria-expanded={showLog}>
            {showLog ? 'Close' : 'Conversation'}
          </button>
        )}
        {(messages.length > 0 || memories.length > 0) && (
          <button type="button" className="quiet" onClick={beginAgain}>
            Begin again
          </button>
        )}
      </Masthead>

      <section className="stage">
        <Tree memories={memories} threads={threads} selected={selected >= 0 ? selected : null} onSelect={setSelected} />
        {memories.length > 0 && (
          <p className="fig" aria-hidden="true">
            Fig. {memories.length} · {memories.length === 1 ? 'one memory, kept' : `${memories.length} memories, kept`}
          </p>
        )}
        {memories.length > 0 && (
          <div className="drift" aria-hidden="true">
            {Array.from({ length: Math.min(6, memories.length + 2) }).map((_, i) => {
              const h = (n: number) => ((Math.sin((i + 1) * n * 7.13) * 9301.7) % 1 + 1) % 1;
              return (
                <span
                  key={i}
                  style={
                    {
                      left: `${30 + h(1) * 40}%`,
                      top: `${16 + h(2) * 22}%`,
                      '--s': (0.65 + h(3) * 0.7).toFixed(2),
                      '--o': (0.45 + h(4) * 0.4).toFixed(2),
                      '--dx': `${(h(5) - 0.3) * 160}px`,
                      animationDuration: `${(19 + h(6) * 12).toFixed(1)}s`,
                      animationDelay: `${(3 + i * 6.5 + h(7) * 3).toFixed(1)}s`,
                    } as CSSProperties
                  }
                >
                  <i style={{ animationDuration: `${(3.5 + h(8) * 2.5).toFixed(1)}s` }} />
                </span>
              );
            })}
          </div>
        )}
        {sel && (
          <aside className="card" aria-live="polite">
            <button type="button" className="x" aria-label="Close" onClick={() => setSelectedId(null)}>
              Close
            </button>
            <p className="card-no">No. {String(selected + 1).padStart(2, '0')}</p>
            <p className="card-place">{selLoc ? placeTitle(selLoc) : sel.place}</p>
            <p className="card-moment">“{sel.moment}”</p>
            <p className="card-meta">
              {sel.when ? <span>{sel.when}</span> : sel.date ? <span>{new Date(sel.date + 'T12:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</span> : null}
              <span>{sel.feeling}</span>
            </p>
            <p className="card-with">
              {selPeople.length ? <>With <Names people={selPeople} />. </> : null}
              <button type="button" className="quiet" onClick={() => setEditing('people')}>
                {selPeople.length ? 'Who else' : 'Who was there?'}
              </button>
            </p>
            <p className="card-links card-tend">
              <button type="button" className="quiet" onClick={() => setEditing('memory')}>
                Edit
              </button>
              <button type="button" className="quiet danger" onClick={letGo}>
                Let it go
              </button>
            </p>
            <MediaShelf key={sel.id} owner={{ type: 'memory', id: sel.id }} compact />
            {selPages.map(({ e, note }) => (
              <p key={e.id} className="card-thread">
                Written about: <Link href={`/archives?e=${encodeURIComponent(e.id)}`}>{pageTitle(e)}</Link>
                {note ? ` · ${note}` : ''}
              </p>
            ))}
            <div className="card-where">
              {selLoc ? (
                <>
                  <p className="card-loc">{locLine(selLoc)}</p>
                  <p className="card-links">
                    <button type="button" className="quiet" onClick={() => setEditing('place')}>
                      Edit place
                    </button>
                    {selLoc.lat !== undefined && (
                      <Link className="quiet" href={`/places?p=${encodeURIComponent(placeKeyOf(selLoc))}`}>
                        See on the map
                      </Link>
                    )}
                  </p>
                </>
              ) : (
                <button type="button" className="quiet" onClick={() => setEditing('place')}>
                  Add a place
                </button>
              )}
            </div>
            {selTies.map(({ t, name }) => (
              <p key={t.id} className="card-thread">
                Tied to {name}
                {t.note ? `: ${t.note}` : ''}{' '}
                <ThreadNote note={t.note} label={name} onSave={(n) => places.updateThread(t.id, n)} />
                <button type="button" className="untie" onClick={() => places.untie(t.id)} aria-label={`Untie from ${name}`}>
                  untie
                </button>
              </p>
            ))}
            {suggestion && (
              <div className="card-suggest">
                <p>
                  This might connect to {suggestion.other.place}
                  {suggestion.because ? `: ${suggestion.because}` : ''}. Tie them?
                </p>
                <button type="button" className="quiet" onClick={() => places.tie(sel.id, suggestion.other.id, 'suggested', suggestion.because)}>
                  Tie them
                </button>
                <button type="button" className="quiet" onClick={() => places.dismiss(suggestion.key)}>
                  Not really
                </button>
              </div>
            )}
            <p className="card-links card-more">
              {memories.length > 1 && (
                <button type="button" className="quiet" onClick={() => setEditing('tie')}>
                  Tie a red thread…
                </button>
              )}
              <button type="button" className="quiet" onClick={() => setEditing('collect')}>
                Keep in a collection…
              </button>
            </p>
          </aside>
        )}
      </section>

      <Revisits onOpen={(id) => setSelectedId(id)} />
      <section className="talk" aria-live="polite">
        {messages.length === 0 ? (
          <div className="voice">
            <p className="voice-line">What stayed with you?</p>
            <p className="voice-sub">Tell me about a place you’ve been, and a moment from it.</p>
          </div>
        ) : (
          <div className="voice">
            {lastUser && <p className="you">{textOf(lastUser)}</p>}
            {error ? (
              <p className="voice-line rest">The garden is resting right now. Please try again in a little while.</p>
            ) : busy && latestIsUser ? (
              <p className="listening" aria-label="Listening">
                <i />
                <i />
                <i />
              </p>
            ) : (
              <p className="voice-line" key={lastAssistant?.id}>
                {voice}
              </p>
            )}
          </div>
        )}

        <form className="say" onSubmit={submit} noValidate>
          <label htmlFor="say" className="sr">
            Tell the garden a memory
          </label>
          <textarea
            id="say"
            ref={inputRef}
            rows={1}
            maxLength={1200}
            value={draft}
            placeholder={messages.length === 0 ? 'The night market in Taipei, the steam…' : 'Say a little more…'}
            required
            minLength={2}
            aria-required="true"
            aria-invalid={hint ? true : undefined}
            aria-describedby={hint ? 'say-hint' : undefined}
            onChange={(e) => {
              setDraft(e.target.value);
              if (hint) setHint('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button type="submit" disabled={busy} aria-label="Send" className={draft.trim() ? 'ready' : ''}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h13M13 6l6 6-6 6" />
            </svg>
          </button>
        </form>
        {hint ? (
          <p className="hint" id="say-hint" role="alert">
            {hint}
          </p>
        ) : (
          <p className="privacy">Kept in your account. Only you can see it.</p>
        )}
      </section>

      {showLog && (
        <aside className="log" aria-label="The conversation">
          {messages.map((m) => {
            const t = textOf(m);
            const planted = m.parts.filter((p) => p.type === 'tool-plantMemory').length;
            return (
              <div key={m.id} className={`log-line ${m.role}`}>
                {t && <p>{t}</p>}
                {planted > 0 && <p className="log-planted">✿ planted</p>}
              </div>
            );
          })}
        </aside>
      )}

      {sel && editing === 'place' && (
        <LocationEditor
          memory={sel}
          current={selLoc}
          onClose={() => setEditing(null)}
          onSave={(loc) => {
            places.setLocation(sel.id, loc);
            setEditing(null);
          }}
          onRemove={
            selLoc
              ? () => {
                  places.removeLocation(sel.id);
                  setEditing(null);
                }
              : undefined
          }
        />
      )}
      {editing === 'new' && (
        <MemoryEditor
          onClose={() => setEditing(null)}
          onSave={async (m) => {
            const made = await store.createMemory(m);
            if (made) setSelectedId(made.id);
            return made;
          }}
        />
      )}
      {sel && editing === 'memory' && <MemoryEditor memory={sel} onClose={() => setEditing(null)} onSave={(m) => store.updateMemory(sel.id, m)} />}
      {sel && editing === 'people' && (
        <PeoplePicker
          kicker={`For “${sel.moment.length > 50 ? sel.moment.slice(0, 48) + '…' : sel.moment}”`}
          chosen={selPeople.map((p) => p.id)}
          onToggle={(pid, on) => (on ? store.link({ kind: 'memory-person', a: sel.id, b: pid }, true) : store.unlink({ kind: 'memory-person', a: sel.id, b: pid }))}
          onClose={() => setEditing(null)}
        />
      )}
      {sel && editing === 'collect' && <CollectionPicker kind="memory" id={sel.id} onClose={() => setEditing(null)} />}
      {sel && editing === 'tie' && (
        <ThreadPicker
          from={sel}
          others={memories.filter((m) => m.id !== sel.id)}
          locations={places.store.locations}
          onClose={() => setEditing(null)}
          onTie={(other, note) => {
            places.tie(sel.id, other, 'you', note);
            setEditing(null);
          }}
        />
      )}

      <ul className="sr">
        {memories.map((m) => (
          <li key={m.id}>
            {m.place}
            {m.when ? `, ${m.when}` : ''}: {m.moment} ({m.feeling})
          </li>
        ))}
      </ul>
    </main>
  );
}
