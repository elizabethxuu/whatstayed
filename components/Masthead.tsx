import Link from 'next/link';
import type { ReactNode } from 'react';

/** The quiet top line shared by the Garden and the Archives. */
export default function Masthead({ room, children }: { room: 'garden' | 'archives'; children?: ReactNode }) {
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
        </nav>
        {children ? <div className="acts">{children}</div> : null}
      </div>
    </header>
  );
}
