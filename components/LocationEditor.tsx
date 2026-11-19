'use client';

import { useEffect, useRef, useState } from 'react';
import { locateOnce, locLine, reversePlace, searchPlaces, type Loc } from '@/lib/places';
import { useStore } from '@/lib/store';

type Props = {
  memory: { moment: string; place: string };
  current?: Loc;
  onSave: (loc: Loc) => void;
  onRemove?: () => void;
  onClose: () => void;
};

type Fields = { name: string; neighborhood: string; city: string; country: string };

export default function LocationEditor({ memory, current, onSave, onRemove, onClose }: Props) {
  const [snap] = useStore();
  const offerHere = snap.profile?.locationAsk !== 'never';
  const [f, setF] = useState<Fields>({
    name: current?.name && current.name !== current.city ? current.name : '',
    neighborhood: current?.neighborhood || '',
    city: current?.city || (current && !current.city ? '' : ''),
    country: current?.country || '',
  });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    current?.lat !== undefined && current?.lng !== undefined ? { lat: current.lat, lng: current.lng } : null,
  );
  const [region, setRegion] = useState(current?.region);
  const [source, setSource] = useState<Loc['source']>(current?.source || 'manual');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Loc[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [ask, setAsk] = useState(false);
  const [note, setNote] = useState('');
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // gentle, debounced search (OpenStreetMap asks for no more than one request a second)
  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) {
      setHits(null);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        setHits(await searchPlaces(term, ctl.signal));
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setHits([]);
      } finally {
        setSearching(false);
      }
    }, 650);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  function fill(loc: Loc) {
    const venue = loc.name && loc.name !== loc.city ? loc.name : '';
    setF({ name: venue, neighborhood: loc.neighborhood || '', city: loc.city || (venue ? '' : loc.name), country: loc.country || '' });
    setRegion(loc.region);
    setCoords(loc.lat !== undefined && loc.lng !== undefined ? { lat: loc.lat, lng: loc.lng } : null);
    setSource(loc.source);
    setHits(null);
    setQ('');
    setNote('');
  }

  async function shareOnce() {
    setAsk(false);
    setNote('Waiting for your browser…');
    try {
      const p = await locateOnce();
      try {
        fill(await reversePlace(p.lat, p.lng));
        setNote('Found where you are. Adjust anything below before saving.');
      } catch {
        setCoords(p);
        setSource('device');
        setNote('Got your position, but couldn’t name it. Add the city or place below.');
      }
    } catch (e) {
      const denied = (e as GeolocationPositionError)?.code === 1;
      setNote(denied ? 'Location wasn’t shared. You can type the place instead.' : 'Couldn’t find your location. You can type the place instead.');
    }
  }

  const has = f.name.trim() || f.city.trim() || f.country.trim() || f.neighborhood.trim();

  function save() {
    if (!has) {
      setNote('Add at least a city, a country or a place name.');
      return;
    }
    const city = f.city.trim() || undefined;
    onSave({
      name: f.name.trim() || f.neighborhood.trim() || city || f.country.trim(),
      neighborhood: f.neighborhood.trim() || undefined,
      city,
      region,
      country: f.country.trim() || undefined,
      lat: coords?.lat,
      lng: coords?.lng,
      source,
      updatedAt: Date.now(),
    });
  }

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF({ ...f, [k]: e.target.value });
    if (source !== 'manual' && (k === 'city' || k === 'country')) setSource('manual');
  };

  return (
    <div className="loc-veil" onClick={onClose}>
      <section className="loc-ed" role="dialog" aria-modal="true" aria-labelledby="locT" onClick={(e) => e.stopPropagation()}>
        <p className="loc-k">For “{memory.moment.length > 60 ? memory.moment.slice(0, 58) + '…' : memory.moment}”</p>
        <h2 id="locT" className="loc-t">Where was this?</h2>

        <div className="loc-search">
          <label htmlFor="locQ" className="sr">
            Search for a city, neighborhood or landmark
          </label>
          <input
            id="locQ"
            ref={first}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a city, neighborhood or landmark"
            autoComplete="off"
          />
          {!q && memory.place && !has && (
            <button type="button" className="loc-chip" onClick={() => setQ(memory.place)}>
              Search for “{memory.place}”
            </button>
          )}
          {searching && <p className="loc-note">Looking…</p>}
          {hits && !searching && (
            <ul className="loc-hits">
              {hits.length === 0 && <li className="loc-note">Nothing found. You can type it below instead.</li>}
              {hits.map((h, i) => (
                <li key={i}>
                  <button type="button" onClick={() => fill(h)}>
                    <b>{h.name}</b>
                    <span>{locLine({ ...h, name: '' }).replace(/^, /, '')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!offerHere ? null : !ask ? (
          <button type="button" className="quiet loc-here" onClick={() => setAsk(true)}>
            Use where I am now
          </button>
        ) : (
          <div className="loc-ask" role="group" aria-label="Share your location once">
            <p>Your browser will ask to share your location, just this once, to fill in this place. Nothing is tracked or kept running.</p>
            <button type="button" className="quiet" onClick={shareOnce}>
              Share once
            </button>
            <button type="button" className="quiet" onClick={() => setAsk(false)}>
              Not now
            </button>
          </div>
        )}

        <div className="loc-fields">
          <label>
            <span>Landmark or venue</span>
            <input value={f.name} onChange={set('name')} placeholder="The exact spot (optional)" />
          </label>
          <label>
            <span>Neighborhood</span>
            <input value={f.neighborhood} onChange={set('neighborhood')} placeholder="Neighbourhood" />
          </label>
          <label>
            <span>City</span>
            <input value={f.city} onChange={set('city')} placeholder="City" />
          </label>
          <label>
            <span>Country</span>
            <input value={f.country} onChange={set('country')} placeholder="Country" />
          </label>
        </div>

        <p className="loc-note" aria-live="polite">
          {note || (coords ? 'This place will appear on your map.' : has ? 'Choose a search result to put this on the map. You can also save it as written.' : '')}
        </p>

        <div className="loc-acts">
          {onRemove && (
            <button type="button" className="quiet danger" onClick={onRemove}>
              Remove this place
            </button>
          )}
          <span />
          <button type="button" className="quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="quiet strong" onClick={save}>
            Save place
          </button>
        </div>
        <p className="loc-credit">Place search by OpenStreetMap</p>
      </section>
    </div>
  );
}
