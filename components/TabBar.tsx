'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Room } from './Masthead';

/** Phones: a quiet bottom bar, fine-line icons, one subtle mark for where you are. */
const TABS: { room: Room; href: string; label: string; icon: React.ReactNode }[] = [
  {
    room: 'garden',
    href: '/',
    label: 'Garden',
    icon: (
      <>
        <path d="M12 21v-8.5" />
        <path d="M12 12.5c-.4-2.6-2.2-4.3-4.6-4.9M12 14.2c.6-2.4 2.4-3.9 4.7-4.3M12 10c0-2.2.9-4 2.4-5.4M12 10c-.5-1.9-1.6-3.3-3.1-4.2" />
        <circle cx="7.1" cy="7.3" r="1.1" />
        <circle cx="17" cy="9.5" r="1.1" />
        <circle cx="14.6" cy="4.3" r="1.1" />
      </>
    ),
  },
  {
    room: 'today',
    href: '/today',
    label: 'Today',
    icon: (
      <>
        <circle cx="12" cy="12" r="3.6" />
        <path d="M12 3.6v2.2M12 18.2v2.2M3.6 12h2.2M18.2 12h2.2M6.1 6.1l1.5 1.5M16.4 16.4l1.5 1.5M6.1 17.9l1.5-1.5M16.4 7.6l1.5-1.5" />
      </>
    ),
  },
  {
    room: 'archives',
    href: '/archives',
    label: 'Archives',
    icon: (
      <>
        <path d="M6 3.8h9.2L18.5 7v13.2H6z" />
        <path d="M9 10.5h6.5M9 13.5h6.5M9 16.5h4" />
      </>
    ),
  },
  {
    room: 'places',
    href: '/places',
    label: 'Places',
    icon: (
      <>
        <circle cx="12" cy="12" r="8.2" />
        <path d="M3.8 12h16.4M12 3.8c2.3 2.3 3.4 5 3.4 8.2s-1.1 5.9-3.4 8.2M12 3.8C9.7 6.1 8.6 8.8 8.6 12s1.1 5.9 3.4 8.2" />
      </>
    ),
  },
];

const MORE: { room: Room; href: string; label: string }[] = [
  { room: 'people', href: '/people', label: 'People' },
  { room: 'constellation', href: '/constellation', label: 'Constellation' },
  { room: 'rewind', href: '/rewind', label: 'Rewind' },
  { room: 'timeline', href: '/timeline', label: 'Timeline' },
  { room: 'collections', href: '/collections', label: 'Collections' },
  { room: 'letters', href: '/letters', label: 'Letters' },
  { room: 'search', href: '/search', label: 'Search' },
  { room: 'you', href: '/you', label: 'You' },
];

export default function TabBar({ room }: { room: Room }) {
  const [open, setOpen] = useState(false);
  const inMore = MORE.some((m) => m.room === room);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <nav className="tabbar" aria-label="Rooms">
        {TABS.map((t) => (
          <Link key={t.room} href={t.href} className="tab" aria-current={room === t.room ? 'page' : undefined}>
            <svg viewBox="0 0 24 24" aria-hidden="true">{t.icon}</svg>
            <span>{t.label}</span>
          </Link>
        ))}
        <button type="button" className="tab" aria-expanded={open} aria-haspopup="dialog" aria-current={inMore ? 'page' : undefined} onClick={() => setOpen((v) => !v)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="6" cy="12" r="1.1" />
            <circle cx="12" cy="12" r="1.1" />
            <circle cx="18" cy="12" r="1.1" />
          </svg>
          <span>More</span>
        </button>
      </nav>
      {open && (
        <div className="tab-veil" onClick={() => setOpen(false)}>
          <div className="tab-sheet" role="dialog" aria-modal="true" aria-label="More rooms" onClick={(e) => e.stopPropagation()}>
            {MORE.map((m) => (
              <Link key={m.room} href={m.href} aria-current={room === m.room ? 'page' : undefined} onClick={() => setOpen(false)} autoFocus={m === MORE[0]}>
                {m.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
