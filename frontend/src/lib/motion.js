// Small motion helpers. Everything here is skipped when the visitor asks for reduced motion.

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Restarts a one-shot CSS animation class on an element (e.g. the cart icon's bump).
export function replay(el, className) {
  if (!el) return;
  el.classList.remove(className);
  void el.offsetWidth; // reflow, so the animation starts again
  el.classList.add(className);
}

// A copy of the dish photo flies in an arc into the cart (the floating cart bar if it's showing,
// otherwise the header's bag icon), which then gives a little bump.
export function flyToCart(fromImg) {
  const target = document.querySelector('.cart-bar') || document.querySelector('.nav__cart');
  if (!target) return;
  if (!fromImg || prefersReducedMotion()) { replay(target, 'is-bump'); return; }

  const a = fromImg.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const size = Math.min(a.width, a.height, 110);
  const startX = a.left + a.width / 2;
  const startY = a.top + a.height / 2;
  const dx = b.left + b.width / 2 - startX;
  const dy = b.top + b.height / 2 - startY;

  const ghost = document.createElement('img');
  ghost.src = fromImg.currentSrc || fromImg.src;
  ghost.alt = '';
  ghost.className = 'fly-ghost';
  Object.assign(ghost.style, { left: `${startX - size / 2}px`, top: `${startY - size / 2}px`, width: `${size}px`, height: `${size}px` });
  document.body.appendChild(ghost);

  const lift = Math.min(120, Math.abs(dy) * 0.4 + 40);
  const flight = ghost.animate([
    { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
    { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - lift}px) scale(.62) rotate(-12deg)`, opacity: 1, offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px) scale(.16) rotate(8deg)`, opacity: 0.4 },
  ], { duration: 720, easing: 'cubic-bezier(.45, 0, .25, 1)' });
  flight.onfinish = () => { ghost.remove(); replay(target, 'is-bump'); };
  flight.oncancel = () => ghost.remove();
}
