// A short confetti burst from the middle of its container (CSS-only; nothing shows with reduced motion).
import { useMemo } from 'react';

const COLORS = ['#B71C1C', '#E53935', '#F5A623', '#3E9B32', '#FFD54F', '#FF8A65'];

export default function Confetti({ pieces = 28 }) {
  const bits = useMemo(() => Array.from({ length: pieces }, (_, i) => {
    const angle = (i / pieces) * Math.PI * 2 + Math.random() * 0.4;
    const distance = 70 + Math.random() * 90;
    return {
      x: Math.round(Math.cos(angle) * distance),
      y: Math.round(Math.sin(angle) * distance * 0.8 - 40),
      r: Math.round(Math.random() * 540 - 270),
      color: COLORS[i % COLORS.length],
      delay: Math.round(Math.random() * 120),
      round: i % 3 === 0,
    };
  }), [pieces]);

  return (
    <span className="confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <i
          key={i}
          className={b.round ? 'is-round' : undefined}
          style={{ '--x': `${b.x}px`, '--y': `${b.y}px`, '--r': `${b.r}deg`, '--c': b.color, animationDelay: `${b.delay}ms` }}
        />
      ))}
    </span>
  );
}
