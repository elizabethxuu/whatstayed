import Link from 'next/link';
import type { ReactNode } from 'react';
import RoomsScroll from './RoomsScroll';
import TabBar from './TabBar';

export type Room = 'today' | 'garden' | 'archives' | 'places' | 'people' | 'timeline' | 'collections' | 'letters' | 'search' | 'you';

const ROOMS: [Room, string, string][] = [
  ['garden', '/', 'The Garden'],
  ['today', '/today', 'Today'],
  ['archives', '/archives', 'The Archives'],
  ['places', '/places', 'Places'],
  ['people', '/people', 'People'],
  ['timeline', '/timeline', 'Timeline'],
  ['collections', '/collections', 'Collections'],
  ['letters', '/letters', 'Letters'],
];

/** The quiet top line shared by every room. */
export default function Masthead({ room, children }: { room: Room; children?: ReactNode }) {
  return (
    <header className="top">
      <div className="brand">
        <Link href="/" className="mark-link">
          <span className="mark">What Stayed</span>
        </Link>
        <p className="sub">An archive of places and memories</p>
      </div>
      <div className="top-r">
        <nav className="rooms" aria-label="Rooms">
          {ROOMS.map(([r, href, label]) => (
            <Link key={r} href={href} className="quiet" aria-current={room === r ? 'page' : undefined}>
              {label}
            </Link>
          ))}
          <RoomsScroll />
        </nav>
        {children ? <div className="acts">{children}</div> : null}
        <span className="top-icons">
          <Link href="/search" className="quiet you-link" aria-current={room === 'search' ? 'page' : undefined} aria-label="Search everything">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="8.6" cy="8.6" r="5.2" />
              <path d="M12.6 12.6l4.4 4.4" />
            </svg>
          </Link>
          <Link href="/you" className="quiet you-link" aria-current={room === 'you' ? 'page' : undefined} aria-label="You: profile and settings">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="10" cy="7" r="3.2" />
              <path d="M3.8 17c.9-3.3 3.3-5 6.2-5s5.3 1.7 6.2 5" />
            </svg>
          </Link>
        </span>
      </div>
      <TabBar room={room} />
    </header>
  );
}
