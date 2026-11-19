'use client';

import { FormEvent, useEffect, useState } from 'react';
import Masthead from './Masthead';
import { useStore, type Letter } from '@/lib/store';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inYears = (n: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + n);
  return iso(d);
};
const long = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });

export default function Letters() {
  const [snap, store] = useStore();
  const [body, setBody] = useState('');
  const [openOn, setOpenOn] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [tomorrow, setTomorrow] = useState('');
  useEffect(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    setTomorrow(iso(d));
    setOpenOn((v) => v || inYears(1));
  }, []);

  const arrived = snap.letters.filter((l) => !l.sealed).sort((a, b) => b.openOn.localeCompare(a.openOn));
  const waiting = snap.letters.filter((l) => l.sealed);

  async function seal(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!body.trim()) next.body = 'Write a little first.';
    if (!openOn || openOn < tomorrow) next.openOn = 'Choose a day after today.';
    setErr(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    const ok = await store.writeLetter(body.trim(), openOn);
    setBusy(false);
    if (ok) {
      setBody('');
      setOpenOn(inYears(1));
    }
  }

  return (
    <main className="people letters">
      <Masthead room="letters" />
      <section className="arc-head">
        <h1 className="arc-title">Letters</h1>
        <p className="arc-sub">Sealed until the date you choose.</p>
      </section>

      {arrived.length > 0 && (
        <section className="person-block" aria-label="Letters that have arrived">
          <h2 className="month-label">Arrived</h2>
          {arrived.map((l) => (
            <Arrived key={l.id} l={l} />
          ))}
        </section>
      )}

      <form className="letter-desk" onSubmit={seal} noValidate>
        <h2 className="month-label">Write one</h2>
        <label htmlFor="letter" className="sr">
          Your letter
        </label>
        <textarea
          id="letter"
          className="sheet letter-sheet"
          value={body}
          maxLength={50000}
          placeholder="Write a letter…"
          onChange={(e) => {
            setBody(e.target.value);
            if (err.body) setErr((x) => ({ ...x, body: '' }));
          }}
          aria-invalid={err.body ? true : undefined}
        />
        {err.body && <em className="field-err">{err.body}</em>}
        <div className="letter-when">
          <span className="page-k">Open it on</span>
          {[1, 5, 10].map((n) => (
            <button key={n} type="button" className={`quiet${openOn === inYears(n) ? ' strong' : ''}`} onClick={() => setOpenOn(inYears(n))}>
              {n === 1 ? 'in a year' : `in ${n} years`}
            </button>
          ))}
          <label>
            <span className="sr">A day of your choosing</span>
            <input type="date" value={openOn} min={tomorrow} max="9999-12-31" onChange={(e) => setOpenOn(e.target.value)} aria-invalid={err.openOn ? true : undefined} />
          </label>
        </div>
        {err.openOn && <em className="field-err">{err.openOn}</em>}
        <p className="loc-note">Once sealed, it stays closed until {openOn ? long(openOn) : 'that day'}. The words aren’t shown anywhere before then, not even here.</p>
        <button type="submit" className="welcome-go" disabled={busy}>
          {busy ? 'Sealing…' : 'Seal it'}
        </button>
      </form>

      {waiting.length > 0 && (
        <section className="person-block" aria-label="Sealed letters">
          <h2 className="month-label">Waiting</h2>
          <ul className="envelopes">
            {waiting.map((l) => (
              <li key={l.id} id={l.id} className="envelope">
                <span className="env-seal" aria-hidden="true" />
                <span className="env-to">Opens {long(l.openOn)}</span>
                <span className="env-from">Written {new Date(l.writtenAt).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                <span className="card-links">
                  <button
                    type="button"
                    className="quiet"
                    onClick={() => window.confirm('Open this letter early?') && store.openLetter(l.id)}
                  >
                    Open early
                  </button>
                  <button type="button" className="quiet danger" onClick={() => window.confirm('Delete this letter without opening it? This can’t be undone.') && store.deleteLetter(l.id)}>
                    Throw away
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Arrived({ l }: { l: Letter }) {
  const [, store] = useStore();
  const [open, setOpen] = useState(!!l.openedAt);
  useEffect(() => {
    if (window.location.hash === '#' + l.id) setOpen(true);
  }, [l.id]);
  useEffect(() => {
    if (open && !l.openedAt) store.openLetter(l.id); // mark it read
  }, [open, l.openedAt, l.id, store]);
  return (
    <article id={l.id} className={`letter${open ? ' is-open' : ''}`}>
      <p className="env-to">
        Written {new Date(l.writtenAt).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })} · for {long(l.openOn)}
        {!l.openedAt && <em> · new</em>}
      </p>
      {open ? (
        <p className="letter-body">{l.body}</p>
      ) : (
        <button type="button" className="quiet strong" onClick={() => setOpen(true)}>
          Open it
        </button>
      )}
      <p className="card-links">
        <button type="button" className="quiet danger" onClick={() => window.confirm('Delete this letter? This can’t be undone.') && store.deleteLetter(l.id)}>
          Throw away
        </button>
      </p>
    </article>
  );
}
