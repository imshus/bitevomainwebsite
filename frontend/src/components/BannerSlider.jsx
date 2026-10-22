import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from './Icons.jsx';
import { prefersReducedMotion } from '../lib/motion.js';

// Offer banners at the top of the menu. Visitors can swipe or scroll sideways (scroll-snap lines each
// banner up), or use the arrows and dots. It moves on by itself every few seconds, pausing while the
// pointer or keyboard focus is on it, and stays still for visitors who ask for reduced motion.
// Images live in public/assets/banners: a 1600×600 JPG plus 800, 1200 and 1600 wide WebP copies. The first banner is
// the biggest thing on the menu's first screen, so the page asks for it straight away (FIRST_BANNER in
// vite.config.js) and ahead of other images; the rest wait until they're nearly in view.
const BANNERS = [
  {
    file: 'offer-first-order',
    alt: 'First order? Get a free cold coffee on orders above ₹99, plus free delivery.',
  },
  {
    file: 'offer-rewards',
    alt: 'Order more, save more: ₹20 signup bonus, ₹20 cashback on delivery and ₹100 referral cashback in wallet coins, free delivery on your first 3 orders, a free cold coffee on orders of ₹99+ and a ₹1 store item on orders of ₹399+.',
  },
];

const INTERVAL = 5000;

export default function BannerSlider() {
  const track = useRef(null);
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const goTo = i => {
    const el = track.current;
    const n = (i + BANNERS.length) % BANNERS.length;
    el.scrollTo({ left: n * el.clientWidth, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  // The dots follow wherever the strip has been scrolled or swiped to.
  const onScroll = () => {
    const el = track.current;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  };

  // Restarts after every change of banner, so a swipe gets a full interval before the next move.
  useEffect(() => {
    if (hovered || focused || prefersReducedMotion()) return;
    const timer = setInterval(() => { if (!document.hidden) goTo(active + 1); }, INTERVAL);
    return () => clearInterval(timer);
  }, [active, hovered, focused]);

  return (
    <section
      className="banners"
      aria-roledescription="carousel"
      aria-label="Offers"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={e => { if (e.target.matches(':focus-visible')) setFocused(true); }}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}
    >
      <div className="container">
        <div className="banners__frame">
          <div className="banners__track" ref={track} onScroll={onScroll}>
            {BANNERS.map((b, i) => (
              <div className="banners__slide" key={b.file} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${BANNERS.length}`}>
                <picture>
                  <source
                    type="image/webp"
                    srcSet={`/assets/banners/${b.file}-800.webp 800w, /assets/banners/${b.file}-1200.webp 1200w, /assets/banners/${b.file}-1600.webp 1600w`}
                    sizes="(max-width: 1172px) calc(100vw - 32px), 1140px"
                  />
                  <img
                    src={`/assets/banners/${b.file}.jpg`} alt={b.alt} width="1600" height="600" draggable="false"
                    {...(i === 0 ? { fetchpriority: 'high' } : { loading: 'lazy', decoding: 'async' })}
                  />
                </picture>
              </div>
            ))}
          </div>
          <button type="button" className="banners__arrow banners__arrow--prev" onClick={() => goTo(active - 1)} aria-label="Previous offer">
            <ChevronRight />
          </button>
          <button type="button" className="banners__arrow banners__arrow--next" onClick={() => goTo(active + 1)} aria-label="Next offer">
            <ChevronRight />
          </button>
        </div>
        <div className="banners__dots">
          {BANNERS.map((b, i) => (
            <button
              type="button"
              key={b.file}
              className={`banners__dot${i === active ? ' is-active' : ''}`}
              onClick={() => goTo(i)}
              aria-label={`Show offer ${i + 1}`}
              aria-current={i === active || undefined}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
