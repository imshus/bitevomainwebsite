// Where the visitor wants their food delivered, shown at the top of the menu. It's either one of a
// signed-in customer's saved addresses ({ addressId }) or a map pin ({ place }); kept in this browser.
import { useSyncExternalStore } from 'react';
import { addressLine } from '../lib/format.js';

const KEY = 'bitevo_location';
const listeners = new Set();

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
}
let current = read();

export function setDeliveryLocation(location) {
  current = location;
  try {
    if (location) localStorage.setItem(KEY, JSON.stringify(location));
    else localStorage.removeItem(KEY);
  } catch { /* private mode: keep it for this visit only */ }
  listeners.forEach(fn => fn());
}

const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const useDeliveryLocation = () => useSyncExternalStore(subscribe, () => current);

export const locationFromAddress = a => ({ addressId: a._id, lat: a.lat ?? null, lng: a.lng ?? null });
export const locationFromPlace = place => ({ place });

// Title and one-line address for the menu bar. Saved addresses are looked up fresh, so edits show.
export function describeLocation(location, addresses = []) {
  const saved = location?.addressId && addresses.find(a => a._id === location.addressId);
  const address = saved || (!location?.place && addresses[0]);
  if (address) return { title: address.area || address.label, subtitle: addressLine(address), addressId: address._id };
  const p = location?.place;
  if (p) return { title: p.area || p.name || p.city || 'Pinned location', subtitle: p.formatted, place: p };
  return null;
}
