'use client';

import { useEffect, useRef } from 'react';

/** On a phone the rooms scroll sideways; start with the current room in view. */
export default function RoomsScroll() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const nav = ref.current?.parentElement;
    const cur = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !cur || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollLeft = Math.max(0, cur.offsetLeft - nav.offsetLeft - 18);
  }, []);
  return <span ref={ref} hidden />;
}
