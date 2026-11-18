import Link from 'next/link';
import type { ReactNode } from 'react';

/** The quiet top line shared by every room. */
export default function Masthead({ room, children }: { room: 'garden' | 'archives' | 'places' | 'account'; children?: ReactNode }) {
  return (
    <header className="top">
      <div className="brand">
        <Link href="/" className="mark-link">
          <span className="mark">What Stayed</span>
        </Link>
        <p className="sub">An archive of the places that stayed</p>
      </div>
      <div className="top-r">
        <nav className="rooms" aria-label="Rooms">
          <Link href="/" className="quiet" aria-current={room === 'garden' ? 'page' : undefined}>
            The Garden
          </Link>
          <Link href="/archives" className="quiet" aria-current={room === 'archives' ? 'page' : undefined}>
            The Archives
          </Link>
          <Link href="/places" className="quiet" aria-current={room === 'places' ? 'page' : undefined}>
            Places
          </Link>
        </nav>
        {children ? <div className="acts">{children}</div> : null}
        <Link href="/account" className="quiet you-link" aria-current={room === 'account' ? 'page' : undefined} aria-label="Your account">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="7" r="3.2" />
            <path d="M3.8 17c.9-3.3 3.3-5 6.2-5s5.3 1.7 6.2 5" />
          </svg>
        </Link>
      </div>
    </header>
  );
}
