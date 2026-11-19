'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import Masthead from './Masthead';
import { Names, Sheet, pageTitle } from './Pickers';
import { mediaFor, mediaUrl, peopleOf, useStore, type Media, type Milestone, type Person } from '@/lib/store';
import { placeTitle } from '@/lib/places';
import { revisits, type Revisit } from '@/lib/revisit';

type Cat = 'memory' | 'entry' | 'milestone' | 'letter';
type Item = {
  key: string;
  cat: Cat;
  t: number;
  dated: boolean; // false when we only know when it was kept, not when it happened
  title: string;
  sub?: string;
  href?: string;
  place?: string;
  people: Person[];
  photos: Media[];
  milestone?: Milestone;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CATS: { v: '' | Cat | 'place' | 'photo'; label: string }[] = [
  { v: '', label: 'Everything' },
  { v: 'memory', label: 'Memories' },
  { v: 'entry', label: 'Pages' },
  { v: 'place', label: 'Places' },
  { v: 'photo', label: 'Photographs' },
  { v: 'milestone', label: 'Important days' },
  { v: 'letter', label: 'Letters' },
];
const local = (iso: string) => new Date(iso + 'T12:00:00').getTime();
const dayLabel = (t: number) => new Date(t).toLocaleDateString('en-US', { day: 'numeric', month: 'long' });

export default function Timeline() {
  const [snap, store] = useStore();
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [cat, setCat] = useState<(typeof CATS)[number]['v']>('');
  const [who, setWho] = useState('');
  const [marking, setMarking] = useState<Milestone | 'new' | null>(null);
  const [today, setToday] = useState<Revisit[]>([]);
  useEffect(() => setToday(revisits(snap).filter((r) => r.kind !== 'letter')), [snap]);

  const all = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const m of snap.memories) {
      const loc = snap.locations[m.id];
      out.push({
        key: 'm' + m.id,
        cat: 'memory',
        t: m.date ? local(m.date) : m.createdAt,
        dated: !!m.date,
        title: `“${m.moment}”`,
        sub: [m.when, m.feeling].filter(Boolean).join(' · '),
        href: `/?m=${encodeURIComponent(m.id)}`,
        place: loc ? placeTitle(loc) + (loc.country && loc.country !== placeTitle(loc) ? `, ${loc.country}` : '') : m.place,
        people: peopleOf(snap, 'memory-person', m.id),
        photos: mediaFor(snap, 'memory', m.id).filter((x) => x.kind === 'photo'),
      });
    }
    for (const e of snap.entries) {
      out.push({
        key: 'e' + e.id,
        cat: 'entry',
        t: e.createdAt,
        dated: true,
        title: pageTitle(e),
        href: `/archives?e=${encodeURIComponent(e.id)}`,
        place: e.location ? placeTitle(e.location) : undefined,
        people: peopleOf(snap, 'entry-person', e.id),
        photos: mediaFor(snap, 'entry', e.id).filter((x) => x.kind === 'photo'),
      });
    }
    for (const d of snap.milestones) out.push({ key: 'd' + d.id, cat: 'milestone', t: local(d.onDate), dated: true, title: d.title, sub: d.note, people: [], photos: [], milestone: d });
    for (const l of snap.letters)
      out.push({
        key: 'l' + l.id,
        cat: 'letter',
        t: l.writtenAt,
        dated: true,
        title: l.sealed ? `A letter, sealed until ${new Date(local(l.openOn)).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'A letter to my future self',
        href: `/letters#${l.id}`,
        people: [],
        photos: [],
      });
    return out.sort((a, b) => b.t - a.t);
  }, [snap]);

  const years = useMemo(() => [...new Set(all.map((i) => new Date(i.t).getFullYear()))].sort((a, b) => b - a), [all]);

  const shown = all.filter((i) => {
    const d = new Date(i.t);
    if (year && d.getFullYear() !== +year) return false;
    if (month && d.getMonth() !== +month) return false;
    if (who && !i.people.some((p) => p.id === who)) return false;
    if (cat === 'place') return !!i.place && (i.cat === 'entry' || !!snap.locations[i.key.slice(1)]);
    if (cat === 'photo') return i.photos.length > 0;
    if (cat && i.cat !== cat) return false;
    return true;
  });

  // group: year → month
  const groups: { year: number; months: { m: number; items: Item[] }[] }[] = [];
  for (const i of shown) {
    const d = new Date(i.t);
    let g = groups[groups.length - 1];
    if (!g || g.year !== d.getFullYear()) groups.push((g = { year: d.getFullYear(), months: [] }));
    let mo = g.months[g.months.length - 1];
    if (!mo || mo.m !== d.getMonth()) g.months.push((mo = { m: d.getMonth(), items: [] }));
    mo.items.push(i);
  }

  const filtering = !!(year || month || cat || who);

  return (
    <main className="timeline">
      <Masthead room="timeline">
        <button type="button" className="quiet" onClick={() => setMarking('new')}>
          Add a date
        </button>
      </Masthead>
      <section className="arc-head">
        <h1 className="arc-title">Timeline</h1>
        <p className="arc-sub">Everything, in the order it happened.</p>
      </section>

      {today.length > 0 && !filtering && (
        <section className="tl-today" aria-label="On this day">
          {today.map((r) => (
            <p key={r.kind + r.id} className="revisit">
              <span className="revisit-k">{r.label}</span>{' '}
              {r.kind === 'memory' ? (
                <Link className="quiet" href={`/?m=${encodeURIComponent(r.id)}`}>{r.text}</Link>
              ) : r.kind === 'entry' ? (
                <Link className="quiet" href={`/archives?e=${encodeURIComponent(r.id)}`}>{r.text}</Link>
              ) : (
                <span>{r.text}</span>
              )}
            </p>
          ))}
        </section>
      )}

      {all.length > 0 && (
        <div className="arc-tools tl-tools">
          <label className="arc-filter">
            <span className="sr">Year</span>
            <select value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="">Every year</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="arc-filter">
            <span className="sr">Month</span>
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="">Every month</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="arc-filter">
            <span className="sr">Kind</span>
            <select value={cat} onChange={(e) => setCat(e.target.value as typeof cat)}>
              {CATS.map((c) => (
                <option key={c.v} value={c.v}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          {snap.people.length > 0 && (
            <label className="arc-filter">
              <span className="sr">Person</span>
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
          {filtering && (
            <button type="button" className="quiet" onClick={() => { setYear(''); setMonth(''); setCat(''); setWho(''); }}>
              Clear
            </button>
          )}
          <span className="arc-count">{shown.length} of {all.length}</span>
        </div>
      )}

      {all.length === 0 ? (
        <div className="empty-room">
          <p className="quiet-note">Nothing here yet. Plant a memory, write a page, or mark a day that mattered.</p>
          <button type="button" className="invite" onClick={() => setMarking('new')}>
            Add a date…
          </button>
        </div>
      ) : shown.length === 0 ? (
        <p className="quiet-note">Nothing in that part of your life yet.</p>
      ) : (
        <ol className="tl">
          {groups.map((g) => (
            <li key={g.year} className="tl-year">
              <h2 className="tl-y">{g.year}</h2>
              <div className="tl-months">
                {g.months.map((mo) => (
                  <section key={mo.m} className="tl-month">
                    <h3 className="month-label">{MONTHS[mo.m]}</h3>
                    <ol>
                      {mo.items.map((i) => (
                        <li key={i.key} className={`tl-item c-${i.cat}`}>
                          <span className="tl-dot" aria-hidden="true" />
                          <p className="tl-when">
                            {i.dated ? dayLabel(i.t) : `Added ${dayLabel(i.t)}`}
                            <span> · {i.cat === 'memory' ? 'Memory' : i.cat === 'entry' ? 'Page' : i.cat === 'milestone' ? 'An important day' : 'Letter'}</span>
                            {i.place ? <span> · {i.place}</span> : null}
                          </p>
                          {i.href ? (
                            <Link href={i.href} className="tl-title">
                              {i.title}
                            </Link>
                          ) : (
                            <p className="tl-title">{i.title}</p>
                          )}
                          {i.sub && <p className="tl-sub">{i.sub}</p>}
                          {i.people.length > 0 && (
                            <p className="tl-sub">
                              With <Names people={i.people} />
                            </p>
                          )}
                          {i.photos.length > 0 && (
                            <span className="tl-photos">
                              {i.photos.slice(0, 4).map((ph) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={ph.id} src={mediaUrl(ph.id)} alt="" loading="lazy" decoding="async" />
                              ))}
                            </span>
                          )}
                          {i.milestone && (
                            <p className="card-links">
                              <button type="button" className="quiet" onClick={() => setMarking(i.milestone!)}>
                                Edit
                              </button>
                              <button
                                type="button"
                                className="quiet danger"
                                onClick={() => window.confirm(`Remove “${i.milestone!.title}”?`) && store.deleteMilestone(i.milestone!.id)}
                              >
                                Remove
                              </button>
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                  </section>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}

      {marking && (
        <DayEditor
          day={marking === 'new' ? undefined : marking}
          onClose={() => setMarking(null)}
          onSave={(m) => (marking === 'new' ? store.addMilestone(m) : store.updateMilestone(marking.id, m))}
        />
      )}
    </main>
  );
}

function DayEditor({ day, onSave, onClose }: { day?: Milestone; onSave: (m: { title: string; onDate: string; note?: string }) => Promise<unknown>; onClose: () => void }) {
  const [title, setTitle] = useState(day?.title ?? '');
  const [onDate, setOnDate] = useState(day?.onDate ?? '');
  const [note, setNote] = useState(day?.note ?? '');
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = 'Name the day.';
    if (!onDate) next.onDate = 'When was it?';
    setErr(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    const ok = await onSave({ title: title.trim(), onDate, note: note.trim() || undefined });
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Sheet title={day ? 'Edit date' : 'Add a date'} kicker="Timeline" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="loc-fields mem-fields">
          <label className="wide">
            <span>What happened</span>
            <input autoFocus value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Moved to New York" aria-invalid={err.title ? true : undefined} />
            {err.title && <em className="field-err">{err.title}</em>}
          </label>
          <label>
            <span>The day</span>
            <input type="date" value={onDate} max="9999-12-31" onChange={(e) => setOnDate(e.target.value)} aria-invalid={err.onDate ? true : undefined} />
            {err.onDate && <em className="field-err">{err.onDate}</em>}
          </label>
          <label className="wide">
            <span>A note (optional)</span>
            <input value={note} maxLength={600} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <div className="loc-acts">
          <span />
          <button type="button" className="quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="quiet strong" disabled={busy}>
            {busy ? 'Saving…' : 'Keep it'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
