'use client';

import { CSSProperties, memo, useEffect, useMemo, useRef } from 'react';
import { growWillow, VIEW, type Floret } from '@/lib/willow';
import type { Memory } from '@/lib/memory';

type Mark = { photo?: boolean; place?: boolean; linked?: boolean };

type Props = {
  memories: Memory[];
  threads: readonly (readonly [number, number])[];
  selected: number | null;
  onSelect: (i: number | null) => void;
  /** drafts waiting for review: shown as closed buds, never as blossoms */
  buds?: number;
  /** subtle marks: has photographs, is on the map, is tied to another memory */
  marks?: Mark[];
  /** grow memory i near memory anchors[i] (same trip, or tied together) */
  anchors?: (number | null)[];
  /** memories the agent just found or the person just revisited: gently lit */
  lit?: number[];
};

/** pollen motes drifting through the canopy: x, y, delay, duration (six; with the six petals, never more than twelve) */
const MOTES: [number, number, number, number][] = [[300, 300, 0, 22], [560, 200, 6, 26], [700, 380, 3, 24], [420, 470, 11, 28], [820, 280, 15, 25], [230, 430, 9, 27]];
/** petals drifting down: start x, delay, duration, scale */
const DRIFT: [number, number, number, number][] = [[320, 0, 15, 1], [540, 4.5, 18, 0.8], [430, 9, 16, 1.1], [640, 2.2, 20, 0.7], [380, 12, 17, 0.9], [500, 7, 19, 1]];
const OPEN = 2.4; // seconds for the willow to finish unfolding

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** five rounded petals, the What Stayed flower */
const PETAL = 'M0 0 C -4.6 -2.2, -6.2 -8.6, -3.2 -11.4 C -1.6 -12.8, 1.6 -12.8, 3.2 -11.4 C 6.2 -8.6, 4.6 -2.2, 0 0 Z';

function floret(fl: Floret, k: number, open: boolean) {
  if (!open) return null;
  return (
    <g key={k} className={`floret t${fl.tone % 2}`} transform={`translate(${fl.x.toFixed(1)} ${fl.y.toFixed(1)}) rotate(${fl.rot.toFixed(0)}) scale(${(fl.r / 9).toFixed(3)})`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <path key={a} d={PETAL} transform={`rotate(${a})`} />
      ))}
      <circle r="2.2" className="feye" />
    </g>
  );
}

