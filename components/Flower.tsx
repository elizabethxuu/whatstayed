/** The What Stayed mark: a periwinkle blossom, five notched petals around a pale heart. */
export default function Flower({ size = 28, className = '' }: { size?: number; className?: string }) {
  const petal = 'M0 -1.2 C -4.2 -4.6 -5.6 -10.4 -3.1 -14.2 C -1.9 -15.9 -0.9 -15.2 0 -13.6 C 0.9 -15.2 1.9 -15.9 3.1 -14.2 C 5.6 -10.4 4.2 -4.6 0 -1.2 Z';
  return (
    <svg className={`flower ${className}`} width={size} height={size} viewBox="-18 -18 36 36" aria-hidden="true">
      <defs>
        <radialGradient id="flowerPetal" cx="50%" cy="85%" r="95%">
          <stop offset="0" stopColor="#dfe5ff" />
          <stop offset=".55" stopColor="#a8b6f4" />
          <stop offset="1" stopColor="#8796e8" />
        </radialGradient>
      </defs>
      {[0, 72, 144, 216, 288].map((r) => (
        <path key={r} d={petal} transform={`rotate(${r})`} fill="url(#flowerPetal)" stroke="#5f6fd0" strokeWidth=".9" strokeLinejoin="round" />
      ))}
      {[0, 72, 144, 216, 288].map((r) => (
        <path key={`v${r}`} d="M0 -2.4 L0 -8.6" transform={`rotate(${r})`} stroke="#6f7fdb" strokeWidth=".55" strokeLinecap="round" opacity=".7" />
      ))}
      <circle r="2.6" fill="#ffffff" stroke="#6f7fdb" strokeWidth=".7" />
      {[36, 108, 180, 252, 324].map((r) => (
        <circle key={`s${r}`} cx="0" cy="-4.4" r=".75" transform={`rotate(${r})`} fill="#5f6fd0" />
      ))}
    </svg>
  );
}
