'use client';

import Link from 'next/link';
import type { Room } from './Masthead';

const haptic = () => {
  try {
    navigator.vibrate?.(6);
  } catch {
    /* not supported */
  }
};

/** Phones: five destinations, fine-line icons, one subtle mark for where you are. */
const TABS: { room: Room; also?: Room[]; href: string; label: string; icon: React.ReactNode }[] = [
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
  {
    room: 'you',
    also: ['people', 'timeline', 'collections', 'letters', 'search'],
    href: '/you',
    label: 'You',
    icon: (
      <>
        <circle cx="12" cy="8.4" r="3.6" />
        <path d="M5 20c1-3.7 3.8-5.7 7-5.7s6 2 7 5.7" />
      </>
    ),
  },
];

export default function TabBar({ room }: { room: Room }) {
  return (
    <nav className="tabbar" aria-label="Destinations">
      {TABS.map((t) => {
        const here = room === t.room || !!t.also?.includes(room);
        return (
          <Link key={t.room} href={t.href} className="tab" aria-current={here ? 'page' : undefined} onClick={haptic}>
            <svg viewBox="0 0 24 24" aria-hidden="true">{t.icon}</svg>
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
