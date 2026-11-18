'use client';

import type { Kept } from './memory';
import { useStore } from './store';

/* ---------- what we keep ---------- */

export type Loc = {
  name: string; // landmark, venue, street, or simply the city
  neighborhood?: string;
  city?: string;
  region?: string;
  country?: string;
  lat?: number;
  lng?: number;
  source: 'manual' | 'search' | 'device';
  updatedAt: number;
};

/** A red thread. Exists only because the person made or approved it. */
export type Thread = {
  id: string;
  a: string; // memory id
  b: string;
  note?: string;
  origin: 'you' | 'suggested';
  createdAt: number;
};

export type PlacesStore = {
  v: 1;
  locations: Record<string, Loc>;
  threads: Thread[];
  dismissed: string[]; // suggestion keys the person declined
};

/** Where an earlier version kept places, in this browser only. Read once, to offer an import. */
export const LEGACY_PLACES_KEY = 'whatstayed:places:v1';

/** Shared, live view of places and threads across the garden and the atlas, backed by the server. */
export function usePlaces() {
  const [snap, store] = useStore();
  return {
    store: { v: 1 as const, locations: snap.locations, threads: snap.threads, dismissed: snap.dismissed },
    setLocation: store.setLocation,
    removeLocation: store.removeLocation,
    tie: store.tie,
    updateThread: store.updateThread,
    untie: store.untie,
    dismiss: store.dismiss,
  };
}

export const suggestionKey = (a: string, b: string) => [a, b].sort().join('~');

/* ---------- grouping memories into places ---------- */

const slug = (s?: string) =>
  (s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export type PlaceGroup = {
  key: string;
  title: string; // city, or the place's own name
  region?: string;
  country?: string;
  lat?: number;
  lng?: number;
  items: { memory: Kept; loc: Loc }[];
};

export function placeTitle(loc: Loc) {
  return loc.city || loc.name;
}

export function placeKey(loc: Loc) {
  return `${slug(placeTitle(loc))}${loc.country ? '--' + slug(loc.country) : ''}` || 'somewhere';
}

export function groupPlaces(memories: Kept[], locations: Record<string, Loc>): PlaceGroup[] {
  const by = new Map<string, PlaceGroup>();
  for (const m of memories) {
    const loc = locations[m.id];
    if (!loc) continue;
    const key = placeKey(loc);
    let g = by.get(key);
    if (!g) {
      g = { key, title: placeTitle(loc), region: loc.region, country: loc.country, items: [] };
      by.set(key, g);
    }
    g.items.push({ memory: m, loc });
  }
  for (const g of by.values()) {
    const pts = g.items.filter((i) => typeof i.loc.lat === 'number' && typeof i.loc.lng === 'number');
    if (pts.length) {
      g.lat = pts.reduce((s, i) => s + (i.loc.lat as number), 0) / pts.length;
      g.lng = pts.reduce((s, i) => s + (i.loc.lng as number), 0) / pts.length;
    }
  }
  return [...by.values()].sort((a, b) => b.items.length - a.items.length || a.title.localeCompare(b.title));
}

/* ---------- finding places (OpenStreetMap Nominatim, free, no key) ---------- */

const NOMINATIM = 'https://nominatim.openstreetmap.org';

type NominatimHit = {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  address?: Record<string, string>;
};

function toLoc(h: NominatimHit, source: Loc['source']): Loc {
  const a = h.address || {};
  const city = a.city || a.town || a.village || a.municipality || a.hamlet || a.county;
  const neighborhood = a.neighbourhood || a.suburb || a.quarter || a.city_district;
  const name = h.name || a.attraction || a.tourism || a.amenity || a.road || city || h.display_name.split(',')[0];
  return {
    name,
    neighborhood: neighborhood && neighborhood !== name ? neighborhood : undefined,
    city: city && city !== name ? city : city,
    region: a.state || a.province || a.region,
    country: a.country,
    lat: Number(h.lat),
    lng: Number(h.lon),
    source,
    updatedAt: Date.now(),
  };
}

export async function searchPlaces(q: string, signal?: AbortSignal): Promise<Loc[]> {
  const url = `${NOMINATIM}/search?format=jsonv2&addressdetails=1&limit=5&accept-language=en&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('search failed');
  const hits = (await r.json()) as NominatimHit[];
  return hits.map((h) => toLoc(h, 'search'));
}

export async function reversePlace(lat: number, lng: number): Promise<Loc> {
  const url = `${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&zoom=16&accept-language=en&lat=${lat}&lon=${lng}`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('reverse failed');
  const hit = (await r.json()) as NominatimHit;
  return { ...toLoc(hit, 'device'), lat, lng };
}

/** Ask the browser for the current position, once. Never watches. */
export function locateOnce(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('unavailable'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(e),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
    );
  });
}

export function locLine(loc: Loc) {
  const parts = [loc.name, loc.neighborhood, loc.city !== loc.name ? loc.city : undefined, loc.country].filter(Boolean);
  return [...new Set(parts)].join(', ');
}
