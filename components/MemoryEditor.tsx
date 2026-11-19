'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import type { Memory } from '@/lib/memory';
import type { MemoryInput } from '@/lib/store';

type Props = {
  memory?: MemoryInput; // editing when given
  onSave: (m: MemoryInput) => Promise<unknown>;
  onClose: () => void;
};

const WEIGHTS: { v: Memory['weight']; label: string; hint: string }[] = [
  { v: 'light', label: 'White', hint: 'a white blossom' },
  { v: 'tender', label: 'Mist', hint: 'a pale grey heart' },
  { v: 'heavy', label: 'Marked', hint: 'a red heart' },
];

/** Plant a memory by hand, or tend one already on the tree. */
export default function MemoryEditor({ memory, onSave, onClose }: Props) {
  const [place, setPlace] = useState(memory?.place ?? '');
  const [when, setWhen] = useState(memory?.when ?? '');
  const [moment, setMoment] = useState(memory?.moment ?? '');
  const [feeling, setFeeling] = useState(memory?.feeling ?? '');
  const [title, setTitle] = useState(memory?.extra?.title ?? '');
  const [narrative, setNarrative] = useState(memory?.extra?.narrative ?? '');
  const [date, setDate] = useState(memory?.date ?? '');
  const [weight, setWeight] = useState<Memory['weight']>(memory?.weight ?? 'tender');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!place.trim()) next.place = 'Add a place.';
    if (moment.trim().length < 2) next.moment = 'Add a short description.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    const ok = await onSave({
      place: place.trim(),
      when: when.trim() || undefined,
      moment: moment.trim(),
      feeling: feeling.trim(),
      weight,
      date: date || undefined,
      title: title.trim() || undefined,
      narrative: narrative.trim() || undefined,
      echoes: memory?.echoes,
      because: memory?.because,
    });
    setBusy(false);
    if (ok) onClose();
  }

  const clear = (k: string) => errors[k] && setErrors((e) => ({ ...e, [k]: '' }));
  const field = (id: string) => ({
    'aria-invalid': errors[id] ? true : undefined,
    'aria-describedby': errors[id] ? `${id}-err` : undefined,
  });

  return (
    <div className="loc-veil" onClick={() => !busy && onClose()}>
      <form className="loc-ed mem-ed" role="dialog" aria-modal="true" aria-labelledby="memT" onClick={(e) => e.stopPropagation()} onSubmit={submit} noValidate>
        <p className="loc-k">{memory ? 'Edit' : 'New'}</p>
        <h2 id="memT" className="loc-t">{memory ? 'Memory' : 'Plant a memory'}</h2>

        <div className="loc-fields mem-fields">
          <label className="wide">
            <span>Title (optional)</span>
            <input maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The night market" />
          </label>
          <label className="wide">
            <span>Moment</span>
            <textarea
              id="moment"
              rows={3}
              maxLength={600}
              value={moment}
              onChange={(e) => { setMoment(e.target.value); clear('moment'); }}
              placeholder="Steam rising off the dumplings at the night market"
              required
              {...field('moment')}
            />
            {errors.moment && <em id="moment-err" className="field-err">{errors.moment}</em>}
          </label>
          <label className="wide">
            <span>More, in your own words (optional)</span>
            <textarea rows={2} maxLength={2000} value={narrative} onChange={(e) => setNarrative(e.target.value)} />
          </label>
          <label>
            <span>Where</span>
            <input ref={first} id="place" maxLength={80} value={place} onChange={(e) => { setPlace(e.target.value); clear('place'); }} placeholder="Taipei" required {...field('place')} />
            {errors.place && <em id="place-err" className="field-err">{errors.place}</em>}
          </label>
          <label>
            <span>When (optional)</span>
            <input maxLength={60} value={when} onChange={(e) => setWhen(e.target.value)} placeholder="Summer 2019" />
          </label>
          <label>
            <span>On a day (optional)</span>
            <input type="date" value={date} max="9999-12-31" onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            <span>In a word (optional)</span>
            <input id="feeling" maxLength={40} value={feeling} onChange={(e) => setFeeling(e.target.value)} placeholder="Calm" />
            {errors.feeling && <em id="feeling-err" className="field-err">{errors.feeling}</em>}
          </label>
          <fieldset className="mem-weight">
            <legend>Blossom</legend>
            {WEIGHTS.map((w) => (
              <label key={w.v} className={weight === w.v ? 'on' : ''} title={w.hint}>
                <input type="radio" name="weight" value={w.v} checked={weight === w.v} onChange={() => setWeight(w.v)} />
                <i className={`w-${w.v}`} aria-hidden="true" />
                {w.label}
              </label>
            ))}
          </fieldset>
        </div>

        <div className="loc-acts">
          <span />
          <button type="button" className="quiet" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="quiet strong" disabled={busy}>
            {busy ? 'Saving…' : memory ? 'Save' : 'Plant'}
          </button>
        </div>
      </form>
    </div>
  );
}
