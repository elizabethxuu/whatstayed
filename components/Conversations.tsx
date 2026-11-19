'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store';

const day = (t: number) => new Date(t).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

/** Every conversation, newest first: resume one, start another, or delete one. */
export default function Conversations({
  current,
  onClose,
  onNew,
  onClearGarden,
}: {
  current?: string;
  onClose: () => void;
  onNew: (mode: 'free' | 'trip') => void;
  onClearGarden: () => void;
}) {
  const [snap, store] = useStore();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function remove(id: string, title: string) {
    if (!window.confirm(`Delete “${title || 'this conversation'}”? Its words and any unsaved drafts are deleted. Memories you saved from it stay in the garden.`)) return;
    const ok = await store.deleteTalk(id);
    if (ok && id === current) window.location.assign('/');
  }

  return (
    <div className="loc-veil talks-veil" onClick={onClose}>
      <aside className="talks" role="dialog" aria-modal="true" aria-labelledby="talksT" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="x" onClick={onClose} aria-label="Close">
          Close
        </button>
        <h2 id="talksT" className="rv-title">Conversations</h2>
        <p className="talks-new">
          <button type="button" className="quiet strong" onClick={() => onNew('free')}>
            Start a new conversation
          </button>
          <button type="button" className="quiet strong" onClick={() => onNew('trip')}>
            Tell it about a trip
          </button>
        </p>
        {snap.talks.length === 0 ? (
          <p className="rv-empty">No conversations yet. Start one, and it will be kept here.</p>
        ) : (
          <ol className="talks-list">
            {snap.talks.map((t) => (
              <li key={t.id} className={t.id === current ? 'on' : ''}>
                <Link href={`/?c=${encodeURIComponent(t.id)}`} onClick={onClose} aria-current={t.id === current ? 'true' : undefined}>
                  <span className="talks-title">{t.title || 'A conversation, not yet begun'}</span>
                  <span className="talks-meta">
                    {t.mode === 'trip' ? 'Trip · ' : ''}
                    {day(t.updatedAt)}
                    {t.saved ? ` · ${t.saved} saved` : ''}
                    {t.drafts ? ` · ${t.drafts} to review` : ''}
                  </span>
                </Link>
                <button type="button" className="untie" onClick={() => remove(t.id, t.title)} aria-label={`Delete ${t.title || 'this conversation'}`}>
                  delete
                </button>
              </li>
            ))}
          </ol>
        )}
        <p className="talks-clear">
          <button type="button" className="quiet danger" onClick={onClearGarden}>
            Clear the whole garden…
          </button>
        </p>
      </aside>
    </div>
  );
}
