import Link from 'next/link';
import type { ReactNode } from 'react';
import Flower from './Flower';
import { ArchiveNav, Bubbles, GardenNav, ProfileMenu, spaceOf } from './Nav';

export type Room =
  | 'today'
  | 'garden'
  | 'archive'
  | 'archives'
  | 'places'
  | 'people'
  | 'timeline'
  | 'collections'
  | 'letters'
  | 'search'
  | 'you'
  | 'constellation'
  | 'rewind';

/**
 * The quiet top line shared by every room: the mark, the three spaces, and the profile in the corner.
 * Archive rooms carry their search and chips beneath it; the garden's explorations carry theirs.
 */
export default function Masthead({ room, children }: { room: Room; children?: ReactNode }) {
  const space = spaceOf(room);
  return (
    <>
      <header className="top">
        <div className="brand">
          <Link href="/" className="mark-link">
            <span className="mark">
              <Flower size={30} />
              What Stayed
            </span>
          </Link>
        </div>
        <Bubbles room={room} />
        <div className="top-r">
          {children ? <div className="acts">{children}</div> : null}
          <span className="top-icons">
            <ProfileMenu room={room} />
          </span>
        </div>
        <Bubbles room={room} dock />
      </header>
      {space === 'archive' && <ArchiveNav room={room} />}
      {(room === 'constellation' || room === 'rewind') && <GardenNav room={room} />}
    </>
  );
}
