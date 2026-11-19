'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StoredDraft, TalkSummary } from '@/lib/draft';
import { useDictation } from '@/lib/dictation';
import Review from './Review';
import Conversations from './Conversations';
import AddMemory from './AddMemory';
import { confirmSheet } from '@/lib/confirm';
import Tree from './Tree';
import Masthead from './Masthead';
import { PREFILL_KEY } from '@/lib/archive';
import { echoOf } from '@/lib/memory';
import { locLine, placeKey as placeKeyOf, placeTitle, suggestionKey, usePlaces } from '@/lib/places';
import { api, pagesOfMemory, peopleOf, useStore, type Stored } from '@/lib/store';
import { CollectionPicker, Names, PeoplePicker, pageTitle } from './Pickers';
import Revisits from './Revisits';
import { activityOf, AgentState, foundIn, FoundMemories, Proposals, usePrompts, type Action, type Mode } from './Agent';
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

type Open = { talk: TalkSummary; messages: unknown[]; drafts: StoredDraft[] } | null;

const VOICE_OK = 'whatstayed:voice-explained';

/** What the server said went wrong, in its own words when it gave some. */
function reason(e?: Error) {
  if (!e) return '';
  try {
    const j = JSON.parse(e.message);
    if (j && typeof j.error === 'string') return j.error;
  } catch {
    /* not JSON */
  }
  return /fetch|network/i.test(e.message) ? 'You seem to be offline.' : '';
}

