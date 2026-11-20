'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Masthead from './Masthead';
import Tree from './Tree';
import GrowthWidget from './Growth';
import AddMemory from './AddMemory';
import Revisits from './Revisits';
import Rediscover from './Rediscover';
import Flower from './Flower';
import { mediaFor, mediaUrl, useQuestions, useStore, type Stored } from '@/lib/store';
import { greeting } from '@/lib/profile';
import { newId, PREFILL_KEY } from '@/lib/archive';
import { placeTitle } from '@/lib/places';
import type { HandDraft } from '@/lib/draft';

export const REVISITED = 'whatstayed:revisited';
const NONE: never[] = [];
const haptic = (ms = 8) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
};

/** Today: a greeting, the tree, one question, what's recent, and the next small step that fits this person. */
export default function Today() {
  const [snap, store] = useStore();
  const router = useRouter();
  const p = snap.profile;
  const [now, setNow] = useState<Date | null>(null);
  const [adding, setAdding] = useState<{ id?: string; initial?: HandDraft } | null>(null);
  const [quick, setQuick] = useState('');
  const [revisited, setRevisited] = useState<string[]>([]);
  const [lastVisit, setLastVisit] = useState<number | null>(null);

  // new blossoms since the last visit (kept in this browser only)
  useEffect(() => {
    const KEY = 'whatstayed:last-visit';
    try {
      const v = Number(localStorage.getItem(KEY) || 0);
      setLastVisit(v || null);
      const t = setTimeout(() => localStorage.setItem(KEY, String(Date.now())), 4000);
      return () => clearTimeout(t);
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    setNow(new Date());
    try {
      setRevisited(JSON.parse(localStorage.getItem(REVISITED) || '[]'));
    } catch {
      /* storage unavailable */
    }
  }, []);

  // ?add=1 opens the memory flow (from the Garden, or a first step)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('add')) {
      setAdding({});
      window.history.replaceState(null, '', '/today');
    }
  }, []);

  const recent = useMemo(() => [...snap.memories].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4), [snap.memories]);
  const revisitedMems = revisited.map((id) => snap.memories.find((m) => m.id === id)).filter((m): m is Stored => !!m).slice(0, 4);
  const waiting = snap.talks.filter((t) => t.drafts > 0);

  function keep(e: FormEvent) {
    e.preventDefault();
    if (quick.trim().length < 2) return;
    haptic();
    setAdding({ initial: { moment: quick.trim(), step: 1, weight: 'light' } });
    setQuick('');
  }

  function talk() {
    try {
      sessionStorage.setItem(PREFILL_KEY, quick.trim());
    } catch {
      /* storage unavailable */
    }
    router.push('/');
  }

  if (!now) return <main className="today" aria-busy="true" />;

  const fresh = lastVisit ? snap.memories.filter((m) => m.createdAt > lastVisit).length : 0;
  // an older memory to bring back today: one of the earliest kept, a different one each day
  const older = [...snap.memories].sort((a, b) => a.createdAt - b.createdAt).slice(0, Math.max(1, Math.ceil(snap.memories.length / 2)));
  const back = snap.memories.length >= 2 ? older[Math.floor(now.getTime() / 86_400_000) % older.length] : null;

  const name = p.name?.trim();
  const dateLine = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const writing = p.ways?.includes('writing') || p.remember?.includes('reflections');
  const reflectionOn = p.reflection?.enabled !== false;
  const sunday = now.getDay() === 0;
  const evening = now.getHours() >= 18;
  const week = snap.memories.filter((m) => now.getTime() - m.createdAt < 7 * 86_400_000);

  return (
    <main className="today">
      <Masthead room="today" />
      <section className="today-page">
        <header className="today-hello">
          <p className="today-date">{dateLine}</p>
          <h1 className="today-greet">
            {greeting(now)}
            {name ? `, ${name}` : ''}.
          </h1>
          {p.intention && p.showIntention !== false && <p className="today-intention">{p.intention}</p>}
          <p className="today-count" aria-live="polite">
            {snap.memories.length === 0
              ? 'Your garden is waiting for its first blossom.'
              : `${snap.memories.length === 1 ? 'One memory' : `${snap.memories.length} memories`} growing in your garden`}
            {fresh > 0 && <span className="today-new"> · {fresh === 1 ? 'a new blossom' : `${fresh} new blossoms`} since you were last here</span>}
          </p>
        </header>

        <div className="today-tree">
          <Tree grow memories={snap.memories} threads={NONE} selected={null} onSelect={(i) => i !== null && snap.memories[i] && router.push(`/memory/${snap.memories[i].id}`)} />
          <form className="today-ask" onSubmit={keep}>
            <label htmlFor="today-q" className="today-q">
              What would you like to remember today?
            </label>
            <textarea id="today-q" rows={2} maxLength={600} value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Something small is fine." onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && keep(e)} />
            <p className="today-ask-acts">
              <button type="submit" className="welcome-go" disabled={quick.trim().length < 2}>
                Keep it
              </button>
              <button type="button" className="quiet" onClick={talk}>
                Talk it through instead
              </button>
              <Link className="quiet today-voice" href="/?talk=new&voice=1" aria-label="Record a voice memory">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="9" y="3.5" width="6" height="11" rx="3" />
                  <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" />
                </svg>
                Speak it
              </Link>
              <button type="button" className="quiet" onClick={() => setAdding({})}>
                Add a memory step by step
              </button>
            </p>
          </form>
        </div>

        <GrowthWidget />

        {back && (
          <section className="today-block today-back" aria-labelledby="tbT">
            <h2 id="tbT">This moment found its way back</h2>
            <Link href={`/memory/${back.id}`} className="today-back-card">
              <Flower size={30} />
              <span>
                <span className="today-back-place">{snap.locations[back.id] ? placeTitle(snap.locations[back.id]) : back.place}</span>
                <span className="today-back-moment">{back.extra?.title || back.moment}</span>
              </span>
            </Link>
            <p className="today-back-acts">
              <Link className="quiet strong" href={`/?ask=${encodeURIComponent(`What else do I remember about “${back.extra?.title || back.moment}” in ${back.place}?`)}`}>
                Ask me about it
              </Link>
              <Link className="quiet" href="/rewind">
                Rewind through the past
              </Link>
            </p>
          </section>
        )}

        {reflectionOn && <Reflection now={now} prominent={!!(writing || (p.reminders?.evening && evening))} />}

        <FirstSteps onAdd={() => setAdding({})} />

        <Rediscover />

        {snap.handDrafts.length > 0 && (
          <section className="today-block" aria-labelledby="tdT">
            <h2 id="tdT">A little more of your story</h2>
            <ul className="today-list">
              {snap.handDrafts.map((d) => {
                const x = d.data as unknown as HandDraft;
                return (
                  <li key={d.id}>
                    <button type="button" className="today-item" onClick={() => setAdding({ id: d.id, initial: x })}>
                      <span className="today-item-t">{x.title || x.moment || 'A memory, begun'}</span>
                      <span className="today-item-m">Draft · {new Date(d.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </button>
                  </li>
                );
              })}
              {waiting.map((t) => (
                <li key={t.id}>
                  <Link className="today-item" href={`/?c=${encodeURIComponent(t.id)}`}>
                    <span className="today-item-t">{t.trip?.title || t.title || 'A conversation'}</span>
                    <span className="today-item-m">{t.drafts === 1 ? '1 memory to review' : `${t.drafts} memories to review`}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(p.reminders?.yearAgo ?? true) && (
          <section className="today-block today-revisits">
            <Revisits onOpen={(id) => router.push(`/memory/${id}`)} />
          </section>
        )}

        {p.reminders?.weekly && sunday && week.length > 0 && (
          <section className="today-block" aria-labelledby="twT">
            <h2 id="twT">This week</h2>
            <MemoryRow list={week} />
          </section>
        )}

        {recent.length > 0 && (
          <section className="today-block" aria-labelledby="trT">
            <h2 id="trT">Recently added</h2>
            <MemoryRow list={recent} />
          </section>
        )}
        {revisitedMems.length > 0 && (
          <section className="today-block" aria-labelledby="tvT">
            <h2 id="tvT">Found their way back</h2>
            <MemoryRow list={revisitedMems} />
          </section>
        )}

      </section>

      {adding && (
        <AddMemory
          draftId={adding.id}
          initial={adding.initial}
          onClose={() => setAdding(null)}
          onPlanted={(id) => {
            setAdding(null);
            store.toast('Saved. Some things stay.');
            router.push(`/memory/${id}`);
          }}
        />
      )}
    </main>
  );
}

function MemoryRow({ list }: { list: Stored[] }) {
  const [snap] = useStore();
  return (
    <ul className="today-mems">
      {list.map((m) => {
        const photo = mediaFor(snap, 'memory', m.id).find((x) => x.kind === 'photo');
        const loc = snap.locations[m.id];
        return (
          <li key={m.id}>
            <Link href={`/memory/${m.id}`} className="today-mem">
              <span className="today-mem-img">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl(photo.id)} alt="" loading="lazy" decoding="async" />
                ) : (
                  <i aria-hidden="true" />
                )}
              </span>
              <span className="today-mem-place">{loc ? placeTitle(loc) : m.place}</span>
              <span className="today-mem-t">{m.extra?.title || m.moment}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** One question at a time. An answer is saved privately to the Journal, and can be tied to a memory. */
function Reflection({ now, prominent }: { now: Date; prominent: boolean }) {
  const [snap, store] = useStore();
  const [offset, setOffset] = useState(0);
  const questions = useQuestions(now);
  const q = questions.length ? questions[((offset % questions.length) + questions.length) % questions.length] : null;
  const prompt = q?.text ?? '';
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const touch = useRef<number | null>(null);
  const answered = snap.entries.find((e) => e.meta?.prompt === prompt && new Date(e.createdAt).toDateString() === now.toDateString());

  async function save(e: FormEvent) {
    e.preventDefault();
    if (text.trim().length < 2) return;
    setBusy(true);
    try {
      const id = newId();
      await store.saveEntry({ id, body: text.trim(), createdAt: Date.now(), meta: { prompt } });
      if (link) await store.link({ kind: 'entry-memory', a: id, b: link, note: 'A reflection' }, true);
      haptic(12);
      store.toast('Saved privately to your Journal.');
      setSaved(id);
      setText('');
      setLink('');
    } catch (err) {
      store.toast(err instanceof Error ? err.message : 'That couldn’t be saved.', 'error');
    }
    setBusy(false);
  }
  const shift = (d: number) => {
    haptic(5);
    setOffset((o) => o + d);
    setSaved(null);
  };

  return (
    <section
      className={`today-reflect${prominent ? ' prominent' : ''}`}
      aria-labelledby="trfT"
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 60 && !text) shift(dx < 0 ? 1 : -1);
      }}
    >
      <p className="today-k" id="trfT">
        {offset === 0 ? 'A question for you, today' : `A question for you · ${(((offset % questions.length) + questions.length) % questions.length) + 1} of ${questions.length}`}
      </p>
      <p className="today-prompt" key={prompt}>
        {prompt}
      </p>
      {q?.about && (
        <p className="today-about">
          {q.about.kind === 'memory' && q.about.id ? (
            <Link href={`/memory/${q.about.id}`}>From your memory “{q.about.label}”</Link>
          ) : q.about.kind === 'person' && q.about.id ? (
            <Link href={`/people?p=${encodeURIComponent(q.about.id)}`}>About {q.about.label}</Link>
          ) : (
            <span>From your memories in {q.about.label}</span>
          )}
        </p>
      )}
      {answered && offset === 0 && !saved ? (
        <p className="you-note">
          You answered this today. <Link href={`/archives?e=${encodeURIComponent(answered.id)}`}>Read it again</Link>
        </p>
      ) : saved ? (
        <p className="you-note" role="status">
          Saved to your Journal. <Link href={`/archives?e=${encodeURIComponent(saved)}`}>Open it</Link> ·{' '}
          <Link href="/archives?f=reflections">All your reflections</Link>
        </p>
      ) : (
        <form onSubmit={save} className="today-reflect-form">
          <label htmlFor="reflect" className="sr">
            Your answer
          </label>
          <textarea id="reflect" rows={3} maxLength={20000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write as much or as little as you like." />
          <div className="today-reflect-acts">
            {snap.memories.length > 0 && (
              <label className="today-link">
                <span className="sr">Tie it to a memory</span>
                <select value={link} onChange={(e) => setLink(e.target.value)}>
                  <option value="">Not tied to a memory</option>
                  {snap.memories
                    .slice()
                    .reverse()
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.place}: {m.extra?.title || m.moment}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <button type="submit" className="welcome-go" disabled={busy || text.trim().length < 2}>
              {busy ? 'Saving…' : 'Save privately'}
            </button>
          </div>
        </form>
      )}
      <p className="today-reflect-nav">
        <button type="button" className="quiet" onClick={() => shift(-1)} aria-label="Previous question">
          ←
        </button>
        <button type="button" className="quiet" onClick={() => shift(1)}>
          Another question
        </button>
      </p>
    </section>
  );
}

/** Personal next steps, from what they told us and what's still empty. */
function FirstSteps({ onAdd }: { onAdd: () => void }) {
  const [snap] = useStore();
  const p = snap.profile;
  const r = new Set<string>([...(p.remember ?? []), ...(p.ways ?? [])]);
  const steps: { key: string; title: string; body: string; href?: string; act?: () => void; label: string }[] = [];
  if (p.start === 'past' && snap.memories.length < 3)
    steps.push({ key: 'past', title: 'Begin with what you already have', body: 'Tell it about a trip or a time you remember well; it will draft the memories for you to review.', href: '/?trip=1', label: 'Tell it about a trip' });
  if ((r.has('places') || r.has('everything')) && Object.keys(snap.locations).length === 0)
    steps.push({ key: 'place', title: 'Add your first place', body: 'A city, a street, a kitchen. It will appear on your map.', act: onAdd, label: 'Add a place you remember' });
  if ((r.has('writing') || r.has('reflections')) && snap.entries.length === 0)
    steps.push({ key: 'write', title: 'Write your first page', body: 'Start with a room you lived in once. What did it smell like in the morning?', href: '/archives?new=1', label: 'Open a new page' });
  if ((r.has('people') || r.has('everything')) && snap.people.length === 0)
    steps.push({ key: 'people', title: 'Who do you not want to forget?', body: 'Keep someone here: a name, a photograph, a few words about them.', href: '/people?new=1', label: 'Add a person' });
  if (r.has('photos') && !snap.media.some((m) => m.kind === 'photo'))
    steps.push({ key: 'photo', title: 'Keep a photograph', body: 'Choose one picture and say what you remember about it.', act: onAdd, label: 'Add a memory with a photograph' });
  if (r.has('chapters') && snap.milestones.length === 0)
    steps.push({ key: 'chapter', title: 'Mark a chapter', body: 'A move, a first day, an ending. Dates that divide a life into parts.', href: '/timeline', label: 'Add a date to your Timeline' });
  if (!steps.length && snap.memories.length === 0)
    steps.push({ key: 'first', title: 'Your first memory', body: 'Something small is fine. A place, and a moment from it.', act: onAdd, label: 'Add a memory' });
  if (!steps.length) return null;
  return (
    <section className="today-block today-steps" aria-labelledby="tsT">
      <h2 id="tsT">For you</h2>
      <ul>
        {steps.slice(0, 3).map((s) => (
          <li key={s.key} className="today-step">
            <p className="today-step-t">{s.title}</p>
            <p className="today-step-b">{s.body}</p>
            {s.href ? (
              <Link className="quiet strong" href={s.href}>
                {s.label}
              </Link>
            ) : (
              <button type="button" className="quiet strong" onClick={s.act}>
                {s.label}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
