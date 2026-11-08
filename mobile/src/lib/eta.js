// The live arrival time on the order page: how long until the order is at the customer's door, worked out from
// where the delivery partner is now (the rider app's position), the kitchen and the delivery address.
//   · Before pickup: the ride to the kitchen, or the food still cooking if that takes longer, a minute to
//     collect it, then the ride from the kitchen to the door.
//   · Picked up: the ride from where the rider is to the door.
// Ride times are the OSRM road route's (/api/config `routing`), kept current between route fetches by how much
// nearer the rider has got since; without a route, the straight distance on city roads at an average speed.
// The same file is on the website (frontend/src/lib/eta.js): change both together.
import { useEffect, useRef, useState } from 'react';

const ROAD_FACTOR = 1.35; // roads are about this much longer than the straight line
const RIDE_KMH = 22; // average city riding speed, stops at lights included
const HANDOVER_MIN = 1; // collecting the order at the kitchen
const PREP_MIN = 12; // cooking time when /api/config has no prepMinutes
const SAME_PLACE_KM = 0.02;

// Straight-line distance in km.
export function distanceKm(a, b) {
  const rad = d => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const point = p => (p && p.lat != null && p.lng != null ? { lat: Number(p.lat), lng: Number(p.lng) } : null);

// A ride from `from` to `to`, in minutes and road km. `route` is an OSRM route to the same place, fetched when the
// rider was at route.from: its time and length are scaled by how much of that distance is still left.
export function ride(from, to, route) {
  if (!from || !to) return null;
  const left = distanceKm(from, to);
  if (route && distanceKm(route.to, to) < SAME_PLACE_KM) {
    const then = distanceKm(route.from, to);
    const share = then > SAME_PLACE_KM ? Math.min(1.5, left / then) : left > SAME_PLACE_KM ? null : 0;
    if (share != null) return { minutes: (route.seconds / 60) * share, km: route.metres / 1000 * share };
  }
  return { minutes: ((left * ROAD_FACTOR) / RIDE_KMH) * 60, km: left * ROAD_FACTOR };
}

// When the kitchen started cooking (the last time the order went to "preparing").
const cookingSince = order => [...(order.history || [])].reverse().find(h => h.status === 'preparing')?.at || null;

/**
 * The arrival time, or null when it can't be worked out (no live position, or no kitchen or address location).
 * { minutes, by (Date), leg: { minutes, km } (the ride the rider is on now: to the kitchen or to the door),
 *   cooking (minutes of cooking the rider waits for at the kitchen) }
 */
export function arrival({ order, kitchen, route, after, prepMinutes = PREP_MIN, now = Date.now() }) {
  const r = order?.rider;
  const rider = point(r?.position);
  const home = point(order?.address);
  kitchen = point(kitchen);
  if (!rider || !home || !r.leg || !['placed', 'preparing', 'out_for_delivery'].includes(order.status)) return null;
  const done = (total, leg, cooking = 0) => {
    const minutes = Math.max(1, Math.round(total));
    return {
      minutes,
      by: new Date(now + minutes * 60000),
      leg: { minutes: Math.max(1, Math.round(leg.minutes)), km: Math.round(leg.km * 10) / 10 },
      cooking: Math.round(cooking),
    };
  };
  if (r.leg === 'to_customer') {
    const leg = ride(rider, home, route);
    return done(leg.minutes, leg);
  }
  if (!kitchen) return null;
  const leg = ride(rider, kitchen, route);
  const onward = ride(kitchen, home, after);
  // The food: not started before the kitchen accepts the order; then cooking for about prepMinutes.
  const since = cookingSince(order);
  const cookingLeft = order.status === 'placed' ? prepMinutes
    : order.status === 'preparing' && since ? Math.max(0, prepMinutes - (now - Date.parse(since)) / 60000) : 0;
  const wait = Math.max(0, cookingLeft - leg.minutes);
  return done(leg.minutes + wait + HANDOVER_MIN + onward.minutes, leg, wait);
}

// The road route between two places: asked again only once `from` has moved 150 m or 45 s have passed (the
// public OSRM server is for light use). null while there's none, or while the one held goes somewhere else.
// { line: [[lat, lng], …], seconds, metres, from, to }
export function useRoute(base, from, to) {
  const [route, setRoute] = useState(null);
  const last = useRef(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!base || !from || !to) return;
    const prev = last.current;
    if (prev && distanceKm(prev.to, to) < SAME_PLACE_KM && Date.now() - prev.at < 45000 && distanceKm(prev.from, from) < 0.15) return;
    const ask = { at: Date.now(), from: point(from), to: point(to) };
    last.current = ask;
    fetch(`${base}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(d => {
        const r = d.routes?.[0];
        if (!r || !alive.current || last.current !== ask) return;
        setRoute({
          line: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
          seconds: r.duration,
          metres: r.distance,
          from: ask.from,
          to: ask.to,
        });
      })
      // No route (server down or busy): a straight line until the next try, 45 s or 150 m on.
      .catch(() => { if (alive.current && last.current === ask) setRoute(null); });
  }, [base, from?.lat, from?.lng, to?.lat, to?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return route && to && distanceKm(route.to, to) < SAME_PLACE_KM ? route : null;
}

/**
 * The order's live trip: { route (rider → where they're heading now, for the map), eta (see arrival), kitchen,
 * home, target }. config is /api/config (kitchen, routing, prepMinutes). Call it on every render of the order
 * page's rider part; it fetches routes only while the rider's position is known.
 */
export function useLiveTrip(order, config) {
  const r = order?.rider;
  const rider = point(r?.position);
  const home = point(order?.address);
  const kitchen = config?.kitchen ? { ...point(config.kitchen), name: config.kitchen.name } : null;
  const toKitchen = r?.leg === 'to_kitchen';
  const target = !rider ? null : toKitchen ? point(kitchen) : home;
  const route = useRoute(config?.routing, rider, target);
  // Kitchen → door, for the time after pickup; asked once while the rider is still on the way to the kitchen.
  const after = useRoute(config?.routing, rider && toKitchen ? point(kitchen) : null, rider && toKitchen ? home : null);
  const eta = arrival({ order, kitchen, route, after, prepMinutes: config?.prepMinutes ?? PREP_MIN });
  return { route, eta, kitchen, home, target };
}

