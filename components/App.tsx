'use client';

import { useEffect, type ReactNode } from 'react';
import { StoreProvider, useToasts, type Snapshot } from '@/lib/store';
import ImportOffer from './ImportOffer';

/** Wraps every signed-in room: the person's data, quiet notices, and a one-time offer to bring in old browser data. */
export default function App({ initial, email, children }: { initial: Snapshot; email: string; children: ReactNode }) {
  // so "today" (letters, revisits) is the person's own day, not the server's
  useEffect(() => {
    document.cookie = `ws_tz=${new Date().getTimezoneOffset()}; path=/; max-age=31536000; samesite=lax`;
  }, []);
  return (
    <StoreProvider initial={initial}>
      {children}
      <ImportOffer email={email} />
      <Toasts />
    </StoreProvider>
  );
}

function Toasts() {
  const toasts = useToasts();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <p key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : undefined}>
          {t.text}
        </p>
      ))}
    </div>
  );
}
