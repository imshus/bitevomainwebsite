// Where the phone is now, shared by every screen (lib/location.js): looked up when the app opens (the menu asks
// for it) and again whenever someone taps "Use my current location".
// { status: 'idle' | 'locating' | 'ok' | 'error', lat, lng, accuracy, place, error, at }
import { useEffect, useState } from 'react';
import { currentPlace } from '../lib/location';

let here = { status: 'idle' };
let running = null;
const listeners = new Set();
const publish = next => { here = next; listeners.forEach(fn => fn(here)); };

export function locateHere() {
  if (running) return running;
  publish({ ...here, status: 'locating', error: null });
  running = currentPlace()
    .then(found => { publish({ status: 'ok', ...found, error: null, at: Date.now() }); return here; })
    .catch(err => { publish({ ...here, status: 'error', error: err }); return here; })
    .finally(() => { running = null; });
  return running;
}

export const getHere = () => here;

export function useHere() {
  const [value, setValue] = useState(here);
  useEffect(() => {
    listeners.add(setValue);
    setValue(here);
    return () => listeners.delete(setValue);
  }, []);
  return value;
}
