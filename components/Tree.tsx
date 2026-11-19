'use client';

import { CSSProperties, memo, useEffect, useMemo, useRef } from 'react';
import { growTree, VIEW, type Limb as LimbT } from '@/lib/tree';
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

const PETALS = [0, 72, 144, 216, 288];
/** petals resting on the ground: x offset, y offset, rotation */
const FALLEN: [number, number, number][] = [[-150, 4, 20], [-96, 9, -35], [-40, 2, 70], [58, 7, -10], [120, 3, 45], [178, 8, -60], [12, 10, 15]];
/** light in the crown: x, y, delay */
const MOTES: [number, number, number][] = [[300, 170, 0], [420, 120, 1.4], [520, 150, 2.6], [610, 210, 0.8], [360, 260, 3.2], [470, 230, 1.9], [560, 290, 4.1], [250, 250, 2.2], [650, 140, 3.6], [400, 330, 0.4]];
/** petals drifting down: start x, delay, duration, scale */
const DRIFT: [number, number, number, number][] = [[300, 0, 14, 1], [520, 4.5, 17, 0.8], [420, 9, 15, 1.1], [610, 2.2, 19, 0.7], [360, 12, 16, 0.9], [480, 7, 18, 1]];
const OPEN = 2.6; // seconds for the tree to finish drawing itself

// deterministic 0..1 noise
const hash = (n: number) => ((Math.sin(n * 12.9898 + 4.1414) * 43758.5453) % 1 + 1) % 1;

