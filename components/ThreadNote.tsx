'use client';

import { FormEvent, useState } from 'react';

/** Say (or change) why two memories are tied. Inline, quiet. */
export default function ThreadNote({ note, onSave, label }: { note?: string; onSave: (n: string) => Promise<unknown>; label: string }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(note ?? '');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await onSave(v);
    setBusy(false);
    if (ok) setOpen(false);
  }

  if (!open)
    return (
      <button type="button" className="untie" onClick={() => { setV(note ?? ''); setOpen(true); }} aria-label={`${note ? 'Change' : 'Add'} why it’s tied: ${label}`}>
        {note ? 'why' : 'add why'}
      </button>
    );
  return (
    <form className="thread-note" onSubmit={submit}>
      <label>
        <span className="sr">What connects them</span>
        <input autoFocus value={v} maxLength={80} placeholder="Why they belong together" onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false))} />
      </label>
      <button type="submit" className="untie" disabled={busy}>save</button>
      <button type="button" className="untie" onClick={() => setOpen(false)}>cancel</button>
    </form>
  );
}
