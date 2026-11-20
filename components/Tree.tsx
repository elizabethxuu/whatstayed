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

/** light drifting through the canopy: x, y, delay, duration */
const FIREFLIES: [number, number, number, number][] = [
  [260, 300, 0, 9], [380, 210, 1.6, 11], [540, 180, 3.1, 10], [660, 260, 0.8, 12], [720, 400, 2.4, 9], [300, 470, 4.2, 13],
  [470, 330, 5.1, 10], [600, 470, 1.2, 11], [820, 330, 3.6, 12], [180, 400, 2.8, 10], [420, 560, 0.4, 14], [560, 600, 4.8, 12],
];
/** petals drifting down: start x, delay, duration, scale */
const DRIFT: [number, number, number, number][] = [[320, 0, 15, 1], [540, 4.5, 18, 0.8], [430, 9, 16, 1.1], [640, 2.2, 20, 0.7], [380, 12, 17, 0.9], [500, 7, 19, 1]];
const TONES = ['url(#fl0)', 'url(#fl1)', 'url(#fl2)', 'url(#fl3)'];
/** about one floret in eight is a soft pink blossom among the blues */
const toneOf = (fl: Floret) => (fl.tone === 3 && hash(fl.x * 3.1 + fl.y) < 0.5 ? 'url(#fl4)' : TONES[fl.tone]);
const OPEN = 2.4; // seconds for the willow to finish unfolding

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** five rounded petals, the What Stayed flower */
const PETAL = 'M0 0 C -4.6 -2.2, -6.2 -8.6, -3.2 -11.4 C -1.6 -12.8, 1.6 -12.8, 3.2 -11.4 C 6.2 -8.6, 4.6 -2.2, 0 0 Z';

