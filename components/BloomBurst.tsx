'use client';

import { useEffect, useState } from 'react';
import Flower from './Flower';

/** A blossom unfolding at the centre of the screen when a memory is saved; it never blocks a tap. */
export default function BloomBurst() {
  const [show, setShow] = useState<{ key: number; count: number } | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const on = (e: Event) => {
      const count = (e as CustomEvent<{ count?: number }>).detail?.count ?? 1;
      setShow({ key: Date.now(), count });
      clearTimeout(t);
      t = setTimeout(() => setShow(null), 1900);
    };
    window.addEventListener('ws:bloom', on);
    return () => {
      window.removeEventListener('ws:bloom', on);
      clearTimeout(t);
    };
  }, []);
  if (!show) return null;
  return (
    <div className="bloom-burst" key={show.key} aria-hidden="true">
      <span className="bloom-ring" />
      <Flower size={92} className="bloom-flower" />
      <span className="bloom-word">{show.count > 1 ? `${show.count} new blossoms` : 'A new blossom'}</span>
    </div>
  );
}
