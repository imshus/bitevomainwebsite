// The order's live trip on a map (order page, while the order is on its way), laid out like a delivery
// app's tracking view: the rider (moving, with a cone pointing the way they're heading), the kitchen and the
// delivery address, the road route from the rider to the door, and a chip with the arrival time.
// The kitchen and home pins are the rider app's (bitevo-deliveryboy frontend/src/components/mapParts.js), so
// both apps show the same places the same way; the rider is the rider app's blue, with a bike.
// OpenStreetMap tiles through Leaflet (no Google key). The road route comes from the OSRM server in
// /api/config `routing` (a dashed straight line without one). The order page loads this file only for an
// order on its way (lazyLoad in OrderDetail.jsx).
import { useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useConfig } from '../state/menu.js';

const RED = '#B71C1C';
const STORE_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h16l-1.5-5h-13z"/><path d="M5 9v11h14V9"/><path d="M9 20v-5h6v5"/></svg>';
const HOME_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/></svg>';
const BIKE_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>';

// A drop-shaped pin, 36 × 44 px, its tip at (18, 42), as in the rider app.
const pin = (kind, svg) => L.divIcon({ className: 'map-icon', html: `<div class="pin pin--${kind}"><span>${svg}</span></div>`, iconSize: [36, 44], iconAnchor: [18, 42] });
const riderIcon = () => L.divIcon({
  className: 'map-icon',
  html: `<div class="rider-dot"><div class="rider-dot__cone"></div><div class="rider-dot__bike">${BIKE_SVG}</div></div>`,
  iconSize: [56, 56], iconAnchor: [28, 28],
});
const ll = p => [p.lat, p.lng];
const metres = (a, b) => L.latLng(ll(a)).distanceTo(L.latLng(ll(b)));

