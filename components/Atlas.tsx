'use client';

import { geoEqualEarth, geoGraticule10, geoInterpolate, geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import world from 'world-atlas/countries-110m.json';
import { PointerEvent, useEffect, useMemo, useRef, useState, WheelEvent } from 'react';
import type { PlaceGroup } from '@/lib/places';

const W = 1000;
const H = 520;

type Props = {
  groups: PlaceGroup[];
  links: { a: string; b: string; id: string }[]; // place keys
  selected: string | null;
  onSelect: (key: string | null) => void;
};

type View = { k: number; x: number; y: number };

const topo = world as unknown as Topology<{ countries: GeometryCollection; land: GeometryCollection }>;

export default function Atlas({ groups, links, selected, onSelect }: Props) {
  const projection = useMemo(() => geoEqualEarth().fitExtent([[12, 12], [W - 12, H - 12]], { type: 'Sphere' }), []);
  const path = useMemo(() => geoPath(projection), [projection]);

  const base = useMemo(() => {
    const land = feature(topo, topo.objects.countries);
    const borders = mesh(topo, topo.objects.countries, (a, b) => a !== b);
    return {
      sphere: path({ type: 'Sphere' }) || '',
      graticule: path(geoGraticule10()) || '',
      land: path(land) || '',
      borders: path(borders) || '',
    };
  }, [path]);

  const placed = groups.filter((g) => g.lat !== undefined && g.lng !== undefined);
  const pos = useMemo(() => {
    const m = new Map<string, [number, number]>();
    for (const g of placed) {
      const p = projection([g.lng as number, g.lat as number]);
      if (p) m.set(g.key, p as [number, number]);
    }
    return m;
  }, [placed, projection]);

  const arcs = useMemo(
    () =>
      links
        .map((l) => {
          const A = placed.find((g) => g.key === l.a);
          const B = placed.find((g) => g.key === l.b);
          if (!A || !B || A.key === B.key) return null;
          const interp = geoInterpolate([A.lng as number, A.lat as number], [B.lng as number, B.lat as number]);
          const pts = Array.from({ length: 48 }, (_, i) => interp(i / 47));
          const d = path({ type: 'LineString', coordinates: pts });
          return d ? { id: l.id, d } : null;
        })
        .filter((x): x is { id: string; d: string } => x !== null),
    [links, placed, path],
  );

  /* ---------- zoom and pan, by hand: drag, wheel, pinch, buttons ---------- */
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const svg = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const last = useRef<{ x: number; y: number; dist?: number } | null>(null);
  const moved = useRef(false);

  const clamp = (v: View): View => {
    const k = Math.min(10, Math.max(1, v.k));
    const minX = W - W * k;
    const minY = H - H * k;
    return { k, x: Math.min(0, Math.max(minX, v.x)), y: Math.min(0, Math.max(minY, v.y)) };
  };
  const toLocal = (cx: number, cy: number) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: ((cx - r.left) / r.width) * W, y: ((cy - r.top) / r.height) * H };
  };
  const zoomAt = (factor: number, at: { x: number; y: number }) =>
    setView((v) => {
      const k = Math.min(10, Math.max(1, v.k * factor));
      const f = k / v.k;
      return clamp({ k, x: at.x - (at.x - v.x) * f, y: at.y - (at.y - v.y) * f });
    });

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    zoomAt(Math.exp(-e.deltaY * 0.0015), toLocal(e.clientX, e.clientY));
  }
  function onDown(e: PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    last.current = null;
    moved.current = false;
  }
  function onMove(e: PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const r = svg.current!.getBoundingClientRect();
    const scale = W / r.width;
    if (pts.length === 1) {
      const p = pts[0];
      if (last.current) {
        const dx = (p.x - last.current.x) * scale;
        const dy = (p.y - last.current.y) * scale;
        if (Math.abs(dx) + Math.abs(dy) > 1) moved.current = true;
        setView((v) => clamp({ ...v, x: v.x + dx, y: v.y + dy }));
      }
      last.current = { x: p.x, y: p.y };
    } else if (pts.length === 2) {
      const [a, b] = pts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = toLocal((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (last.current?.dist) zoomAt(dist / last.current.dist, mid);
      last.current = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, dist };
      moved.current = true;
    }
  }
  function onUp(e: PointerEvent) {
    pointers.current.delete(e.pointerId);
    last.current = null;
  }

  // bring a selected place into view if it's off-screen at the current zoom
  useEffect(() => {
    if (!selected) return;
    const p = pos.get(selected);
    if (!p) return;
    setView((v) => {
      const sx = p[0] * v.k + v.x;
      const sy = p[1] * v.k + v.y;
      if (sx > 40 && sx < W - 40 && sy > 40 && sy < H - 40) return v;
      return clamp({ k: v.k, x: W / 2 - p[0] * v.k, y: H / 2 - p[1] * v.k });
    });
  }, [selected, pos]);

  const r = 4.2 / Math.sqrt(view.k);

  return (
    <div className="atlas">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="atlas-svg"
        role="group"
        aria-label="A map of your places. Drag to move, scroll or pinch to zoom."
        onWheel={onWheel}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={(e) => {
          if (!moved.current && e.target === e.currentTarget) onSelect(null);
        }}
      >
        <defs>
          <clipPath id="sphereClip">
            <path d={base.sphere} />
          </clipPath>
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <path d={base.sphere} className="a-sea" onClick={() => !moved.current && onSelect(null)} />
          <g clipPath="url(#sphereClip)">
            <path d={base.graticule} className="a-grat" />
            <path d={base.land} className="a-land" onClick={() => !moved.current && onSelect(null)} />
            <path d={base.borders} className="a-border" />
          </g>
          <path d={base.sphere} className="a-rim" />

          <g className="a-threads">
            {arcs.map((a) => (
              <path key={a.id} d={a.d} className="a-thread" style={{ strokeWidth: 1.1 / view.k }} />
            ))}
          </g>

          <g className="a-marks">
            {placed.map((g) => {
              const p = pos.get(g.key);
              if (!p) return null;
              const on = selected === g.key;
              const n = g.items.length;
              return (
                <g
                  key={g.key}
                  className={`a-mark${on ? ' on' : ''}`}
                  transform={`translate(${p[0].toFixed(2)} ${p[1].toFixed(2)})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${g.title}${g.country && g.country !== g.title ? ', ' + g.country : ''}: ${n} ${n === 1 ? 'memory' : 'memories'}`}
                  aria-pressed={on}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(on ? null : g.key);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(on ? null : g.key);
                    }
                  }}
                >
                  <circle r={r * 3.2} className="a-hit" />
                  <circle r={r * (1.6 + Math.min(n, 5) * 0.25)} className="a-halo" />
                  <circle r={r} className="a-dot" />
                  {(on || view.k > 2.2) && (
                    <text y={-r * 2.4} className="a-label" style={{ fontSize: 11 / view.k }}>
                      {g.title}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </g>
      </svg>
      <div className="atlas-zoom">
        <button type="button" aria-label="Zoom in" onClick={() => zoomAt(1.6, { x: W / 2, y: H / 2 })}>
          +
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.6, { x: W / 2, y: H / 2 })}>
          −
        </button>
        <button type="button" className="reset" onClick={() => setView({ k: 1, x: 0, y: 0 })} disabled={view.k === 1}>
          Whole world
        </button>
      </div>
      <p className="atlas-credit">Natural Earth · place search by OpenStreetMap</p>
    </div>
  );
}
