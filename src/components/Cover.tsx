/** Deterministic gradient cover art derived from a seed (no AI / network). */
function hashInt(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h;
}

export function Cover({
  seed,
  title,
  className = "",
}: {
  seed: string;
  title?: string;
  className?: string;
}) {
  const h = hashInt(seed);
  const a = h % 360;
  const b = (Math.floor(h / 360) % 360 + 40) % 360;
  return (
    <div
      className={`flex items-center justify-center text-white ${className}`}
      style={{ background: `linear-gradient(135deg, hsl(${a} 72% 56%), hsl(${b} 70% 42%))` }}
      aria-hidden="true"
      title={title}
    >
      <span className="drop-shadow text-2xl">🎵</span>
    </div>
  );
}
