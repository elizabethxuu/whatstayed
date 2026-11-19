/** The What Stayed mark: a forget-me-not blossom, five notched petals around a pale heart, drawn in ink. */
export default function Flower({ size = 28, className = '' }: { size?: number; className?: string }) {
  const petal = 'M0 -1.2 C -4.2 -4.6 -5.6 -10.4 -3.1 -14.2 C -1.9 -15.9 -0.9 -15.2 0 -13.6 C 0.9 -15.2 1.9 -15.9 3.1 -14.2 C 5.6 -10.4 4.2 -4.6 0 -1.2 Z';
  return (
    <svg className={`flower ${className}`} width={size} height={size} viewBox="-18 -18 36 36" aria-hidden="true">
      {[0, 72, 144, 216, 288].map((r) => (
        <path key={r} className="fl-petal" d={petal} transform={`rotate(${r})`} />
      ))}
      {[0, 72, 144, 216, 288].map((r) => (
        <path key={`v${r}`} className="fl-vein" d="M0 -2.4 L0 -8.6" transform={`rotate(${r})`} strokeWidth=".55" strokeLinecap="round" />
      ))}
      <circle className="fl-heart" r="2.8" />
      <circle className="fl-eye" r="1.1" />
    </svg>
  );
}
