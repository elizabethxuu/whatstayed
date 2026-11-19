import type { Snapshot } from './store';

export type Revisit =
  | { kind: 'memory'; id: string; years: number; label: string; text: string; sameDay: boolean }
  | { kind: 'entry'; id: string; years: number; label: string; text: string; sameDay: true }
  | { kind: 'milestone'; id: string; years: number; label: string; text: string; sameDay: true }
  | { kind: 'letter'; id: string; label: string; text: string };

const md = (d: Date) => `${d.getMonth() + 1}-${d.getDate()}`;
const local = (iso: string) => new Date(iso + 'T12:00:00');
const ago = (n: number) => (n === 1 ? 'A year ago today' : `${n} years ago today`);

/** What to bring back today: letters that have arrived, the same day in earlier years, and anniversaries. Nothing invented. */
export function revisits(snap: Snapshot, now = new Date()): Revisit[] {
  const out: Revisit[] = [];
  const today = md(now);
  const y = now.getFullYear();

  for (const l of snap.letters) if (!l.sealed && !l.openedAt) out.push({ kind: 'letter', id: l.id, label: 'A letter is ready', text: `You wrote it on ${new Date(l.writtenAt).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}.` });

  for (const m of snap.milestones) {
    const d = local(m.onDate);
    const n = y - d.getFullYear();
    if (n > 0 && md(d) === today) out.push({ kind: 'milestone', id: m.id, years: n, label: n === 1 ? 'One year since' : `${n} years since`, text: m.title, sameDay: true });
  }
  for (const m of snap.memories) {
    const d = m.date ? local(m.date) : null;
    if (!d) continue;
    const n = y - d.getFullYear();
    if (n > 0 && md(d) === today) out.push({ kind: 'memory', id: m.id, years: n, label: ago(n), text: `${m.place}: “${m.moment}”`, sameDay: true });
  }
  for (const e of snap.entries) {
    const d = new Date(e.createdAt);
    const n = y - d.getFullYear();
    if (n > 0 && md(d) === today) {
      const first = e.body.trim().split('\n')[0];
      out.push({ kind: 'entry', id: e.id, years: n, label: `${ago(n)}, you wrote`, text: `“${first.length > 80 ? first.slice(0, 78) + '…' : first}”`, sameDay: true });
    }
  }

  // Nothing on this exact day? Bring back one older memory, the same one all day.
  if (!out.some((r) => r.kind !== 'letter')) {
    const older = snap.memories.filter((m) => m.date && local(m.date).getTime() < now.getTime() - 365 * 864e5);
    if (older.length) {
      const seed = Math.floor(now.getTime() / 864e5);
      const m = older[seed % older.length];
      const d = local(m.date as string);
      out.push({ kind: 'memory', id: m.id, years: y - d.getFullYear(), label: `From ${d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`, text: `${m.place}: “${m.moment}”`, sameDay: false });
    }
  }
  return out;
}
