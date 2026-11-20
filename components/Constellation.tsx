'use client';

import Link from 'next/link';
import { CSSProperties, useEffect, useMemo, useState } from 'react';
import Masthead from './Masthead';
import { mediaFor, mediaUrl, useStore, type Stored } from '@/lib/store';
import { placeTitle } from '@/lib/places';

const W = 1000;
const H = 760;
type Edge = { a: string; b: string; kind: 'thread' | 'person' | 'trip' | 'collection'; label: string };

/**
 * The archive as a night sky. Each memory is a point of light, gathered around the place it happened.
 * Lines are drawn only where a real relationship is stored: a red thread, a person in both, the same trip,
 * the same collection. Nothing here is decorative data.
 */
export default function Constellation() {
  const [snap] = useStore();
  const [sel, setSel] = useState<string | null>(null);
  // on a phone the whole sky is small: stars and names grow so they can be read and tapped
  const [z, setZ] = useState(1);
  useEffect(() => {
    const q = matchMedia('(max-width: 760px)');
    const on = () => setZ(q.matches ? 1.9 : 1);
    on();
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  const [show, setShow] = useState<Record<Edge['kind'], boolean>>({ thread: true, person: true, trip: true, collection: true });

  const { stars, clusters, edges } = useMemo(() => {
    const placeOf = (m: Stored) => (snap.locations[m.id]?.city || m.place).trim() || 'Somewhere';
    const groups = new Map<string, Stored[]>();
    [...snap.memories].sort((a, b) => a.createdAt - b.createdAt).forEach((m) => groups.set(placeOf(m), [...(groups.get(placeOf(m)) ?? []), m]));
    const names = [...groups.keys()].sort((a, b) => groups.get(b)!.length - groups.get(a)!.length);
    // places on a golden-angle spiral: the most-visited at the centre
    const golden = Math.PI * (3 - Math.sqrt(5));
    const pos = new Map<string, { x: number; y: number }>();
    const clusters: { name: string; x: number; y: number; r: number; n: number }[] = [];
    names.forEach((name, k) => {
      const rad = k === 0 ? 0 : 120 + Math.sqrt(k) * 105;
      const a = k * golden - Math.PI / 2;
      const cx = W / 2 + Math.cos(a) * rad * 1.25;
      const cy = H / 2 + Math.sin(a) * rad * 0.82;
      const ms = groups.get(name)!;
      const r = ms.length === 1 ? 0 : 26 + Math.sqrt(ms.length) * 16;
      clusters.push({ name, x: cx, y: cy, r, n: ms.length });
      ms.forEach((m, i) => {
        const t = (i / Math.max(1, ms.length)) * Math.PI * 2 + k;
        const ring = ms.length === 1 ? 0 : r * (0.55 + 0.45 * ((i * 7) % 5) / 4);
        pos.set(m.id, { x: Math.max(30, Math.min(W - 30, cx + Math.cos(t) * ring)), y: Math.max(30, Math.min(H - 30, cy + Math.sin(t) * ring)) });
      });
    });

    const edges: Edge[] = [];
    const have = new Set<string>();
    const add = (a: string, b: string, kind: Edge['kind'], label: string) => {
      if (a === b || !pos.has(a) || !pos.has(b)) return;
      const k = [a, b].sort().join('|') + kind;
      if (have.has(k)) return;
      have.add(k);
      edges.push({ a, b, kind, label });
    };
    for (const t of snap.threads) add(t.a, t.b, 'thread', t.note || 'Tied by a red thread');
    const byPerson = new Map<string, string[]>();
    snap.links.filter((l) => l.kind === 'memory-person').forEach((l) => byPerson.set(l.b, [...(byPerson.get(l.b) ?? []), l.a]));
    for (const [pid, ids] of byPerson) {
      const name = snap.people.find((p) => p.id === pid)?.name ?? 'someone';
      for (let i = 1; i < ids.length; i++) add(ids[i - 1], ids[i], 'person', `Both with ${name}`);
    }
    const byTrip = new Map<string, string[]>();
    snap.memories.forEach((m) => m.extra?.trip?.title && byTrip.set(m.extra.trip.title, [...(byTrip.get(m.extra.trip.title) ?? []), m.id]));
    for (const [title, ids] of byTrip) for (let i = 1; i < ids.length; i++) add(ids[i - 1], ids[i], 'trip', `The same trip: ${title}`);
    const byCol = new Map<string, string[]>();
    snap.collectionItems.filter((i) => i.kind === 'memory').forEach((i) => byCol.set(i.collectionId, [...(byCol.get(i.collectionId) ?? []), i.id]));
    for (const [cid, ids] of byCol) {
      const name = snap.collections.find((c) => c.id === cid)?.name ?? 'a collection';
      for (let i = 1; i < ids.length; i++) add(ids[i - 1], ids[i], 'collection', `In “${name}”`);
    }
    const stars = snap.memories.map((m) => ({ m, ...pos.get(m.id)! }));
    return { stars, clusters, edges };
  }, [snap]);

  const chosen = sel ? snap.memories.find((m) => m.id === sel) : null;
  const near = chosen ? edges.filter((e) => e.a === chosen.id || e.b === chosen.id) : [];
  const nearIds = new Set(near.flatMap((e) => [e.a, e.b]));
  const at = (id: string) => stars.find((s) => s.m.id === id)!;
  const photo = chosen ? mediaFor(snap, 'memory', chosen.id).find((x) => x.kind === 'photo') : undefined;
  const people = chosen ? snap.links.filter((l) => l.kind === 'memory-person' && l.a === chosen.id).map((l) => snap.people.find((p) => p.id === l.b)?.name).filter(Boolean) : [];
  const KIND: Record<Edge['kind'], string> = { thread: 'Red threads', person: 'Shared people', trip: 'Same trip', collection: 'Same collection' };

  return (
    <main className="constellation">
      <Masthead room="constellation" />
      <header className="arc-head">
        <h1 className="arc-title">Constellation</h1>
        <p className="arc-sub">Your memories, gathered by place. A line appears only where something really connects them.</p>
      </header>

      {snap.memories.length === 0 ? (
        <p className="quiet-note">The sky fills as your garden grows.</p>
      ) : (
        <>
          <p className="cn-legend" role="group" aria-label="Show connections">
            {(Object.keys(KIND) as Edge['kind'][]).map((k) => (
              <button key={k} type="button" className="cn-key" aria-pressed={show[k]} onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))}>
                <i className={`k-${k}`} aria-hidden="true" />
                {KIND[k]} <span>{edges.filter((e) => e.kind === k).length}</span>
              </button>
            ))}
          </p>
          <div className="cn-sky">
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${snap.memories.length} memories in ${clusters.length} ${clusters.length === 1 ? 'place' : 'places'}, with ${edges.length} connections`}>
              <defs>
                <radialGradient id="cnStar">
                  <stop offset="0" stopColor="#ffffff" />
                  <stop offset=".35" stopColor="#cfe0ff" />
                  <stop offset="1" stopColor="#7fa6ff" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="cnNeb">
                  <stop offset="0" stopColor="#7fa6ff" stopOpacity=".16" />
                  <stop offset="1" stopColor="#7fa6ff" stopOpacity="0" />
                </radialGradient>
              </defs>
              {clusters.map((c) => (
                <g key={c.name} className="cn-cluster">
                  <circle cx={c.x} cy={c.y} r={Math.max(46, c.r * 1.7)} fill="url(#cnNeb)" />
                  <text x={c.x} y={c.y + Math.max(40, c.r + 26) * (z > 1 ? 1.3 : 1)} textAnchor="middle" style={{ fontSize: 11 * z }}>
                    {c.name}
                  </text>
                </g>
              ))}
              {edges
                .filter((e) => show[e.kind])
                .map((e) => {
                  const A = at(e.a);
                  const B = at(e.b);
                  const mx = (A.x + B.x) / 2;
                  const my = (A.y + B.y) / 2 - Math.hypot(B.x - A.x, B.y - A.y) * 0.12;
                  const on = chosen ? e.a === chosen.id || e.b === chosen.id : false;
                  return <path key={e.a + e.b + e.kind} className={`cn-edge e-${e.kind}${on ? ' on' : ''}${chosen && !on ? ' dim' : ''}`} d={`M${A.x} ${A.y} Q${mx} ${my} ${B.x} ${B.y}`} />;
                })}
              {stars.map(({ m, x, y }, i) => {
                const isSel = sel === m.id;
                const dim = chosen && !isSel && !nearIds.has(m.id);
                return (
                  <g
                    key={m.id}
                    className={`cn-star${isSel ? ' sel' : ''}${dim ? ' dim' : ''}`}
                    transform={`translate(${x} ${y})`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${m.place}: ${m.extra?.title || m.moment}`}
                    aria-pressed={isSel}
                    onClick={() => setSel(isSel ? null : m.id)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSel(isSel ? null : m.id))}
                    style={{ '--d': `${(i % 7) * 0.6}s` } as CSSProperties}
                  >
                    <circle r={16 * z} className="cn-hit" />
                    <circle r={(m.weight === 'heavy' ? 13 : 10) * z} fill="url(#cnStar)" className="cn-glow" />
                    <circle r={(m.weight === 'heavy' ? 2.8 : 2.1) * z} className="cn-core" />
                  </g>
                );
              })}
            </svg>
          </div>

          {chosen && (
            <aside className="cn-story" aria-live="polite">
              {photo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(photo.id)} alt="" />
              )}
              <p className="mem-place">{snap.locations[chosen.id] ? placeTitle(snap.locations[chosen.id]) : chosen.place}{chosen.when || chosen.date ? ` · ${chosen.when || chosen.date}` : ''}</p>
              <p className="cn-title">{chosen.extra?.title || chosen.moment}</p>
              {chosen.extra?.title && <p className="cn-moment">{chosen.moment}</p>}
              {people.length > 0 && <p className="cn-with">With {people.join(', ')}</p>}
              {near.length > 0 && (
                <ul className="cn-links">
                  {near.map((e) => {
                    const other = snap.memories.find((m) => m.id === (e.a === chosen.id ? e.b : e.a));
                    return (
                      <li key={e.a + e.b + e.kind}>
                        <button type="button" onClick={() => other && setSel(other.id)}>
                          <i className={`k-${e.kind}`} aria-hidden="true" />
                          {e.label}: <em>{other?.extra?.title || other?.moment}</em>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="cn-acts">
                <Link className="quiet strong" href={`/memory/${chosen.id}`}>
                  Open the memory
                </Link>
                <Link className="quiet" href={`/?m=${encodeURIComponent(chosen.id)}`}>
                  Find it on the willow
                </Link>
                <button type="button" className="quiet" onClick={() => setSel(null)}>
                  Close
                </button>
              </p>
            </aside>
          )}
        </>
      )}
    </main>
  );
}
