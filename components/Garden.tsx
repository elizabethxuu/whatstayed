'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Tree from './Tree';
import type { Memory } from '@/lib/memory';

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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const busy = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    if (status === 'ready') save(messages);
  }, [messages, status]);

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
    if (!text || busy) return;
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

  return (
    <main className="garden">
      <header className="top">
        <h1 className="mark">What Stayed</h1>
        <div className="top-r">
          {memories.length > 0 && (
            <span className="count">
              {memories.length} {memories.length === 1 ? 'blossom' : 'blossoms'}
            </span>
          )}
          {messages.length > 0 && (
            <>
              <button type="button" className="quiet" onClick={() => setShowLog((v) => !v)} aria-expanded={showLog}>
                {showLog ? 'Close the conversation' : 'Read the conversation'}
              </button>
              <button type="button" className="quiet" onClick={beginAgain}>
                Begin again
              </button>
            </>
          )}
        </div>
      </header>

      <section className="stage">
        <Tree memories={memories} selected={selected} onSelect={setSelected} />
        {memories.length > 0 && (
          <div className="drift" aria-hidden="true">
            {Array.from({ length: Math.min(8, memories.length + 2) }).map((_, i) => (
              <i key={i} style={{ left: `${12 + ((i * 37) % 76)}%`, animationDelay: `${i * 2.3}s`, animationDuration: `${14 + (i % 4) * 3}s` }} />
            ))}
          </div>
        )}
        {sel && (
          <aside className="card" aria-live="polite">
            <button type="button" className="x" aria-label="Close" onClick={() => setSelected(null)}>
              ×
            </button>
            <p className="card-place">{sel.place}</p>
            <p className="card-moment">{sel.moment}</p>
            <p className="card-meta">
              {sel.when ? `${sel.when} · ` : ''}
              <span className={sel.weight === 'heavy' ? 'heavy' : ''}>{sel.feeling}</span>
            </p>
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

        <form className="say" onSubmit={submit}>
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
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button type="submit" disabled={!draft.trim() || busy} aria-label="Send">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h13M13 6l6 6-6 6" />
            </svg>
          </button>
        </form>
        <p className="privacy">Your tree lives only in this browser.</p>
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
