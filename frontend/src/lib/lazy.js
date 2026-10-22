// Code the menu doesn't need on its first view (other pages, the sign-in and location sheets) is built into
// separate files that are fetched when first used. lazyLoad() gives a React.lazy component with a preload()
// that fetches its file early, so it is usually already here by the time someone taps through.
import { Component, Suspense, createElement, lazy } from 'react';

export function lazyLoad(load) {
  let promise = null;
  // A failed early fetch (e.g. a dropped connection) isn't remembered, so the next attempt tries again.
  const preload = () => (promise ||= load().catch(err => { promise = null; throw err; }));
  const Part = lazy(preload);
  Part.preload = preload;
  return Part;
}

// Runs `task` a little after the page has loaded, at a quiet moment: not while the first screen is still
// being drawn (fetching another page's files also brings its styles, and new styles make the browser redo
// the layout).
export function whenIdle(task) {
  const idle = () => (window.requestIdleCallback ? requestIdleCallback(task, { timeout: 5000 }) : task());
  const later = () => setTimeout(idle, 2500);
  if (document.readyState === 'complete') later();
  else window.addEventListener('load', later, { once: true });
}

// After a new version of the site goes live, a page left open still asks for the old files, which are gone.
// Reload once to pick up the new version (but not over and over, if the files are missing for another reason).
export function reloadOnStaleFiles() {
  window.addEventListener('vite:preloadError', event => {
    try {
      const last = Number(sessionStorage.getItem('bitevo:reloaded-at')) || 0;
      if (Date.now() - last < 30000) return;
      sessionStorage.setItem('bitevo:reloaded-at', String(Date.now()));
    } catch {
      return;
    }
    event.preventDefault();
    window.location.reload();
  });
}

// Holds a sheet whose file is fetched on first use (sign-in, choose location): nothing shows while the file
// is on its way, and if it can't be fetched the rest of the page keeps working and `onError` is told.
export class LazyPart extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { this.props.onError?.(error); }
  render() { return this.state.failed ? null : createElement(Suspense, { fallback: null }, this.props.children); }
}

export const CANT_OPEN = 'That didn’t open. Check your internet connection and reload the page.';
