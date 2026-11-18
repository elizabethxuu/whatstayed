'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Tree from './Tree';
import Masthead from './Masthead';
import { PREFILL_KEY } from '@/lib/archive';
import { echoOf, type Memory } from '@/lib/memory';
import type { CSSProperties } from 'react';

const KEY = 'whatstayed:v1';

function load(): UIMessage[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(messages: UIMessage[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(messages));
  } catch {
    /* private mode or storage full: the garden still works for this visit */
  }
}

function textOf(m?: UIMessage) {
  if (!m) return '';
  return m.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join(' ')
    .trim();
}

export default function Garden() {
  const [initial, setInitial] = useState<UIMessage[] | null>(null);
  useEffect(() => setInitial(load()), []);
  if (!initial) return <main className="garden" aria-busy="true" />;
  return <Conversation initial={initial} />;
}

function Conversation({ initial }: { initial: UIMessage[] }) {
  const { messages, sendMessage, status, error, setMessages, clearError } = useChat({
    messages: initial,
    transport: new DefaultChatTransport({ api: '/api/remember' }),
  });
  const [draft, setDraft] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [hint, setHint] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const busy = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    if (status === 'ready') save(messages);
  }, [messages, status]);

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
      if (e.key !== 'Escape') return;
      setShowLog(false);
      setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const memories = useMemo<Memory[]>(
    () =>
      messages.flatMap((m) =>
        m.parts
          .filter(
            (p) =>
              p.type === 'tool-plantMemory' &&
              'state' in p &&
              (p.state === 'input-available' || p.state === 'output-available'),
          )
          .map((p) => (p as unknown as { input: Memory }).input),
      ),
    [messages],
  );

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
    setSelected(null);
  }

  function beginAgain() {
    if (!window.confirm('Clear your tree and begin again? This can’t be undone.')) return;
    setMessages([]);
    save([]);
    setSelected(null);
    setShowLog(false);
    inputRef.current?.focus();
  }

  const sel = selected !== null ? memories[selected] : null;
  const selThread = useMemo(() => {
    if (selected === null) return null;
    const back = echoOf(memories, selected);
    if (back !== null) return { place: memories[back].place, because: memories[selected].because };
    for (let k = selected + 1; k < memories.length; k++)
      if (echoOf(memories, k) === selected) return { place: memories[k].place, because: memories[k].because };
    return null;
  }, [memories, selected]);

  return (
    <main className="garden">
      <h1 className="sr">What Stayed, the garden</h1>
      <Masthead room="garden">
        {messages.length > 0 && (
          <>
            <button type="button" className="quiet" onClick={() => setShowLog((v) => !v)} aria-expanded={showLog}>
              {showLog ? 'Close' : 'Conversation'}
            </button>
            <button type="button" className="quiet" onClick={beginAgain}>
              Begin again
            </button>
          </>
        )}
      </Masthead>

      <section className="stage">
        <Tree memories={memories} selected={selected} onSelect={setSelected} />
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
            <button type="button" className="x" aria-label="Close" onClick={() => setSelected(null)}>
              Close
            </button>
            <p className="card-no">No. {String((selected ?? 0) + 1).padStart(2, '0')}</p>
            <p className="card-place">{sel.place}</p>
            <p className="card-moment">“{sel.moment}”</p>
            <p className="card-meta">
              {sel.when ? <span>{sel.when}</span> : null}
              <span>{sel.feeling}</span>
            </p>
            {selThread && (
              <p className="card-thread">
                Tied to {selThread.place}
                {selThread.because ? `: ${selThread.because}` : ''}
              </p>
            )}
          </aside>
        )}
      </section>

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
          <p className="privacy">Your tree lives only in this browser.</p>
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

      <ul className="sr">
        {memories.map((m, i) => (
          <li key={i}>
            {m.place}
            {m.when ? `, ${m.when}` : ''}: {m.moment} ({m.feeling})
          </li>
        ))}
      </ul>
    </main>
  );
}
