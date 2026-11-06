// The delivery partner's live position on a small map (order page, while the order is on its way), with the
// delivery address. The rider's marker moves each time the page refreshes the order. OpenStreetMap tiles
// through Leaflet, so it needs no Google Maps key. The order page loads this file only when there's a
// position to show (lazyLoad in OrderDetail.jsx).
import { useEffect, useRef } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const BIKE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="17" r="3.5"/><circle cx="18.5" cy="17" r="3.5"/><path d="M5.5 17 9 9h5l4.5 8M14 9l-2-4h-2M9 9l3 8"/></svg>';
const HOME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/></svg>';
const icon = (kind, svg) => L.divIcon({ className: `map-pin map-pin--${kind}`, html: svg, iconSize: [36, 36], iconAnchor: [18, 18] });

export default function RiderMap({ rider, home }) {
  const box = useRef(null);
  const map = useRef(null);
  const riderMark = useRef(null);
  const framed = useRef(false);

  useEffect(() => {
    const m = L.map(box.current, {
      zoomControl: true,
      scrollWheelZoom: false, // the page scrolls past it
      dragging: !L.Browser.mobile, // on phones one finger scrolls the page; the + / − buttons zoom
    });
    m.attributionControl.setPrefix(false);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).addTo(m);
    map.current = m;
    return () => { m.remove(); map.current = null; riderMark.current = null; framed.current = false; };
  }, []);

  useEffect(() => {
    if (!map.current || !home) return undefined;
    const mark = L.marker([home.lat, home.lng], { icon: icon('home', HOME), title: 'Delivery address', keyboard: false }).addTo(map.current);
    return () => mark.remove();
  }, [home?.lat, home?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // The rider moves; the first time, show the rider and the address together, then only follow the rider
  // when they reach the edge, so a customer's own zoom isn't undone every few seconds.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const at = [rider.lat, rider.lng];
    if (riderMark.current) riderMark.current.setLatLng(at);
    else riderMark.current = L.marker(at, { icon: icon('rider', BIKE), title: 'Delivery partner', keyboard: false, zIndexOffset: 500 }).addTo(m);
    if (!framed.current) {
      framed.current = true;
      if (home) m.fitBounds(L.latLngBounds([at, [home.lat, home.lng]]), { padding: [40, 40], maxZoom: 17 });
      else m.setView(at, 16);
    } else if (!m.getBounds().pad(-0.15).contains(at)) {
      m.panTo(at);
    }
  }, [rider.lat, rider.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rider-map">
      <div ref={box} className="rider-map__map" role="img" aria-label="Map with your delivery partner and your address" />
      <a className="rider-map__open" href={`https://www.google.com/maps/search/?api=1&query=${rider.lat},${rider.lng}`} target="_blank" rel="noreferrer">
        Open in Google Maps
      </a>
    </div>
  );
}