function Tree({ memories, threads, selected, onSelect, buds = 0, marks, anchors, lit }: Props) {
  const W = useMemo(() => growWillow(), []);
  const svgRef = useRef<SVGSVGElement>(null);

  // memories saved before wait for the willow to unfold; new ones open right away
  const born = useRef<number | null>(null);
  if (born.current === null && typeof performance !== 'undefined') born.current = performance.now();
  const age = born.current === null ? 0 : (performance.now() - born.current) / 1000;
  const waits = useRef(new Map<number, number>());
  const fresh = useRef(new Set<number>());
  memories.forEach((_, i) => {
    if (!waits.current.has(i)) {
      waits.current.set(i, Math.max(0, OPEN - age + 0.3 + i * 0.12));
      if (age > OPEN) fresh.current.add(i);
    }
  });

  // the garden fills as the archive grows: a scattering at first light, more florets with every memory
  const opened = Math.min(W.total, 110 + memories.length * 26);

  // which slot on which strand carries each memory; a memory tied to an earlier one hangs near it
  const anchorKey = (anchors ?? []).join(',');
  const { onStrand, budsOn } = useMemo(() => {
    const used = new Set<number>();
    const slotOf: number[] = [];
    const take = (near: number | null) => {
      let best = -1;
      if (near !== null) {
        const a = W.slots[near];
        let d = Infinity;
        W.slots.forEach((s, k) => {
          if (used.has(k)) return;
          const dd = (s.x - a.x) ** 2 + (s.y - a.y) ** 2;
          if (dd < d) {
            d = dd;
            best = k;
          }
        });
      }
      if (best < 0) best = W.slots.findIndex((_, k) => !used.has(k));
      if (best < 0) best = slotOf.length % W.slots.length; // more memories than slots: share
      used.add(best);
      return best;
    };
    memories.forEach((_, i) => {
      const a = anchors?.[i];
      slotOf[i] = take(a !== null && a !== undefined && a < i ? slotOf[a] : null);
    });
    const byStrand = new Map<number, { i: number; x: number; y: number }[]>();
    slotOf.forEach((k, i) => {
      const s = W.slots[k];
      byStrand.set(s.strand, [...(byStrand.get(s.strand) ?? []), { i, x: s.x, y: s.y }]);
    });
    const budMap = new Map<number, { x: number; y: number }[]>();
    for (let j = 0; j < Math.min(buds, 12); j++) {
      const s = W.slots[take(null)];
      budMap.set(s.strand, [...(budMap.get(s.strand) ?? []), { x: s.x, y: s.y }]);
    }
    return { onStrand: byStrand, budsOn: budMap };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memories, W, anchorKey, buds]);

  // keep each red thread tied to its two blossoms while the strands sway
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !threads.length) return;
    let raf = 0;
    const tick = () => {
      const inv = svg.getScreenCTM()?.inverse();
      if (inv) {
        for (const [a, b] of threads) {
          const pa = svg.querySelector<SVGCircleElement>(`[data-anchor="${a}"]`);
          const pb = svg.querySelector<SVGCircleElement>(`[data-anchor="${b}"]`);
          const path = svg.querySelector<SVGPathElement>(`[data-thread="${a}-${b}"]`);
          const ma = pa?.getScreenCTM();
          const mb = pb?.getScreenCTM();
          if (!ma || !mb || !path) continue;
          const A = new DOMPoint(0, 0).matrixTransform(ma).matrixTransform(inv);
          const B = new DOMPoint(0, 0).matrixTransform(mb).matrixTransform(inv);
          const sag = Math.min(120, 30 + Math.hypot(B.x - A.x, B.y - A.y) * 0.2);
          const mx = (A.x + B.x) / 2;
          const my = Math.max(A.y, B.y) + sag;
          path.setAttribute('d', `M${A.x.toFixed(1)} ${A.y.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${B.x.toFixed(1)} ${B.y.toFixed(1)}`);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [threads]);

  /** a memory: a luminous forget-me-not; fuller arrangements for memories marked as mattering more */
  function blossom(i: number, x: number, y: number) {
    const m = memories[i];
    const isSel = selected === i;
    const wait = waits.current.get(i) ?? 0;
    const size = 1.45 * (m.weight === 'heavy' ? 1.12 : m.weight === 'tender' ? 1.02 : 0.94) * (0.9 + hash(i + 11) * 0.2);
    const tilt = (hash(i + 3) - 0.5) * 50;
    const flower = (sx: number, sy: number, sc: number, key: string, main: boolean) => (
      <g key={key} transform={`translate(${sx} ${sy}) scale(${sc})`}>
        {[0, 72, 144, 216, 288].map((a, k) => (
          <g key={a} transform={`rotate(${a + (hash(i * 5 + k) - 0.5) * 10})`}>
            <path className="petal" d={PETAL} style={{ '--k': k } as CSSProperties} />
          </g>
        ))}
        {main && <circle className="heart" r="3" />}
        {main && [0, 72, 144, 216, 288].map((a) => <path key={`e${a}`} className="eye-ray" d="M0 -2.6 L0 -5.6" transform={`rotate(${a + 36})`} />)}
        {!main && <circle className="heart" r="2.4" />}
      </g>
    );
    return (
      <g
        key={`b${i}`}
        className={`blossom w-${m.weight}${fresh.current.has(i) ? ' is-fresh' : ''}${isSel ? ' is-sel' : ''}${lit?.includes(i) ? ' is-lit' : ''}`}
        transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${tilt.toFixed(0)}) scale(${size.toFixed(3)})`}
        role="button"
        tabIndex={0}
        aria-label={`${m.place}: ${m.moment}`}
        aria-pressed={isSel}
        onClick={() => onSelect(isSel ? null : i)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(isSel ? null : i);
          }
        }}
        style={{ '--wait': `${wait.toFixed(2)}s` } as CSSProperties}
      >
        <circle className="hit" r="22" />
        <circle data-anchor={i} r="0.1" fill="none" />
        {fresh.current.has(i) && <circle className="ripple" r="14" />}
        {m.weight === 'heavy' && (
          <>
            {flower(-11, 7, 0.62, 'h1', false)}
            {flower(10, 9, 0.55, 'h2', false)}
          </>
        )}
        {m.weight === 'tender' && <circle className="tbud" cx="9" cy="9" r="2.6" />}
        {flower(0, 0, 1, 'main', true)}
        {marks?.[i]?.photo && <circle className="mk mk-photo" cx="13" cy="-11" r="1.6" />}
        {marks?.[i]?.place && <circle className="mk mk-place" cx="-14" cy="-9" r="1.4" />}
        {marks?.[i]?.linked && <circle className="mk mk-linked" cx="0" cy="16" r="1.4" />}
        {isSel && <circle className="sel-ring" r="20" />}
      </g>
    );
  }

  /** a drafted memory waiting for review: a closed bud, breathing slowly */
  function bud(key: string, x: number, y: number) {
    return (
      <g key={key} className="bud-draft" transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(1.3)`} aria-hidden="true">
        <path d="M0 -12 C -4.2 -9, -4.4 -3, 0 0 C 4.4 -3, 4.2 -9, 0 -12 Z" />
        <path className="bud-sepal" d="M0 -12 C -2.6 -10.4, -3.4 -7.6, -2.2 -5.8 M0 -12 C 2.6 -10.4, 3.4 -7.6, 2.2 -5.8" transform="rotate(180 0 -6)" />
      </g>
    );
  }

  return (
    <svg
      ref={svgRef}
      className="tree willow"
      viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
      role="img"
      aria-label={`A willow with ${memories.length} ${memories.length === 1 ? 'blossom' : 'blossoms'}${buds ? `, and ${buds} ${buds === 1 ? 'bud' : 'buds'} waiting for review` : ''}`}
    >

      {/* the daytime moon, faint, high to the right of the crown */}
      <circle className="moon" cx="918" cy="64" r="30" aria-hidden="true" />

      {/* the strands at the back of the crown first, then the tree, then the front */}
      {[0, 1].map((layer) => (
        <g key={layer} className={`strands layer-${layer}`}>
          {layer === 1 && (
            <g className="wood">
              <path className="trunk" d={W.trunk} />
              <path className="trunk-light" d={W.trunkLight} />
              {W.limbs.map((l, k) => (
                <path key={k} className="limb-arc" d={l.d} strokeWidth={l.w} style={{ animationDelay: `${0.2 + k * 0.08}s` }} />
              ))}
            </g>
          )}
          {W.strands
            .filter((s) => s.depth === layer)
            .map((s) => (
              <g
                key={s.id}
                className="strand"
                style={
                  {
                    transformOrigin: `${s.ox.toFixed(1)}px ${s.oy.toFixed(1)}px`,
                    '--a': `${s.sway.toFixed(2)}deg`,
                    '--dur': `${s.dur.toFixed(2)}s`,
                    '--dl': `${s.delay.toFixed(2)}s`,
                    '--in': `${(0.3 + (s.id % 12) * 0.06).toFixed(2)}s`,
                  } as CSSProperties
                }
              >
                <path className="strand-line" d={s.d} />
                {s.leaves.map((l, k) => (
                  <ellipse key={`l${k}`} className="wleaf" cx={l.x} cy={l.y} rx={l.l / 2} ry={0.9} transform={`rotate(${l.a.toFixed(0)} ${l.x.toFixed(1)} ${l.y.toFixed(1)})`} />
                ))}
                {s.florets.map((fl, k) => floret(fl, k, fl.order < opened))}
                {s.cluster.length > 0 && <g className="raceme">{s.cluster.map((fl, k) => floret(fl, 1000 + k, fl.order < opened))}</g>}
                {(onStrand.get(s.id) ?? []).map(({ i, x, y }) => blossom(i, x, y))}
                {(budsOn.get(s.id) ?? []).map(({ x, y }, k) => bud(`bud${s.id}-${k}`, x, y))}
              </g>
            ))}
        </g>
      ))}

      <g className="carpet" aria-hidden="true">
        {W.ground.map((fl, k) => floret(fl, k, fl.order < opened))}
      </g>

      <g className="threads" aria-hidden="true">
        {threads.map(([a, b]) => (
          <path key={`${a}-${b}`} data-thread={`${a}-${b}`} className="thread" />
        ))}
      </g>

      <g className="motes" aria-hidden="true">
        {MOTES.map(([x, y, d, dur], k) => (
          <circle key={k} cx={x} cy={y} r={1.6 + (k % 3) * 0.5} style={{ animationDelay: `${d}s`, animationDuration: `${dur}s` } as CSSProperties} />
        ))}
      </g>
      {memories.length > 0 && (
        <g className="drifting" aria-hidden="true">
          {DRIFT.map(([x, d, dur, s], k) => (
            <path key={k} className="drift-petal" d={PETAL} style={{ '--x': `${x}px`, '--s': s, animationDelay: `${d}s`, animationDuration: `${dur}s` } as CSSProperties} />
          ))}
        </g>
      )}
    </svg>
  );
}

export default memo(Tree);