export default function Garden({ open }: { open: Open }) {
  const [talk, setTalk] = useState<TalkSummary | null>(open?.talk ?? null);
  const talkRef = useRef<string | null>(open?.talk.id ?? null);
  const focusRef = useRef<string | null>(null);
  const [drafts, setDrafts] = useState<StoredDraft[]>(open?.drafts ?? []);
  const initial = useMemo(() => (open?.messages ?? []) as UIMessage[], [open]);
  const { messages, sendMessage, status, error, clearError, regenerate } = useChat({
    id: open?.talk.id ?? 'new',
    messages: initial,
    transport: new DefaultChatTransport({
      api: '/api/remember',
      prepareSendMessagesRequest: ({ messages: ms }) => ({ body: { messages: ms, talkId: talkRef.current, focus: focusRef.current } }),
    }),
  });
  const [draft, setDraft] = useState('');
  const [snap, store] = useStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [showTalks, setShowTalks] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [hint, setHint] = useState('');
  const [voiceAsk, setVoiceAsk] = useState(false);
  const [actions, setActions] = useState<Action[]>([]);
  const [mode, setMode] = useState<Mode>('remember');
  const justSaved = useRef<string[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const busy = status === 'submitted' || status === 'streaming';
  const pending = drafts.filter((d) => d.status === 'draft');

  // The conversation is kept in the account a moment after each reply settles, and its drafts fetched again.
  const savedCount = useRef(initial.length);
  const syncTalk = useCallback(
    async (msgs: UIMessage[]) => {
      const id = talkRef.current;
      if (!id) return;
      try {
        if (msgs.length !== savedCount.current) {
          await api(`/api/talks/${encodeURIComponent(id)}`, { method: 'PUT', json: { messages: msgs.slice(-400) } });
          savedCount.current = msgs.length;
        }
        const [r, a] = await Promise.all([
          api<{ talk: TalkSummary; drafts: StoredDraft[] }>(`/api/talks/${encodeURIComponent(id)}`),
          api<{ actions: Action[] }>(`/api/actions?talk=${encodeURIComponent(id)}`),
        ]);
        setDrafts(r.drafts);
        setTalk(r.talk);
        setActions(a.actions);
      } catch (e) {
        store.toast(e instanceof Error ? e.message : 'The conversation couldn’t be saved.', 'error');
      }
    },
    [store],
  );
  useEffect(() => {
    if (status === 'ready' && messages.length && messages.length !== savedCount.current) syncTalk(messages);
  }, [messages, status, syncTalk]);
  // a reply that proposed something: fetch the proposal so its card appears
  const lastId = messages[messages.length - 1]?.id;
  useEffect(() => {
    if (status !== 'ready' || !talkRef.current) return;
    api<{ actions: Action[] }>(`/api/actions?talk=${encodeURIComponent(talkRef.current)}`)
      .then((a) => setActions(a.actions))
      .catch(() => {});
  }, [status, lastId]);

  const dictation = useDictation(
    (text) => setDraft(text.slice(0, 2000)),
    (msg) => store.toast(msg, 'error'),
  );

  // /?trip=1 starts a conversation about a trip (from Today)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('trip') === '1') {
      window.history.replaceState(null, '', '/');
      startTalk('trip');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // /?ask=<question> asks the agent straight away (from a suggestion on Today)
  useEffect(() => {
    const ask = new URLSearchParams(window.location.search).get('ask');
    if (!ask) return;
    window.history.replaceState(null, '', '/');
    (async () => {
      const made = await store.newTalk('free');
      if (!made) return;
      talkRef.current = made.id;
      setTalk(made);
      window.history.replaceState(null, '', `/?c=${encodeURIComponent(made.id)}`);
      setMode('ask');
      sendMessage({ text: ask.slice(0, 400) });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const story = useMemo(
    () =>
      messages
        .filter((m) => m.role === 'user')
        .map((m) => textOf(m))
        .filter((t) => t && !/^(that['’]?s all|i['’]?m done|done|nothing else)\b/i.test(t))
        .join('\n\n'),
    [messages],
  );
  // subtle marks on each blossom, and where each one grows: near its trip, or near a memory it's tied to
  const marks = useMemo(
    () =>
      memories.map((m) => ({
        photo: snap.media.some((x) => x.ownerType === 'memory' && x.ownerId === m.id && x.kind === 'photo'),
        place: !!places.store.locations[m.id]?.lat,
        linked: places.store.threads.some((t) => t.a === m.id || t.b === m.id),
      })),
    [memories, snap.media, places.store],
  );
  const anchors = useMemo(
    () =>
      memories.map((m, i) => {
        const trip = m.extra?.trip?.talkId;
        if (trip) {
          const j = memories.findIndex((o, k) => k < i && o.extra?.trip?.talkId === trip);
          if (j >= 0) return j;
        }
        for (const t of places.store.threads) {
          const other = t.a === m.id ? t.b : t.b === m.id ? t.a : null;
          const j = other ? memories.findIndex((o, k) => k < i && o.id === other) : -1;
          if (j >= 0) return j;
        }
        return null;
      }),
    [memories, places.store.threads],
  );
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && textOf(m));
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const voice = lastAssistant ? textOf(lastAssistant) : '';
  const latestIsUser = messages.length > 0 && messages[messages.length - 1].role === 'user';

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (busy) return;
    if (dictation.listening) dictation.stop();
    if (text.length < 2) {
      setHint(text ? 'Say a little more, even a few words.' : 'Write a few words first: a place, a moment.');
      inputRef.current?.focus();
      return;
    }
    setHint('');
    clearError();
    if (!talkRef.current) {
      const made = await store.newTalk('free');
      if (!made) return;
      talkRef.current = made.id;
      setTalk(made);
      window.history.replaceState(null, '', `/?c=${encodeURIComponent(made.id)}`);
    }
    sendMessage({ text });
    setDraft('');
    setSelectedId(null);
  }

  async function startTalk(mode: 'free' | 'trip') {
    const made = await store.newTalk(mode);
    if (made) window.location.assign(`/?c=${encodeURIComponent(made.id)}`);
  }

  function toggleVoice() {
    if (dictation.listening) return dictation.stop();
    let explained = false;
    try {
      explained = !!localStorage.getItem(VOICE_OK);
    } catch {
      /* storage unavailable */
    }
    if (!explained) return setVoiceAsk(true);
    dictation.start(draft);
  }

  async function beginAgain() {
    if (
      !(await confirmSheet({
        title: 'Clear the whole garden?',
        body: 'Every memory, its places, threads and photographs, and every conversation. The Archives aren’t affected. This can’t be undone.',
        yes: 'Clear the garden',
        danger: true,
      }))
    )
      return;
    const ok = await store.clearGarden();
    if (!ok) return;
    window.location.assign('/');
  }

  async function letGo() {
    if (!sel) return;
    if (
      !(await confirmSheet({
        title: 'Delete this memory?',
        body: 'Its place, threads, photographs and recordings are deleted too. This can’t be undone.',
        yes: 'Delete memory',
        danger: true,
      }))
    )
      return;
    const ok = await store.deleteMemory(sel.id);
    if (ok) setSelectedId(null);
  }

  const sel = selected >= 0 ? memories[selected] : null;
  focusRef.current = sel?.id ?? null;
  const prompts = usePrompts(mode, sel ? (places.store.locations[sel.id]?.city || sel.place) : undefined);
  const found = useMemo(() => (busy ? [] : foundIn([...messages].reverse().find((m) => m.role === 'assistant'))), [messages, busy]);
  const lit = useMemo(() => found.map((f) => memories.findIndex((m) => m.id === f.id)).filter((i) => i >= 0), [found, memories]);
  const activity = activityOf(messages, status, dictation.listening);
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
    <main className={`garden${busy ? ' listening' : ''}${messages.length || pending.length ? ' talking' : ''}`}>
      <h1 className="sr">What Stayed, the garden</h1>
      <Masthead room="garden">
        <button
          type="button"
          className="quiet"
          onClick={() => {
            store.refresh().catch(() => {});
            setShowTalks(true);
          }}
        >
          Conversations
        </button>
        <button type="button" className="quiet" onClick={() => startTalk('trip')}>
          Tell it about a trip
        </button>
        <button type="button" className="quiet" onClick={() => setEditing('new')}>
          Plant by hand
        </button>
      </Masthead>

      <section className="stage">
        <Tree memories={memories} threads={threads} selected={selected >= 0 ? selected : null} onSelect={setSelected} buds={pending.length} marks={marks} anchors={anchors} lit={lit} />
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
            {sel.extra?.title && <p className="card-title">{sel.extra.title}</p>}
            <p className="card-moment">{sel.moment}</p>
            {sel.extra?.narrative && <p className="card-narrative">{sel.extra.narrative}</p>}
            {(sel.extra?.senses?.length || sel.extra?.objects?.length) ? (
              <p className="card-details">{[...(sel.extra?.senses ?? []), ...(sel.extra?.objects ?? [])].join(' · ')}</p>
            ) : null}
            <p className="card-meta">
              {sel.when ? <span>{sel.when}</span> : sel.date ? <span>{new Date(sel.date + 'T12:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</span> : null}
              {sel.extra?.unsure?.some((u) => u === 'when' || u === 'date') && <em className="unsure">not sure</em>}
              {sel.feeling ? <span>{sel.feeling}</span> : null}
              {sel.extra?.trip && <span>{sel.extra.trip.title}</span>}
            </p>
            <p className="card-with">
              {selPeople.length ? <>With <Names people={selPeople} />. </> : null}
              <button type="button" className="quiet" onClick={() => setEditing('people')}>
                {selPeople.length ? 'Who else' : 'Who was there?'}
              </button>
            </p>
            <p className="card-links card-tend">
              <Link className="quiet strong" href={`/memory/${encodeURIComponent(sel.id)}`}>
                Open
              </Link>
              <button type="button" className="quiet" onClick={() => setEditing('memory')}>
                Edit
              </button>
              <button type="button" className="quiet danger" onClick={letGo}>
                Delete
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
        {(talk || pending.length > 0) && (
          <p className="talk-head">
            {talk && (
              <span className="talk-name">
                {talk.mode === 'trip' ? 'Trip · ' : ''}
                {talk.trip?.title || talk.title || 'New conversation'}
              </span>
            )}
            {messages.length > 0 && (
              <button type="button" className="quiet" onClick={() => setShowLog((v) => !v)} aria-expanded={showLog}>
                {showLog ? 'Hide the conversation' : 'The conversation'}
              </button>
            )}
            {pending.length > 0 && (
              <button type="button" className="review-go" onClick={() => setReviewing(true)}>
                <span className="bud-dot" aria-hidden="true" />
                Review {pending.length === 1 ? '1 memory' : `${pending.length} memories`}
              </button>
            )}
          </p>
        )}
        {messages.length === 0 ? (
          <div className="voice">
            {talk?.mode === 'trip' ? (
              <>
                <p className="voice-line">Where did you go?</p>
                <p className="voice-sub">Tell it about one trip in your own words. Skip anything, change the subject, or stop whenever you like.</p>
              </>
            ) : (
              <>
                <p className="voice-line">{mode === 'remember' ? 'You talk. It remembers.' : mode === 'ask' ? 'Ask your garden' : 'Reflect'}</p>
                <p className="voice-sub">
                  {mode === 'remember'
                    ? 'Tell it about a place, a person or a day, in your own words. It drafts the memories, and nothing is kept until you review it.'
                    : mode === 'ask'
                      ? 'Ask what you remember about a place or a person, or ask it to connect memories. It answers only from what you’ve kept.'
                      : 'Ask for a reflection or a summary of a time. It is built only from your saved memories, and kept only if you choose.'}
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="voice">
            {lastUser && <p className="you">{textOf(lastUser)}</p>}
            {error ? (
              <div className="voice-fail" role="alert">
                <p className="voice-line rest">The reply didn’t come through. {reason(error) || 'Nothing was lost.'}</p>
                <p className="voice-fail-acts">
                  <button type="button" className="quiet strong" onClick={() => { clearError(); regenerate(); }}>
                    Try again
                  </button>
                  <button type="button" className="quiet" onClick={() => setEditing('new')}>
                    Write it yourself
                  </button>
                </p>
              </div>
            ) : activity && (latestIsUser || !voice || busy) && activity !== 'Listening' ? (
              <AgentState label={activity} />
            ) : (
              <p className="voice-line" key={lastAssistant?.id}>
                {voice}
              </p>
            )}
          </div>
        )}

        {!busy && <FoundMemories found={found} onOpen={(id) => setSelectedId(id)} />}
        <Proposals
          actions={actions}
          onDecided={(a) => {
            setActions((xs) => xs.map((x) => (x.id === a.id ? { ...x, status: a.status, error: a.error } : x)));
            if (a.status === 'done' && a.kind === 'delete-memory') setSelectedId(null);
          }}
        />
        {dictation.listening && <AgentState label="Listening" />}
        {!busy && (
          <div className="agent-modes">
            <p className="agent-mode-row" role="radiogroup" aria-label="What would you like to do?">
              {(
                [
                  ['remember', 'Remember'],
                  ['ask', 'Ask'],
                  ['reflect', 'Reflect'],
                ] as const
              ).map(([k, label]) => (
                <button key={k} type="button" role="radio" aria-checked={mode === k} className="agent-mode" onClick={() => setMode(k)}>
                  {label}
                </button>
              ))}
            </p>
            {prompts.length > 0 && (
              <p className="agent-prompts">
                {prompts.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="agent-prompt"
                    onClick={() => {
                      if (p.endsWith('…')) {
                        setDraft(p.replace(/…$/, ' '));
                        requestAnimationFrame(() => inputRef.current?.focus());
                      } else {
                        setDraft(p);
                        requestAnimationFrame(() => inputRef.current?.form?.requestSubmit());
                      }
                    }}
                  >
                    {p}
                  </button>
                ))}
              </p>
            )}
          </div>
        )}
        <form className={`say${dictation.listening ? ' hearing' : ''}`} onSubmit={submit} noValidate>
          <label htmlFor="say" className="sr">
            Tell the garden a memory
          </label>
          <textarea
            id="say"
            ref={inputRef}
            rows={1}
            maxLength={2000}
            value={draft}
            placeholder={
              dictation.listening
                ? 'Listening…'
                : mode === 'ask'
                  ? 'What do you remember about…'
                  : mode === 'reflect'
                    ? 'Reflect on…'
                    : messages.length === 0
                      ? talk?.mode === 'trip'
                        ? 'Edinburgh, last October…'
                        : 'The night market in Taipei, the steam…'
                      : 'Say a little more…'
            }
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
          {dictation.supported && (
            <button
              type="button"
              className={`mic${dictation.listening ? ' on' : ''}`}
              onClick={toggleVoice}
              aria-pressed={dictation.listening}
              aria-label={dictation.listening ? 'Stop listening' : 'Speak instead of typing'}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="9" y="3.5" width="6" height="11" rx="3" />
                <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" />
              </svg>
            </button>
          )}
          <button type="submit" disabled={busy} aria-label="Send" className={draft.trim() ? 'ready' : ''}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h13M13 6l6 6-6 6" />
            </svg>
          </button>
        </form>
        {voiceAsk && (
          <div className="loc-ask voice-ask" role="group" aria-label="Speak instead of typing">
            <p>
              Your browser will ask to use the microphone and turn what you say into text in the writing line, for you to read and change before sending. What Stayed keeps no recording. In Chrome and Safari, the transcription is done by Google or Apple.
            </p>
            <button
              type="button"
              className="quiet strong"
              onClick={() => {
                try {
                  localStorage.setItem(VOICE_OK, '1');
                } catch {
                  /* storage unavailable */
                }
                setVoiceAsk(false);
                dictation.start(draft);
              }}
            >
              Start speaking
            </button>
            <button type="button" className="quiet" onClick={() => setVoiceAsk(false)}>
              Not now
            </button>
          </div>
        )}
        {hint ? (
          <p className="hint" id="say-hint" role="alert">
            {hint}
          </p>
        ) : (
          <p className="privacy">{dictation.listening ? 'Listening. Tap the microphone again to stop.' : 'Private to your account.'}</p>
        )}
      </section>

      {showLog && (
        <aside className="log" aria-label="The conversation">
          {messages.map((m) => {
            const t = textOf(m);
            const planted = m.parts.filter((p) => p.type === 'tool-plantMemory').length;
            const drafted = m.parts
              .filter((p) => p.type === 'tool-draftMemory')
              .map((p) => ((p as { input?: { title?: string } }).input?.title ?? 'a memory'));
            const did = m.parts
              .filter((p) => p.type.startsWith('tool-') && p.type !== 'tool-draftMemory' && p.type !== 'tool-plantMemory')
              .map((p) => {
                const o = (p as { output?: { error?: string; total?: number; found?: number } }).output;
                const name = p.type.slice(5).replace(/([A-Z])/g, ' $1').toLowerCase();
                return o?.error ? `${name}: didn’t work` : typeof o?.total === 'number' ? `${name}: ${o.total} found` : name;
              });
            return (
              <div key={m.id} className={`log-line ${m.role}`}>
                {t && <p>{t}</p>}
                {planted > 0 && <p className="log-planted">✿ planted</p>}
                {drafted.map((d, k) => (
                  <p key={k} className="log-planted">
                    ✿ drafted: {d}
                  </p>
                ))}
                {did.map((d, k) => (
                  <p key={`t${k}`} className="log-tool">
                    · {d}
                  </p>
                ))}
              </div>
            );
          })}
        </aside>
      )}

      {reviewing && talk && (
        <Review
          talk={talk}
          drafts={drafts}
          story={story}
          onClose={() => {
            setReviewing(false);
            syncTalk(messages);
            // after saving, the newest memory opens on the tree
            const last = justSaved.current[justSaved.current.length - 1];
            justSaved.current = [];
            if (last) setSelectedId(last);
          }}
          onSaved={(ids) => {
            justSaved.current = ids;
            syncTalk(messages);
          }}
        />
      )}
      {showTalks && (
        <Conversations
          current={talk?.id}
          onClose={() => setShowTalks(false)}
          onNew={(mode) => startTalk(mode)}
          onClearGarden={beginAgain}
        />
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
        <AddMemory
          onClose={() => setEditing(null)}
          onPlanted={(id) => {
            setEditing(null);
            store.toast('Planted. A new blossom is opening.');
            setSelectedId(id);
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