// The road route rider → door: asked again only once the rider has moved 150 m or 45 s have passed (the public
// OSRM server is for light use). null while there's none (then the map draws a straight line).
function useRoute(base, from, to) {
  const [route, setRoute] = useState(null);
  const last = useRef(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!base || !from || !to) return;
    const prev = last.current;
    if (prev && Date.now() - prev.at < 45000 && metres(prev.from, from) < 150) return;
    last.current = { at: Date.now(), from };
    fetch(`${base}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(d => {
        const r = d.routes?.[0];
        if (!r || !alive.current) return;
        setRoute({
          line: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
          minutes: Math.max(1, Math.round(r.duration / 60)),
          km: Math.round(r.distance / 100) / 10,
        });
      })
      .catch(() => { if (alive.current) { setRoute(null); last.current = null; } });
  }, [base, from?.lat, from?.lng, to?.lat, to?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return route;
}

/**
 * rider       { lat, lng, heading } the rider's live position
 * home        { lat, lng } the delivery address, or null when it has no location
 * leg         'to_kitchen' (before pickup: the route and chip are to the kitchen) or 'to_customer'
 * distanceKm  the straight distance from the API to where the rider is heading, for the chip without a road route
 */
export default function RiderMap({ rider, home, leg = 'to_customer', distanceKm }) {
  const { data: config } = useConfig();
  const kitchen = config?.kitchen || null;
  const toKitchen = leg === 'to_kitchen';
  const target = toKitchen ? kitchen : home; // where the rider is heading now
  const route = useRoute(config?.routing, rider, target);
  const box = useRef(null);
  const map = useRef(null);
  const layers = useRef({});
  const framed = useRef(false);

  // The rider and where they're heading (the door when the kitchen's position isn't known).
  const frame = () => {
    const m = map.current;
    if (!m) return;
    const points = [rider, target || home].filter(Boolean).map(ll);
    // Extra room at the top for the arrival chip, so it never covers a pin.
    if (points.length > 1) m.fitBounds(points, { paddingTopLeft: [44, 84], paddingBottomRight: [56, 44], maxZoom: 17 });
    else m.setView(points[0], 16);
  };

  useEffect(() => {
    const m = L.map(box.current, {
      // Start at the rider, so markers are drawn straight away (Leaflet waits for a first view to draw them).
      center: ll(rider), zoom: 15,
      zoomControl: false,
      scrollWheelZoom: false, // the page scrolls past it
      dragging: !L.Browser.mobile, // on phones one finger scrolls the page; pinch to zoom
    });
    m.attributionControl.setPrefix(false);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      className: 'rider-map__tiles',
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).addTo(m);
    map.current = m;
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(box.current);
    return () => { resize.disconnect(); m.remove(); map.current = null; layers.current = {}; framed.current = false; };
  }, []);

  // Adds, moves or removes one layer.
  const place = (key, wanted, create, update) => {
    const l = layers.current;
    if (!map.current) return;
    if (!wanted) { l[key]?.remove(); delete l[key]; } else if (!l[key]) l[key] = create().addTo(map.current); else update(l[key]);
  };

  useEffect(() => {
    place('kitchen', kitchen, () => L.marker(ll(kitchen), { icon: pin('kitchen', STORE_SVG), keyboard: false, zIndexOffset: 200 }).bindTooltip(kitchen.name || 'Kitchen'),
      mk => mk.setLatLng(ll(kitchen)));
  }, [kitchen?.lat, kitchen?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    place('home', home, () => L.marker(ll(home), { icon: pin('drop', HOME_SVG), keyboard: false, zIndexOffset: 300 }).bindTooltip('You'),
      mk => mk.setLatLng(ll(home)));
  }, [home?.lat, home?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // The way to the kitchen or the door: the road route, or a dashed straight line until there is one.
  useEffect(() => {
    // The road route runs between the nearest roads; join it to the rider's exact spot and the pin itself.
    const line = target ? (route?.line?.length > 1 ? [ll(rider), ...route.line, ll(target)] : [ll(rider), ll(target)]) : null;
    const style = { color: RED, weight: 5, opacity: 0.85, lineCap: 'round', dashArray: route ? null : '2 10', interactive: false };
    place('route', line, () => L.polyline(line, style), p => { p.setLatLngs(line); p.setStyle(style); });
  }, [route, rider.lat, rider.lng, target?.lat, target?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Picked up: the trip now ends at the door, so frame it again.
  useEffect(() => { if (framed.current) frame(); }, [leg]); // eslint-disable-line react-hooks/exhaustive-deps

  // The rider moves; the first time, frame rider and door, then only follow the rider at the edge, so the
  // customer's own zoom isn't undone every few seconds.
  useEffect(() => {
    place('rider', true, () => L.marker(ll(rider), { icon: riderIcon(), keyboard: false, zIndexOffset: 1000, interactive: false }), mk => mk.setLatLng(ll(rider)));
    const dot = layers.current.rider?.getElement()?.querySelector('.rider-dot');
    if (dot) {
      dot.classList.toggle('has-heading', rider.heading != null);
      dot.style.setProperty('--heading', `${rider.heading || 0}deg`);
    }
    if (!framed.current) { framed.current = true; frame(); }
    else if (!map.current.getBounds().pad(-0.15).contains(ll(rider))) map.current.panTo(ll(rider));
  }, [rider.lat, rider.lng, rider.heading]); // eslint-disable-line react-hooks/exhaustive-deps

  // The chip, as delivery apps show it: the time (or distance) big, what it's to small. The time is the road
  // route's estimate, so it says "about".
  const where = toKitchen ? 'to the kitchen' : 'to your door';
  const eta = toKitchen && distanceKm != null && distanceKm < 0.1 ? { big: 'At the kitchen' }
    : !toKitchen && distanceKm != null && distanceKm < 0.2 ? { big: 'Almost there' }
    : route ? { big: `~${route.minutes} min`, small: `${where} · ${route.km} km` }
    : distanceKm != null ? { big: `${distanceKm} km`, small: where }
    : { big: toKitchen ? 'Going to the kitchen' : 'On the way' };
  return (
    <div className="rider-map">
      <div className="rider-map__frame">
        <div ref={box} className="rider-map__map" role="img" aria-label={toKitchen ? 'Map with your delivery partner on the way to the kitchen' : 'Map with your delivery partner on the way to you'} />
        <p className="rider-map__eta" aria-live="polite"><b>{eta.big}</b>{eta.small && <span>{eta.small}</span>}</p>
        <button type="button" className="rider-map__recenter" onClick={frame} aria-label="Show the rider and your address">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="7.5" /></svg>
        </button>
      </div>
      <a className="rider-map__open" href={`https://www.google.com/maps/search/?api=1&query=${rider.lat},${rider.lng}`} target="_blank" rel="noreferrer">
        Open in Google Maps
      </a>
    </div>
  );
}
