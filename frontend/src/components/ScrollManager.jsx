import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const REVEAL = '.section__head, .dish:not(.dish--order), .why__text, .feature, .step, .cta__card, .contact-card, .faq details, .form, .story__collage, .story__text, .mv__card, .mosaic__item';

export default function ScrollManager() {
  const { pathname, hash } = useLocation();
  const lastPath = useRef(pathname);

  // New page: start at the top, or at the #section in the link.
  useEffect(() => {
    const el = hash && document.getElementById(hash.slice(1));
    if (el) el.scrollIntoView();
    else if (lastPath.current !== pathname) window.scrollTo({ top: 0, behavior: 'instant' });
    lastPath.current = pathname;
  }, [pathname, hash]);

  // Fade sections in as they scroll into view. (Menu cards load later and animate on their own.)
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
      });
    }, { threshold: 0.15 });
    const targets = [...document.querySelectorAll(REVEAL)];
    targets.forEach((el, i) => {
      el.classList.add('reveal');
      el.style.transitionDelay = `${(i % 4) * 80}ms`;
      io.observe(el);
    });
    return () => io.disconnect();
  }, [pathname]);

  return null;
}
