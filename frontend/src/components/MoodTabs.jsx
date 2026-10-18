// "Har Mood Ka Perfect Bite": the headline artwork and the five menu tabs under it, as in the design.
// Each tab's outline is drawn for its actual size (so the rounded, leaning shape stays right on any
// screen): the selected tab is a raised red trapezoid, the others cream cards leaning to the right,
// all standing on one red strip.
import { forwardRef, useId, useLayoutEffect, useRef, useState } from 'react';
import { TABS } from '../lib/menuTabs.js';

// A closed outline through `points` with each corner rounded by its radius (clamped to fit).
function roundedPath(points, radii) {
  const n = points.length;
  const unit = (a, b) => { const dx = b[0] - a[0]; const dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l, l]; };
  const f = v => Math.round(v * 10) / 10;
  let d = '';
  points.forEach((p, i) => {
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    const [ax, ay, al] = unit(p, prev);
    const [bx, by, bl] = unit(p, next);
    const r = Math.min(radii[i], al / 2, bl / 2);
    const a = [p[0] + ax * r, p[1] + ay * r];
    const b = [p[0] + bx * r, p[1] + by * r];
    d += `${i ? 'L' : 'M'}${f(a[0])} ${f(a[1])}Q${f(p[0])} ${f(p[1])} ${f(b[0])} ${f(b[1])}`;
  });
  return `${d}Z`;
}

function TabShape({ active }) {
  const svg = useRef(null);
  const id = useId().replace(/:/g, '');
  const [size, setSize] = useState(null);

  useLayoutEffect(() => {
    const box = svg.current.parentElement;
    const measure = () => setSize({ w: box.offsetWidth, h: box.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  let d = '';
  let stroke = 2;
  if (size) {
    const { w, h } = size;
    stroke = Math.max(2, h * 0.02);
    const i = stroke / 2;
    // Every shape stays inside its own slot, so neighbouring tabs never touch or overlap.
    const gap = Math.max(3, w * 0.02);
    if (active) {
      // Raised: wider at the bottom, the full height of the row.
      const top = w * 0.1;
      d = roundedPath(
        [[gap + i, h], [gap + top + i, i], [w - gap - top - i, i], [w - gap - i, h]],
        [0, h * 0.24, h * 0.24, 0],
      );
    } else {
      // A cream card a little lower than the selected tab, leaning right (its bottom sits further right).
      const y0 = h * 0.1;
      const lean = Math.min((h - y0) * 0.18, w * 0.12);
      d = roundedPath(
        [[gap + lean + i, h - i], [gap + i, y0 + i], [w - gap - lean - i, y0 + i], [w - gap - i, h - i]],
        [h * 0.1, h * 0.36, h * 0.3, h * 0.1],
      );
    }
  }

  return (
    <svg ref={svg} className="mood-tab__shape" width={size?.w || 0} height={size?.h || 0} aria-hidden="true">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          {active ? (
            <>
              <stop offset="0" stopColor="#F5131A" />
              <stop offset=".42" stopColor="#DD0A12" />
              <stop offset=".8" stopColor="#A1090F" />
              <stop offset="1" stopColor="#7C0609" />
            </>
          ) : (
            <>
              <stop offset="0" stopColor="#FFF9F2" />
              <stop offset="1" stopColor="#FDF0E5" />
            </>
          )}
        </linearGradient>
      </defs>
      {d && <path d={d} fill={`url(#g${id})`} stroke={active ? '#FF9DA2' : '#E5161E'} strokeWidth={active ? stroke * 1.35 : stroke} strokeLinejoin="round" />}
    </svg>
  );
}

const GridIcon = () => (
  <svg viewBox="0 0 48 48" className="mood-tab__grid" aria-hidden="true">
    <rect x="3" y="3" width="19" height="19" rx="4.5" /><rect x="26" y="3" width="19" height="19" rx="4.5" />
    <rect x="3" y="26" width="19" height="19" rx="4.5" /><rect x="26" y="26" width="19" height="19" rx="4.5" />
  </svg>
);

// The three little strokes either side of each picture.
const Burst = ({ side }) => (
  <svg viewBox="0 0 14 30" className={`mood-tab__burst mood-tab__burst--${side}`} aria-hidden="true">
    <path d="M2 4.5 12 9M1 15h11M2 25.5 12 21" />
  </svg>
);

const MoodTabs = forwardRef(function MoodTabs({ active, onChoose }, ref) {
  return (
    <section className="mood" aria-label="Menu sections">
      <picture className="mood__art">
        <img
          src="/assets/menu/mood-1917.webp" srcSet="/assets/menu/mood-960.webp 960w, /assets/menu/mood-1917.webp 1917w" sizes="100vw"
          alt="Har mood ka perfect bite" width="1917" height="280"
        />
      </picture>
      <div className="mood__tabs" ref={ref} role="group" aria-label="Menu tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            className={`mood-tab mood-tab--${t.key}${active === t.key ? ' is-active' : ''}`}
            aria-pressed={active === t.key}
            onClick={() => onChoose(t.key)}
          >
            <TabShape active={active === t.key} />
            <span className="mood-tab__art">
              <Burst side="left" />
              {t.icon ? <img src={t.icon} alt="" /> : <GridIcon />}
              <Burst side="right" />
            </span>
            <span className="mood-tab__label">{t.label}</span>
          </button>
        ))}
        <span className="mood__strip" aria-hidden="true" />
      </div>
    </section>
  );
});

export default MoodTabs;
