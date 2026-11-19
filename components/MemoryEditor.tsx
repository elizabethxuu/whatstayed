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
  { v: 'light', label: 'Light', hint: 'joyful, easy' },
  { v: 'tender', label: 'Tender', hint: 'warm, bittersweet' },
  { v: 'heavy', label: 'Heavy', hint: 'something that still aches' },
];

/** Plant a memory by hand, or tend one already on the tree. */
export default function MemoryEditor({ memory, onSave, onClose }: Props) {
  const [place, setPlace] = useState(memory?.place ?? '');
  const [when, setWhen] = useState(memory?.when ?? '');
  const [moment, setMoment] = useState(memory?.moment ?? '');
  const [feeling, setFeeling] = useState(memory?.feeling ?? '');
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
    if (!place.trim()) next.place = 'Where was it? A city, a kitchen, a train.';
    if (moment.trim().length < 2) next.moment = 'A line about the moment itself.';
    if (!feeling.trim()) next.feeling = 'One or two words for how it felt.';
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
        <p className="loc-k">{memory ? 'Tending a memory' : 'By hand'}</p>
        <h2 id="memT" className="loc-t">{memory ? 'What stayed' : 'Plant a memory'}</h2>

        <div className="loc-fields mem-fields">
          <label className="wide">
            <span>The moment</span>
            <textarea
              id="moment"
              rows={3}
              maxLength={600}
              value={moment}
              onChange={(e) => { setMoment(e.target.value); clear('moment'); }}
              placeholder="The steam rising off the dumplings, my sister laughing"
              required
              {...field('moment')}
            />
            {errors.moment && <em id="moment-err" className="field-err">{errors.moment}</em>}
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
            <span>How it felt</span>
            <input id="feeling" maxLength={40} value={feeling} onChange={(e) => { setFeeling(e.target.value); clear('feeling'); }} placeholder="Held" required {...field('feeling')} />
            {errors.feeling && <em id="feeling-err" className="field-err">{errors.feeling}</em>}
          </label>
          <fieldset className="mem-weight">
            <legend>Its weight</legend>
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
            {busy ? 'Saving…' : memory ? 'Save' : 'Plant it'}
          </button>
        </div>
      </form>
    </div>
  );
}