function floret(fl: Floret, k: number, open: boolean) {
  if (!open)
    return <circle key={k} className="fbud" cx={fl.x} cy={fl.y} r={Math.max(0.9, fl.r * 0.55)} />;
  return (
    <g key={k} className="floret" transform={`translate(${fl.x.toFixed(1)} ${fl.y.toFixed(1)}) rotate(${fl.rot.toFixed(0)}) scale(${(fl.r / 9).toFixed(3)})`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <path key={a} d={PETAL} transform={`rotate(${a})`} fill={toneOf(fl)} />
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
  memories.forEach((_, i) => {
    if (!waits.current.has(i)) waits.current.set(i, Math.max(0, OPEN - age + 0.3 + i * 0.12));
  });

  // the garden fills as the archive grows: more of the tiny florets open with every memory
  const opened = Math.min(W.total, 380 + memories.length * 40);

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
    const size = (m.weight === 'heavy' ? 1.12 : m.weight === 'tender' ? 1.02 : 0.94) * (0.9 + hash(i + 11) * 0.2);
    const tint = m.weight === 'heavy' ? 'url(#pMeaning)' : m.weight === 'tender' ? 'url(#pMist)' : 'url(#pWhite)';
    const tilt = (hash(i + 3) - 0.5) * 50;
    const flower = (sx: number, sy: number, sc: number, key: string, main: boolean) => (
      <g key={key} transform={`translate(${sx} ${sy}) scale(${sc})`}>
        {[0, 72, 144, 216, 288].map((a, k) => (
          <g key={a} transform={`rotate(${a + (hash(i * 5 + k) - 0.5) * 10})`}>
            <path className="petal" d={PETAL} fill={tint} style={{ '--k': k } as CSSProperties} />
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
        className={`blossom w-${m.weight}${isSel ? ' is-sel' : ''}${lit?.includes(i) ? ' is-lit' : ''}`}
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
        <circle className="glow" r="26" fill="url(#bGlow)" />
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
      <defs>
        {/* memory blossoms: luminous blue petals, paler at the edge */}
        <radialGradient id="pWhite" cx="50%" cy="100%" r="110%">
          <stop offset="0" stopColor="#4f7fe6" />
          <stop offset=".55" stopColor="#8fb6ff" />
          <stop offset="1" stopColor="#d9e7ff" />
        </radialGradient>
        <radialGradient id="pMist" cx="50%" cy="100%" r="110%">
          <stop offset="0" stopColor="#5b6fe0" />
          <stop offset=".55" stopColor="#9ea9f5" />
          <stop offset="1" stopColor="#e2e4ff" />
        </radialGradient>
        <radialGradient id="pMeaning" cx="50%" cy="100%" r="110%">
          <stop offset="0" stopColor="#3f6fe0" />
          <stop offset=".5" stopColor="#7fa8ff" />
          <stop offset="1" stopColor="#eef4ff" />
        </radialGradient>
        {/* tiny florets: powder blue, periwinkle, cornflower, a little lavender */}
        <radialGradient id="fl0" cx="50%" cy="100%" r="110%"><stop offset="0" stopColor="#6d93ee" /><stop offset="1" stopColor="#c7dbff" /></radialGradient>
        <radialGradient id="fl1" cx="50%" cy="100%" r="110%"><stop offset="0" stopColor="#7d87e8" /><stop offset="1" stopColor="#d3d6ff" /></radialGradient>
        <radialGradient id="fl2" cx="50%" cy="100%" r="110%"><stop offset="0" stopColor="#5f8fe6" /><stop offset="1" stopColor="#b4ceff" /></radialGradient>
        <radialGradient id="fl3" cx="50%" cy="100%" r="110%"><stop offset="0" stopColor="#8f8ae6" /><stop offset="1" stopColor="#e1dcff" /></radialGradient>
        <radialGradient id="fl4" cx="50%" cy="100%" r="110%"><stop offset="0" stopColor="#c98791" /><stop offset="1" stopColor="#f4e6e5" /></radialGradient>
        {/* the reflection in still water fades out below the bank */}
        <linearGradient id="reflFade" x1="0" y1="694" x2="0" y2="776" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="reflMask" maskUnits="userSpaceOnUse" x="0" y="694" width="1000" height="90">
          <rect x="0" y="694" width="1000" height="90" fill="url(#reflFade)" />
        </mask>
        <radialGradient id="bGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#bcd3ff" stopOpacity=".55" />
          <stop offset="1" stopColor="#bcd3ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="moonhalo" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#9fbcff" stopOpacity=".28" />
          <stop offset=".6" stopColor="#6f8fe0" stopOpacity=".08" />
          <stop offset="1" stopColor="#6f8fe0" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="pool" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#8fb0ff" stopOpacity=".3" />
          <stop offset="1" stopColor="#8fb0ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bark" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5d6f9c" />
          <stop offset=".45" stopColor="#36466f" />
          <stop offset="1" stopColor="#1c2747" />
        </linearGradient>
      </defs>

      <ellipse className="halo" cx="488" cy="300" rx="430" ry="300" fill="url(#moonhalo)" />
      <ellipse className="ground" cx="488" cy="694" rx="360" ry="26" fill="url(#pool)" />

      {/* the strands at the back of the crown first, then the tree, then the front */}
      <g id="willow-crown">
      {[0, 1].map((layer) => (
        <g key={layer} className={`strands layer-${layer}`}>
          {layer === 1 && (
            <g className="wood">
              <path className="trunk" d={W.trunk} fill="url(#bark)" />
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
                  <ellipse key={`l${k}`} className="wleaf" cx={l.x} cy={l.y} rx={l.l / 2} ry={1.25} transform={`rotate(${l.a.toFixed(0)} ${l.x.toFixed(1)} ${l.y.toFixed(1)})`} />
                ))}
                {s.florets.map((fl, k) => floret(fl, k, fl.order < opened))}
                {s.cluster.length > 0 && <g className="raceme">{s.cluster.map((fl, k) => floret(fl, 1000 + k, fl.order < opened))}</g>}
                {(onStrand.get(s.id) ?? []).map(({ i, x, y }) => blossom(i, x, y))}
                {(budsOn.get(s.id) ?? []).map(({ x, y }, k) => bud(`bud${s.id}-${k}`, x, y))}
              </g>
            ))}
        </g>
      ))}

      </g>

      {/* the willow, reflected and foreshortened in still water, with a few fine ripple lines */}
      <g className="reflection" aria-hidden="true" mask="url(#reflMask)">
        <use href="#willow-crown" transform="matrix(1 0 0 -0.16 0 805.04)" />
      </g>
      <g className="ripples" aria-hidden="true">
        <path d="M300 712 Q 488 704 676 712" />
        <path d="M352 728 Q 488 722 624 728" />
        <path d="M410 744 Q 488 740 566 744" />
        <path d="M236 702 Q 280 699 324 702" />
        <path d="M660 724 Q 700 721 740 724" />
      </g>

      <g className="carpet" aria-hidden="true">
        {W.ground.map((fl, k) => floret(fl, k, fl.order < opened))}
      </g>

      <g className="threads" aria-hidden="true">
        {threads.map(([a, b]) => (
          <path key={`${a}-${b}`} data-thread={`${a}-${b}`} className="thread" />
        ))}
      </g>

      <g className="fireflies" aria-hidden="true">
        {FIREFLIES.map(([x, y, d, dur], k) => (
          <circle key={k} cx={x} cy={y} r={1.3 + (k % 3) * 0.5} style={{ animationDelay: `${d}s`, animationDuration: `${dur}s` } as CSSProperties} />
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