/** muted branch grey at the trunk, paling to botanical grey and translucency at the twigs */
function branchColor(depth: number) {
  const t = Math.min(1, depth / 7);
  const a = [0x95, 0x93, 0x8a]; // pale taupe at the trunk
  const b = [0xb9, 0xbd, 0xb7];
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgba(${c[0]},${c[1]},${c[2]},${(0.92 - t * 0.42).toFixed(2)})`;
}

/** The trunk as a filled, tapering form with a slight lean, so it reads as wood rather than a line. */
function trunkPath(n: LimbT) {
  const hb = n.w * 0.75; // half-width at the root flare
  const ht = n.w * 0.36; // half-width where it forks
  const lean = 5;
  const my = (n.y + n.y2) / 2;
  return [
    `M${(n.x - hb * 1.6).toFixed(1)} ${(n.y + 2).toFixed(1)}`,
    `C${(n.x - hb).toFixed(1)} ${(n.y - 6).toFixed(1)} ${(n.x - ht + lean).toFixed(1)} ${(my + 10).toFixed(1)} ${(n.x - ht + lean * 0.4).toFixed(1)} ${my.toFixed(1)}`,
    `S${(n.x2 - ht).toFixed(1)} ${(n.y2 + 12).toFixed(1)} ${(n.x2 - ht).toFixed(1)} ${n.y2.toFixed(1)}`,
    `L${(n.x2 + ht).toFixed(1)} ${n.y2.toFixed(1)}`,
    `C${(n.x2 + ht).toFixed(1)} ${(n.y2 + 12).toFixed(1)} ${(n.x + ht + lean).toFixed(1)} ${(my - 10).toFixed(1)} ${(n.x + ht + lean * 0.4).toFixed(1)} ${my.toFixed(1)}`,
    `S${(n.x + hb).toFixed(1)} ${(n.y - 6).toFixed(1)} ${(n.x + hb * 1.6).toFixed(1)} ${(n.y + 2).toFixed(1)}`,
    'Z',
  ].join(' ');
}

/** how much each limb sways, in degrees: trunk still, twigs freer */
const SWAY = [0, 0.22, 0.4, 0.62, 0.9, 1.25, 1.6, 1.9];

function Tree({ memories, threads, selected, onSelect, buds = 0, marks, anchors, lit }: Props) {
  const { root, tips } = useMemo(() => growTree(), []);
  const svgRef = useRef<SVGSVGElement>(null);

  // Blossoms saved from before wait for the tree to open; new ones unfold right away.
  const born = useRef<number | null>(null);
  if (born.current === null && typeof performance !== 'undefined') born.current = performance.now();
  const age = born.current === null ? 0 : (performance.now() - born.current) / 1000;
  const waits = useRef(new Map<number, number>());
  memories.forEach((_, i) => {
    if (!waits.current.has(i)) waits.current.set(i, Math.max(0, OPEN - age + 0.35 + i * 0.22));
  });

  // Which limb tip carries which memory. Each memory takes the next free tip across the crown,
  // unless it belongs near another (the same trip, or a red thread): then the nearest free tip to that one.
  // Earlier memories never move when later ones arrive.
  const anchorKey = (anchors ?? []).join(',');
  const { byLimb, budTips } = useMemo(() => {
    const slot: number[] = [];
    const used = new Map<number, number>();
    const take = (want: number | null) => {
      let best = -1;
      if (want !== null) {
        const a = tips[want];
        let d = Infinity;
        tips.forEach((t, k) => {
          if (used.has(k)) return;
          const dd = (t.x - a.x) ** 2 + (t.y - a.y) ** 2;
          if (dd < d) {
            d = dd;
            best = k;
          }
        });
      }
      if (best < 0) best = tips.findIndex((_, k) => !used.has(k));
      if (best < 0) {
        // more memories than tips: share the least crowded
        let min = Infinity;
        tips.forEach((_, k) => {
          if ((used.get(k) ?? 0) < min) {
            min = used.get(k) ?? 0;
            best = k;
          }
        });
      }
      used.set(best, (used.get(best) ?? 0) + 1);
      return best;
    };
    memories.forEach((_, i) => {
      const a = anchors?.[i];
      slot[i] = take(a !== null && a !== undefined && a < i ? slot[a] : null);
    });
    const m = new Map<number, number[]>();
    slot.forEach((k, i) => m.set(tips[k].limb, [...(m.get(tips[k].limb) || []), i]));
    const b = new Map<number, number>();
    for (let j = 0; j < Math.min(buds, 12); j++) {
      const k = take(null);
      b.set(tips[k].limb, (b.get(tips[k].limb) ?? 0) + 1);
    }
    return { byLimb: m, budTips: b };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memories, tips, anchorKey, buds]);



  // Keep each red thread tied to its two blossoms while the branches move.
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
          const sag = Math.min(140, 40 + Math.hypot(B.x - A.x, B.y - A.y) * 0.22);
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

  function blossom(i: number, x: number, y: number, angle: number) {
    const m = memories[i];
    const isSel = selected === i;
    const wait = waits.current.get(i) ?? 0;
    // small and varied: no two quite alike
    const size = (m.weight === 'heavy' ? 1.06 : m.weight === 'tender' ? 1 : 0.92) * (0.86 + hash(i + 11) * 0.28);
    const tint = m.weight === 'heavy' ? 'url(#pMeaning)' : m.weight === 'tender' ? 'url(#pMist)' : 'url(#pWhite)';
    const tilt = (angle * 180) / Math.PI + 90 + (hash(i + 3) - 0.5) * 40;
    return (
      <g
        key={`b${i}`}
        className={`blossom w-${m.weight}${isSel ? ' is-sel' : ''}${lit?.includes(i) ? ' is-lit' : ''}`}
        transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${tilt.toFixed(0)}) scale(${size})`}
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
        <circle className="hit" r="34" />
        <circle data-anchor={i} r="0.1" fill="none" />
        <circle className="glow" r="30" fill="url(#bGlow)" />
        {PETALS.map((a, k) => (
          <g key={a} transform={`rotate(${a + (hash(i * 5 + k) - 0.5) * 14}) scale(${(0.84 + hash(i * 7 + k) * 0.3).toFixed(2)} ${(0.88 + hash(i * 3 + k) * 0.24).toFixed(2)})`}>
            <path
              className="petal"
              d="M0 0 C -11 -6, -14 -22, -6 -30 Q 0 -27 0 -29 Q 0 -27 6 -30 C 14 -22, 11 -6, 0 0 Z"
              fill={tint}
              style={{ '--k': k, '--d': `${(5 + hash(i + k) * 4).toFixed(2)}s` } as CSSProperties}
            />
            <path className="petal-sheen" d="M0 -3 C -6 -8, -7 -19, -3.5 -25 C -1 -20, -0.6 -10, 0 -3 Z" fill="url(#pSheen)" style={{ '--k': k } as CSSProperties} />
            <path className="petal-vein" d="M0 -2.5 Q 0.6 -14 0 -24" style={{ '--k': k } as CSSProperties} />
          </g>
        ))}
        <circle className="heart" r="4.4" />
        {[0, 52, 104, 156, 208, 260, 312].map((a, k) => (
          <g key={a} className="stamen" transform={`rotate(${a})`} style={{ '--k': k } as CSSProperties}>
            <line y1="-3" y2={-9 - hash(i + a) * 3} />
            <circle cy={-9.5 - hash(i + a) * 3} r="1.1" />
          </g>
        ))}
        {marks?.[i]?.photo && <circle className="mk mk-photo" cx="17" cy="21" r="1.7" />}
        {marks?.[i]?.place && <circle className="mk mk-place" cx="-19" cy="19" r="1.5" />}
        {marks?.[i]?.linked && <circle className="mk mk-linked" cx="0" cy="27" r="1.5" />}
        {isSel && <circle className="sel-ring" r="38" />}
      </g>
    );
  }

  /** a drafted memory waiting for review: a small closed bud, breathing slowly */
  function bud(key: string, x: number, y: number, angle: number) {
    const tilt = (angle * 180) / Math.PI + 90;
    return (
      <g key={key} className="bud-draft" transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${tilt.toFixed(0)}) scale(1.45)`} aria-hidden="true">
        <path d="M0 0 C -4.2 -3.2, -4.4 -10, 0 -14 C 4.4 -10, 4.2 -3.2, 0 0 Z" />
        <path className="bud-sepal" d="M0 0 C -2.6 -1.6, -3.4 -4.4, -2.2 -6.2 M0 0 C 2.6 -1.6, 3.4 -4.4, 2.2 -6.2" />
      </g>
    );
  }

  function limb(n: LimbT): React.ReactNode {
    const sways = n.depth >= 1 && n.depth <= 6;
    // the breeze travels across the crown from left to right
    const wave = (n.x / VIEW.w) * 3.2;
    const style = sways
      ? ({
          transformOrigin: `${n.x.toFixed(1)}px ${n.y.toFixed(1)}px`,
          '--a': `${(SWAY[n.depth] * (0.75 + hash(n.id) * 0.5)).toFixed(3)}deg`,
          animationDuration: `${(6.5 + hash(n.id + 1) * 4.5).toFixed(2)}s`,
          animationDelay: `${(-wave - hash(n.id + 2) * 4).toFixed(2)}s`,
        } as CSSProperties)
      : undefined;
    const carries = byLimb.get(n.id) ?? (budTips.has(n.id) ? [] : undefined);
    if (n.later !== undefined) {
      return (
        <path
          key={n.id}
          className={`twiglet${memories.length >= n.later ? ' grown' : ''}`}
          d={n.d}
          pathLength={1}
          stroke={branchColor(7)}
          strokeWidth={n.w}
          style={{ transitionDelay: `${(hash(n.id) * 1.6).toFixed(2)}s` }}
        />
      );
    }
    return (
      <g key={n.id} className={sways ? 'limb' : undefined} style={style}>
        {n.depth === 0 ? (
          <path className="trunk" d={trunkPath(n)} fill="url(#trunkG)" />
        ) : (
        <path
          className="br"
          d={n.d}
          pathLength={1}
          stroke={branchColor(n.depth)}
          strokeWidth={n.w}
          style={{
            animationDelay: `${(0.2 + n.depth * 0.27 + hash(n.id + 9) * 0.16).toFixed(2)}s`,
            animationDuration: `${(n.depth === 0 ? 0.9 : 0.8 - n.depth * 0.05).toFixed(2)}s`,
          }}
        />
        )}
        {n.depth >= 1 && n.depth <= 3 && (
          <path className="br-light" d={n.d} pathLength={1} strokeWidth={Math.max(0.4, n.w * 0.32)} style={{ animationDelay: `${(0.5 + n.depth * 0.27).toFixed(2)}s` }} />
        )}
        {n.kids.map((k) => limb(k))}
        {!n.kids.some((k) => k.later === undefined) && !carries && hash(n.id + 21) < 0.55 && (
          // a pale leaf, each on its own breath
          <path
            className="leaf"
            d={`M${n.x2.toFixed(1)} ${n.y2.toFixed(1)} q 3.2 -4.6 0 -9.4 q -3.2 4.8 0 9.4 Z`}
            style={{
              transformOrigin: `${n.x2.toFixed(1)}px ${n.y2.toFixed(1)}px`,
              rotate: `${((n.angle * 180) / Math.PI + 90 + (hash(n.id + 4) - 0.5) * 70).toFixed(0)}deg`,
              animationDelay: `${(2.2 + hash(n.id) * 0.8).toFixed(2)}s, ${(-hash(n.id + 5) * 6).toFixed(2)}s`,
              animationDuration: `.9s, ${(3.6 + hash(n.id + 6) * 3.4).toFixed(2)}s`,
            }}
          />
        )}
        {carries?.map((i, k) => blossom(i, n.x2 + k * 10, n.y2 - k * 8, n.angle))}
        {Array.from({ length: budTips.get(n.id) ?? 0 }).map((_, k) => bud(`bud${n.id}-${k}`, n.x2 - k * 7, n.y2 + k * 5, n.angle))}
      </g>
    );
  }

  return (
    <svg
      ref={svgRef}
      className="tree"
      viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
      role="img"
      aria-label={`A tree with ${memories.length} ${memories.length === 1 ? 'blossom' : 'blossoms'}${buds ? `, and ${buds} ${buds === 1 ? 'bud' : 'buds'} waiting for review` : ''}`}
    >
      <defs>
        {/* almost-white, translucent petals; only a meaningful (heavy) memory carries a breath of the red */}
        {/* pearl petals: white, with the faintest blush at the base and a cool sheen at the tip */}
        <radialGradient id="pWhite" cx="50%" cy="100%" r="105%">
          <stop offset="0" stopColor="#f3e6ec" stopOpacity=".98" />
          <stop offset=".38" stopColor="#fbf8fa" stopOpacity=".95" />
          <stop offset=".78" stopColor="#ffffff" stopOpacity=".92" />
          <stop offset="1" stopColor="#eef1ff" stopOpacity=".9" />
        </radialGradient>
        <radialGradient id="pMist" cx="50%" cy="100%" r="105%">
          <stop offset="0" stopColor="#e6e3f3" stopOpacity=".98" />
          <stop offset=".42" stopColor="#f6f5fb" stopOpacity=".95" />
          <stop offset=".8" stopColor="#ffffff" stopOpacity=".92" />
          <stop offset="1" stopColor="#eaf1fb" stopOpacity=".9" />
        </radialGradient>
        <radialGradient id="pMeaning" cx="50%" cy="100%" r="105%">
          <stop offset="0" stopColor="#c99a9f" stopOpacity=".98" />
          <stop offset=".36" stopColor="#f1e1e4" stopOpacity=".95" />
          <stop offset=".8" stopColor="#ffffff" stopOpacity=".92" />
          <stop offset="1" stopColor="#f6eef4" stopOpacity=".9" />
        </radialGradient>
        <linearGradient id="pSheen" x1="0" y1="1" x2="0" y2="0">
          <stop offset=".35" stopColor="#ffffff" stopOpacity="0" />
          <stop offset=".7" stopColor="#ffffff" stopOpacity=".75" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        {/* the trunk: warm grey, lit from the left */}
        <linearGradient id="trunkG" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#b9b6ae" />
          <stop offset=".45" stopColor="#9a968e" />
          <stop offset="1" stopColor="#7f7c76" />
        </linearGradient>
        <radialGradient id="fallG" cx="50%" cy="90%" r="100%">
          <stop offset="0" stopColor="#f4dde6" />
          <stop offset="1" stopColor="#ffffff" />
        </radialGradient>
        <radialGradient id="bGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".9" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="mist" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#e8e8e2" stopOpacity=".9" />
          <stop offset="1" stopColor="#e8e8e2" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="halo" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".95" />
          <stop offset=".45" stopColor="#fbf9ff" stopOpacity=".6" />
          <stop offset=".75" stopColor="#f4f1ff" stopOpacity=".28" />
          <stop offset="1" stopColor="#f8f7f2" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="prismRing" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffc4d6" />
          <stop offset=".2" stopColor="#ffd8bd" />
          <stop offset=".4" stopColor="#fff1c2" />
          <stop offset=".6" stopColor="#d8f3e3" />
          <stop offset=".8" stopColor="#cfe1ff" />
          <stop offset="1" stopColor="#e3d9ff" />
        </linearGradient>
        <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="28" />
        </filter>
      </defs>

      <ellipse className="halo-prism" cx={VIEW.w / 2} cy={VIEW.h * 0.4} rx="330" ry="210" fill="url(#prismRing)" filter="url(#soft)" />
      <ellipse className="halo" cx={VIEW.w / 2} cy={VIEW.h * 0.38} rx="430" ry="290" fill="url(#halo)" />
      <ellipse className="ground" cx={VIEW.w / 2} cy={VIEW.h - 36} rx="380" ry="28" fill="url(#mist)" />
      <ellipse className="ground-glow" cx={VIEW.w / 2} cy={VIEW.h - 34} rx="200" ry="9" fill="url(#prismRing)" filter="url(#soft)" />
      {/* a few petals already fallen */}
      <g className="fallen" aria-hidden="true">
        {FALLEN.map(([x, y, r], k) => (
          <path key={k} d="M0 0 C -3.4 -2, -4.2 -7, -1.8 -9 Q 0 -8.2 0 -8.8 Q 0 -8.2 1.8 -9 C 4.2 -7, 3.4 -2, 0 0 Z" transform={`translate(${VIEW.w / 2 + x} ${VIEW.h - 36 + y}) rotate(${r}) scale(.9 .55)`} fill="url(#fallG)" />
        ))}
      </g>

      <g className="threads" aria-hidden="true">
        {threads.map(([a, b]) => (
          <path key={`${a}-${b}`} data-thread={`${a}-${b}`} className="thread" />
        ))}
      </g>

      {limb(root)}

      {/* light caught in the crown, and petals drifting down */}
      <g className="motes" aria-hidden="true">
        {MOTES.map(([x, y, d], k) => (
          <circle key={k} cx={x} cy={y} r={0.9 + (k % 3) * 0.45} style={{ animationDelay: `${d}s` } as CSSProperties} />
        ))}
      </g>
      {memories.length > 0 && (
        <g className="drifting" aria-hidden="true">
          {DRIFT.map(([x, d, dur, s], k) => (
            <path
              key={k}
              className="drift-petal"
              d="M0 0 C -3.4 -2, -4.2 -7, -1.8 -9 Q 0 -8.2 0 -8.8 Q 0 -8.2 1.8 -9 C 4.2 -7, 3.4 -2, 0 0 Z"
              fill="url(#fallG)"
              style={{ '--x': `${x}px`, '--s': s, animationDelay: `${d}s`, animationDuration: `${dur}s` } as CSSProperties}
            />
          ))}
        </g>
      )}
    </svg>
  );
}

export default memo(Tree);
