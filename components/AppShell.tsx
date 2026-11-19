'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStoreApi } from '@/lib/store';
import { clearUnsent, dropUnsent, listUnsent } from '@/lib/unsent';

/**
 * Behaviour that makes the web app feel like an app:
 * - says so when you're offline, and when you're back;
 * - pull down at the top of a page to refresh it;
 * - keeps forms above the on-screen keyboard (exposes its height as --kb);
 * - registers the service worker that lets the app open offline.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const store = useStoreApi();
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef<number | null>(null);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => {
      setOnline(true);
      store.toast('You’re back online.');
      store.refresh().catch(() => {});
    };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [store]);

  // a page whose last words didn't reach the account before the tab closed: send them now
  useEffect(() => {
    const pending = listUnsent();
    if (!pending.length) return;
    const entries = store.get().entries;
    (async () => {
      for (const u of pending) {
        const have = entries.find((e) => e.id === u.id);
        if (have && (have.body === u.body || have.updatedAt > u.at)) {
          dropUnsent(u.id);
          continue;
        }
        try {
          await store.saveEntry({ id: u.id, body: u.body, createdAt: u.createdAt });
          clearUnsent(u.id, u.body);
        } catch {
          /* offline or signed out: try again next time */
        }
      }
    })();
  }, [store]);

  // keyboard-aware: how much of the viewport the on-screen keyboard covers
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const set = () => document.documentElement.style.setProperty('--kb', `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`);
    vv.addEventListener('resize', set);
    vv.addEventListener('scroll', set);
    set();
    return () => {
      vv.removeEventListener('resize', set);
      vv.removeEventListener('scroll', set);
    };
  }, []);

  // the service worker: an offline page and cached static files (never your data)
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  // pull to refresh, from the very top of the page, on touch screens
  useEffect(() => {
    const down = (e: TouchEvent) => {
      if (window.scrollY > 0 || document.querySelector('.loc-veil, .sheet-veil, .review-veil')) return;
      start.current = e.touches[0].clientY;
    };
    const move = (e: TouchEvent) => {
      if (start.current === null) return;
      const d = e.touches[0].clientY - start.current;
      setPull(d > 0 ? Math.min(90, d * 0.5) : 0);
    };
    const up = async () => {
      if (start.current === null) return;
      start.current = null;
      setPull((p) => {
        if (p >= 64) {
          setRefreshing(true);
          try {
            navigator.vibrate?.(10);
          } catch {
            /* not supported */
          }
          Promise.all([store.refresh(), Promise.resolve(router.refresh())])
            .catch(() => store.toast('Couldn’t refresh. Check your connection.', 'error'))
            .finally(() => setTimeout(() => setRefreshing(false), 500));
        }
        return 0;
      });
    };
    window.addEventListener('touchstart', down, { passive: true });
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('touchstart', down);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
  }, [store, router]);

  return (
    <>
      {(pull > 0 || refreshing) && (
        <div className="ptr" style={{ height: refreshing ? 52 : pull }} aria-hidden={!refreshing} role={refreshing ? 'status' : undefined}>
          <span className={`ptr-bud${refreshing ? ' spin' : ''}`} style={{ opacity: refreshing ? 1 : pull / 64, rotate: `${pull * 3}deg` }} />
          {refreshing && <span className="sr">Refreshing</span>}
        </div>
      )}
      {!online && (
        <p className="offline" role="status">
          You’re offline. What you’ve already opened is here to read; changes will need a connection.
        </p>
      )}
      {children}
    </>
  );
}
