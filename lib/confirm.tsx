'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A native-feeling confirmation sheet instead of the browser's dialog.
 * confirmSheet({ title, body, yes, danger }) resolves true or false.
 */
type Ask = { title: string; body?: string; yes: string; no?: string; danger?: boolean };
type Pending = Ask & { resolve: (v: boolean) => void };

let show: ((p: Pending) => void) | null = null;

export function confirmSheet(ask: Ask): Promise<boolean> {
  if (!show) return Promise.resolve(window.confirm([ask.title, ask.body].filter(Boolean).join('\n\n')));
  return new Promise((resolve) => show!({ ...ask, resolve }));
}

export function ConfirmHost() {
  const [p, setP] = useState<Pending | null>(null);
  const yesRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    show = setP;
    return () => {
      show = null;
    };
  }, []);
  useEffect(() => {
    if (!p) return;
    try {
      navigator.vibrate?.(p.danger ? [10, 40, 10] : 8);
    } catch {
      /* not supported */
    }
    yesRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && done(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p]);
  function done(v: boolean) {
    p?.resolve(v);
    setP(null);
  }
  if (!p) return null;
  return (
    <div className="sheet-veil" onClick={() => done(false)}>
      <div className="confirm-sheet" role="alertdialog" aria-modal="true" aria-labelledby="cfT" aria-describedby={p.body ? 'cfB' : undefined} onClick={(e) => e.stopPropagation()}>
        <span className="sheet-grip" aria-hidden="true" />
        <h2 id="cfT">{p.title}</h2>
        {p.body && <p id="cfB">{p.body}</p>}
        <button ref={yesRef} type="button" className={`confirm-yes${p.danger ? ' danger' : ''}`} onClick={() => done(true)}>
          {p.yes}
        </button>
        <button type="button" className="confirm-no" onClick={() => done(false)}>
          {p.no ?? 'Cancel'}
        </button>
      </div>
    </div>
  );
}
