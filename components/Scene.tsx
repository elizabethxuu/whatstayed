/**
 * The garden at first light: a faint daytime moon, the willow, and a band of mist it rises out of,
 * with a still-pond reflection below. One component, used full-size in the Garden and smaller on Today.
 * The moon is drawn inside the willow's own picture, never in the header, so it can't sit behind the header's controls.
 */
export default function Scene({ size = 'full', children }: { size?: 'full' | 'small'; children: React.ReactNode }) {
  return (
    <div className={`scene scene-${size}`}>
      <div className="scene-tree">{children}</div>
      <span className="scene-mist" aria-hidden="true" />
    </div>
  );
}
