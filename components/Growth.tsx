'use client';

import { useEffect, useState } from 'react';
import { growth, journey, STAGES } from '@/lib/growth';
import { useStore } from '@/lib/store';

const fmt = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

/** a single drop of water: the growth widget's mark */
export function Droplet({ size = 16 }: { size?: number }) {
  return (
    <svg className="droplet" viewBox="0 0 16 20" width={size} height={size * 1.25} aria-hidden="true">
      <path d="M8 1.5 C 8 1.5, 2.2 8.6, 2.2 12.6 A 5.8 5.8 0 0 0 13.8 12.6 C 13.8 8.6, 8 1.5, 8 1.5 Z" />
      <path className="droplet-shine" d="M5.4 12.4 A 2.8 2.8 0 0 0 7.4 15.4" />
    </svg>
  );
}

/** How the willow grew: dated from when memories and threads were actually saved. */
export function GrowthJourney({ onClose }: { onClose: () => void }) {
  const [snap] = useStore();
  const g = growth(snap);
  const steps = journey(snap);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="sheet-veil" onClick={onClose}>
      <section className="add growth-sheet" role="dialog" aria-modal="true" aria-labelledby="grT" onClick={(e) => e.stopPropagation()}>
        <span className="sheet-grip" aria-hidden="true" />
        <p className="growth-k">How your willow grew</p>
        <h2 id="grT" className="growth-title">{g.stage.name}</h2>
        <p className="growth-line">{g.stage.line}</p>
        <ol className="growth-stages" aria-label="Stages">
          {STAGES.map((s, k) => (
            <li key={s.key} className={k < g.stage.index ? 'past' : k === g.stage.index ? 'now' : 'later'}>
              <i aria-hidden="true" />
              <span>{s.name.replace(/^An? /, '')}</span>
              <small>{s.from === 0 ? 'to begin' : s.from === 1 ? '1 memory' : `${s.from} memories`}</small>
            </li>
          ))}
        </ol>
        {steps.length > 0 ? (
          <ol className="growth-journey">
            {steps.map((s, k) => (
              <li key={k}>
                <time dateTime={new Date(s.at).toISOString()}>{fmt(s.at)}</time>
                <span>{s.text}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="quiet-note">Nothing has been kept yet. The journey starts with your first memory.</p>
        )}
        <p className="growth-how">
          Growth points are 3 for each memory you keep, 2 for each place it happened, and 1 for each connection: a red thread, or a person in a memory. Nothing is ever taken away for time passing.
        </p>
        <footer className="add-foot">
          <button type="button" className="quiet" onClick={onClose}>
            Close
          </button>
        </footer>
      </section>
    </div>
  );
}

/** The small growth display for Today: memories gathered, growth points, and how far to the next stage. */
export default function GrowthWidget() {
  const [snap] = useStore();
  const [open, setOpen] = useState(false);
  const g = growth(snap);
  const next = g.stage.next;
  return (
    <section className="growth" aria-labelledby="growK">
      <header className="growth-head">
        <p id="growK" className="growth-k">
          Your growing garden
        </p>
        <svg className="growth-sprig" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 21V11M12 13c-1-3.6-3.8-5-7-5 .2 3.4 2.6 5.6 7 5M12 11c.6-3.4 3.2-5.6 7-5.6-.2 3.8-2.8 6-7 5.6" />
        </svg>
      </header>
      <div className="growth-nums">
        <p>
          <strong>{g.memories}</strong>
          <span>{g.memories === 1 ? 'Memory gathered' : 'Memories gathered'}</span>
        </p>
        <p>
          <strong>
            <Droplet size={15} />
            {g.points}
          </strong>
          <span>Growth points</span>
        </p>
      </div>
      <div
        className="growth-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(g.stage.toNext * 100)}
        aria-label={next ? `On the way to ${next.name.toLowerCase()}` : 'Fully grown'}
      >
        <i style={{ width: `${Math.max(3, g.stage.toNext * 100)}%` }} />
      </div>
      <p className="growth-line">
        <em>{g.stage.name}.</em> {g.stage.line}
        {next && (
          <>
            {' '}
            <span className="growth-next">
              {next.from - g.memories === 1 ? 'One more memory' : `${next.from - g.memories} more memories`} to {next.name.toLowerCase()}.
            </span>
          </>
        )}
      </p>
      <button type="button" className="quiet growth-open" onClick={() => setOpen(true)}>
        How it grew
      </button>
      {open && <GrowthJourney onClose={() => setOpen(false)} />}
    </section>
  );
}

/** A quiet line of real counts for the Archives: no widget, just the numbers. */
export function ArchiveCounts({ pages }: { pages: number }) {
  const [snap] = useStore();
  const g = growth(snap);
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  return (
    <p className="arc-counts" aria-label="Archive totals">
      {[n(pages, 'page', 'pages'), n(g.memories, 'memory', 'memories'), n(g.places, 'place', 'places'), n(g.connections, 'connection', 'connections')].join(' · ')}
    </p>
  );
}
