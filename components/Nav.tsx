'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import type { Room } from './Masthead';

export type Space = 'today' | 'garden' | 'archive' | null;

/** Three spaces. Every room belongs to one of them; You belongs to the profile menu. */
export function spaceOf(room: Room): Space {
  if (room === 'today') return 'today';
  if (room === 'garden' || room === 'constellation' || room === 'rewind') return 'garden';
  if (room === 'you') return null;
  return 'archive';
}

const SPACES: { space: Exclude<Space, null>; href: string; label: string }[] = [
  { space: 'today', href: '/today', label: 'Today' },
  { space: 'garden', href: '/', label: 'Garden' },
  { space: 'archive', href: '/archive', label: 'Archive' },
];

/** The three bubbles: in the header on wide screens, a quiet dock at the foot of the screen on phones. */
export function Bubbles({ room, dock = false }: { room: Room; dock?: boolean }) {
  const here = spaceOf(room);
  return (
    <nav className={dock ? 'bubbles dock' : 'bubbles top-bubbles'} aria-label={dock ? 'Spaces' : 'Spaces (top)'}>
      {SPACES.map((s) => (
        <Link key={s.space} href={s.href} className="bubble" aria-current={here === s.space ? 'page' : undefined}>
          {s.label}
        </Link>
      ))}
    </nav>
  );
}

const SECTIONS: { room: Room; href: string; label: string }[] = [
  { room: 'archive', href: '/archive', label: 'All' },
  { room: 'archives', href: '/archives', label: 'Journal' },
  { room: 'places', href: '/places', label: 'Places' },
  { room: 'people', href: '/people', label: 'People' },
  { room: 'timeline', href: '/timeline', label: 'Timeline' },
  { room: 'collections', href: '/collections', label: 'Collections' },
  { room: 'letters', href: '/letters', label: 'Letters' },
];

/** Inside the Archive: one search field and a row of small chips, never another tab bar. */
export function ArchiveNav({ room }: { room: Room }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // keep the chosen chip in view on a narrow screen
    row.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [room]);
  function go(e: FormEvent) {
    e.preventDefault();
    router.push(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : '/search');
  }
  return (
    <div className="archive-nav">
      <form className="archive-search" role="search" onSubmit={go}>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="8.6" cy="8.6" r="5.2" />
          <path d="M12.6 12.6l4.4 4.4" />
        </svg>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={room === 'search' ? 'Search again…' : 'Search your archive'}
          aria-label="Search the archive"
        />
      </form>
      <div className="chips" ref={row} role="navigation" aria-label="Archive sections">
        {SECTIONS.map((s) => (
          <Link key={s.room} href={s.href} className="chip-bubble" aria-current={room === s.room ? 'page' : undefined}>
            {s.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Inside the Garden: the willow, and two ways of exploring what has grown. */
export function GardenNav({ room }: { room: Room }) {
  const items: { room: Room; href: string; label: string }[] = [
    { room: 'garden', href: '/', label: 'The willow' },
    { room: 'constellation', href: '/constellation', label: 'Constellation' },
    { room: 'rewind', href: '/rewind', label: 'Rewind' },
  ];
  return (
    <div className="chips garden-chips" role="navigation" aria-label="Garden">
      {items.map((s) => (
        <Link key={s.room} href={s.href} className="chip-bubble" aria-current={room === s.room ? 'page' : undefined}>
          {s.label}
        </Link>
      ))}
    </div>
  );
}

const MENU: { href: string; label: string }[] = [
  { href: '/you#profile', label: 'Profile' },
  { href: '/you#settings', label: 'Settings' },
  { href: '/you#notifications', label: 'Notifications' },
  { href: '/you#privacy', label: 'Privacy' },
  { href: '/you#export', label: 'Export memories' },
  { href: '/you#account', label: 'Account' },
];

/** A small avatar in the corner; profile and settings live behind it, out of the way. */
export function ProfileMenu({ room }: { room: Room }) {
  const [snap] = useStore();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const name = (snap.profile?.name || '').trim();
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    box.current?.querySelector<HTMLElement>('a')?.focus();
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="profile" ref={box}>
      <button
        type="button"
        className="avatar"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-current={room === 'you' ? 'page' : undefined}
        aria-label="Profile and settings"
        onClick={() => setOpen((v) => !v)}
      >
        {name ? (
          <span aria-hidden="true">{name[0].toUpperCase()}</span>
        ) : (
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="7" r="3.2" />
            <path d="M3.8 17c.9-3.3 3.3-5 6.2-5s5.3 1.7 6.2 5" />
          </svg>
        )}
      </button>
      {open && (
        <div className="profile-menu" role="menu" aria-label="Profile and settings">
          {name && <p className="profile-name">{name}</p>}
          {MENU.map((m) => (
            <Link key={m.href} href={m.href} role="menuitem" onClick={() => setOpen(false)}>
              {m.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
