/** A soft confirmation when something is saved: a blossom opens over the garden. */
export function bloom(count = 1) {
  try {
    window.dispatchEvent(new CustomEvent('ws:bloom', { detail: { count } }));
    navigator.vibrate?.([8, 40, 12]);
  } catch {
    /* not supported */
  }
}
