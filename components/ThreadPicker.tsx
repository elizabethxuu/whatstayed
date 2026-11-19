'use client';

import { useEffect, useState } from 'react';
import type { Kept } from '@/lib/memory';
import type { Loc } from '@/lib/places';
import { placeTitle } from '@/lib/places';

type Props = {
  from: Kept;
  others: Kept[];
  locations: Record<string, Loc>;
  onTie: (otherId: string, note: string) => void;
  onClose: () => void;
};

/** The person chooses which memory to tie this one to. Nothing is tied without them. */
export default function ThreadPicker({ from, others, locations, onTie, onClose }: Props) {
  const [pick, setPick] = useState<string | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="loc-veil" onClick={onClose}>
      <section className="loc-ed" role="dialog" aria-modal="true" aria-labelledby="tieT" onClick={(e) => e.stopPropagation()}>
        <p className="loc-k">From “{from.moment.length > 60 ? from.moment.slice(0, 58) + '…' : from.moment}”</p>
        <h2 id="tieT" className="loc-t">Tie a red thread to…</h2>
        {others.length === 0 ? (
          <p className="loc-note">There’s nothing else to tie it to yet. Plant another memory first.</p>
        ) : (
          <ul className="tie-list" role="radiogroup" aria-label="Memories">
            {others.map((m) => {
              const loc = locations[m.id];
              return (
                <li key={m.id}>
                  <button type="button" role="radio" aria-checked={pick === m.id} className={pick === m.id ? 'on' : ''} onClick={() => setPick(m.id)}>
                    <span className="tie-place">{loc ? placeTitle(loc) : m.place}</span>
                    <span className="tie-moment">{m.moment}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <label className="tie-note">
          <span>What connects them? (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={60} placeholder="Why they belong together" />
        </label>
        <div className="loc-acts">
          <span />
          <button type="button" className="quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="quiet strong" disabled={!pick} onClick={() => pick && onTie(pick, note)}>
            Tie the thread
          </button>
        </div>
      </section>
    </div>
  );
}
