// Picking a delivery location, the way delivery apps do it: a "Select location" screen (search, use my current
// location, add a new address, saved addresses), then a map with a pin fixed in the middle that the customer
// moves to their door. <PlaceSearch> and <PinMap> are also the address form's first two steps;
// <LocationPicker> is the menu's "Delivering to" sheet.
// The map is Google's when the API has a Google key, else OpenStreetMap through Leaflet (no key needed). Search
// and the address under the pin work either way (backend/src/routes/places.js).
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../state/auth.jsx';
import { useConfig, loadConfig } from '../state/menu.js';
import { setDeliveryLocation, locationFromAddress, locationFromPlace, useDeliveryLocation } from '../state/location.js';
import { loadGoogleMaps, currentPosition, newSession } from '../lib/googleMaps.js';
import { addressLine } from '../lib/format.js';
import { deliversTo } from '../lib/deliveryArea.js';
import Modal from './Modal.jsx';
import { Search, Close, MapPin, Navigation, Crosshair, ChevronRight } from './Icons.jsx';

const Plus = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
const Pencil = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4" /></svg>;

/**
 * The "Select location" screen.
 * onPick(place)      a search result or the current location: the map opens there
 * saved, onPickSaved the customer's saved addresses (and choosing one)
 * selectedId         the saved address in use now ("Selected")
 * onAddNew           "Add new address"; onEdit(address) its edit button
 */
export function PlaceSearch({ title = 'Select location', saved = [], selectedId, onPick, onPickSaved, onAddNew, onEdit }) {
  const { data: config } = useConfig();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(''); // place id being opened, or 'gps'
  const [error, setError] = useState('');
  const session = useRef(newSession());
  const seq = useRef(0);

  // Suggestions follow the typing, a moment after it pauses; late answers are ignored.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { seq.current++; setResults([]); setSearching(false); return; }
    setSearching(true);
    const n = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const found = await api.searchPlaces(q, session.current);
        if (n === seq.current) { setResults(found); setError(''); }
      } catch (err) {
        if (n === seq.current) setError(err.message);
      } finally {
        if (n === seq.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const open = async s => {
    setBusy(s.placeId);
    setError('');
    try {
      const place = await api.place(s.placeId, session.current);
      session.current = newSession();
      onPick(place);
    } catch (err) {
      setError(err.message);
      setBusy('');
    }
  };

  const useGps = async () => {
    setBusy('gps');
    setError('');
    try {
      const { lat, lng } = await currentPosition({ fallback: 'You can search for your area instead.', fresh: true });
      onPick(await api.placeAt(lat, lng));
    } catch (err) {
      setError(err.message);
      setBusy('');
    }
  };

  const q = query.trim();
  return (
    <div className="place-search">
      <h2>{title}</h2>
      <label className="place-search__box">
        <Search />
        <input
          type="search" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search for area, street or building" aria-label="Search for your address"
          enterKeyHint="search" autoComplete="off"
        />
        {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><Close /></button>}
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}

      {q.length >= 2 ? (
        <div className="place-list" aria-live="polite" aria-busy={searching}>
          {results.map(s => (
            <button type="button" key={s.placeId} className="place-row" onClick={() => open(s)} disabled={Boolean(busy)}>
              <span className="place-row__icon"><MapPin /></span>
              <span className="place-row__text">
                <b>{s.main}</b>
                <span>{busy === s.placeId ? 'Opening…' : s.secondary}</span>
              </span>
              {s.distanceKm != null && <small className="place-row__km">{s.distanceKm} km</small>}
            </button>
          ))}
          {!searching && !results.length && !error && <p className="place-list__empty">No places found. Try a nearby landmark or your area name.</p>}
          {searching && !results.length && <p className="place-list__empty">Searching…</p>}
        </div>
      ) : (
        <>
          <div className="place-card">
            <div className="place-row place-row--gps">
              <span className="place-row__icon"><Crosshair /></span>
              <span className="place-row__text">
                <b>Use my current location</b>
                <span>{busy === 'gps' ? 'Finding your location…' : 'Enable your current location for better services'}</span>
              </span>
              <button type="button" className="place-row__enable" onClick={useGps} disabled={Boolean(busy)}>{busy === 'gps' ? '…' : 'Enable'}</button>
            </div>
            {onAddNew && (
              <button type="button" className="place-row place-row--add" onClick={onAddNew} disabled={Boolean(busy)}>
                <span className="place-row__icon"><Plus /></span>
                <span className="place-row__text"><b>Add new address</b></span>
                <ChevronRight />
              </button>
            )}
          </div>

          {saved.length > 0 && onPickSaved && (
            <div className="place-list">
              <h3 className="place-list__title">Saved addresses</h3>
              {saved.map(a => (
                <div key={a._id} className={`place-row place-row--saved${a._id === selectedId ? ' is-selected' : ''}`}>
                  <button type="button" className="place-row__main" onClick={() => onPickSaved(a)} disabled={Boolean(busy)}>
                    <span className="place-row__icon"><MapPin /></span>
                    <span className="place-row__text">
                      <b>{a.label}{a._id === selectedId && <em className="place-row__badge">Selected</em>}</b>
                      <span>{addressLine(a)}</span>
                      {a.receiverName && <small>{a.receiverName}, {a.receiverPhone}</small>}
                      {!deliversTo(a, config) && <small className="place-row__off">Service unavailable here</small>}
                    </span>
                  </button>
                  {onEdit && <button type="button" className="place-row__edit" onClick={() => onEdit(a)} aria-label={`Edit ${a.label} address`}><Pencil /></button>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Why a spot is outside the delivery area, from the server's check ("We deliver only to …").
const unavailableReason = check => (check.message || `This spot is ${check.distanceKm} km from our kitchen, and we deliver up to ${check.radiusKm} km away.`)
  .replace(/^Service unavailable at this location[.:]\s*/, '').replace(/^./, c => c.toUpperCase());

/**
 * A map with a pin fixed in the middle: the customer drags the map until the pin sits on their door, and the
 * address under it is looked up when the map stops. A spot outside the delivery area says "We are not
 * serviceable at this location" and can only be confirmed with `anywhere` (the menu's location).
 * onSearch shows a search bar over the map that goes back to the search screen.
 */
export function PinMap({ start, confirmLabel = 'Confirm location', onConfirm, onBack, onSearch, anywhere = false }) {
  const box = useRef(null);
  const view = useRef(null); // { panTo(p) } for the map in use
  const looked = useRef({ lat: start.lat, lng: start.lng });
  const seq = useRef(0);
  const [place, setPlace] = useState(start);
  const [moving, setMoving] = useState(false);
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState('');
  const [mapFailed, setMapFailed] = useState(false);
  const [locating, setLocating] = useState(false);
  const [stale, setStale] = useState(false); // the last lookup failed, so the address shown is out of date

  const lookup = async (lat, lng) => {
    looked.current = { lat, lng };
    const n = ++seq.current;
    setFinding(true);
    setError('');
    try {
      const found = await api.placeAt(lat, lng);
      if (n === seq.current) { setPlace(found); setStale(false); }
    } catch (err) {
      if (n === seq.current) { setError(err.message); setStale(true); }
    } finally {
      if (n === seq.current) setFinding(false);
    }
  };
  const lookupRef = useRef(lookup);
  lookupRef.current = lookup;
  // Once the map stops, look up the address under the pin if it moved more than a few metres.
  const settled = (lat, lng) => {
    setMoving(false);
    if (Math.abs(lat - looked.current.lat) + Math.abs(lng - looked.current.lng) > 0.00004) lookupRef.current(lat, lng);
  };

  useEffect(() => {
    let live = true;
    let cleanup = () => {};
    const failed = () => live && setMapFailed(true);
    window.addEventListener('bitevo:maps-auth-failed', failed);
    (async () => {
      const cfg = await loadConfig();
      if (cfg.maps?.browserKey) {
        const gm = await loadGoogleMaps(cfg.maps.browserKey);
        const { Map } = await gm.importLibrary('maps');
        if (!live) return;
        const m = new Map(box.current, {
          center: { lat: start.lat, lng: start.lng }, zoom: 17,
          disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy', clickableIcons: false,
        });
        const listeners = [
          m.addListener('center_changed', () => setMoving(true)),
          m.addListener('idle', () => { const c = m.getCenter(); settled(c.lat(), c.lng()); }),
        ];
        view.current = { panTo: p => { m.panTo(p); m.setZoom(18); } };
        cleanup = () => listeners.forEach(l => l.remove());
      } else {
        // No Google key: OpenStreetMap tiles through Leaflet, fetched only when a map opens.
        const [L] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]);
        if (!live) return;
        const m = L.map(box.current, { center: [start.lat, start.lng], zoom: 17, zoomControl: false });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
        }).addTo(m);
        m.attributionControl.setPrefix(false);
        m.on('movestart', () => setMoving(true));
        m.on('moveend', () => { const c = m.getCenter(); settled(c.lat, c.lng); });
        view.current = { panTo: p => m.setView([p.lat, p.lng], Math.max(m.getZoom(), 18)) };
        // The sheet slides in and resizes, and Leaflet only measures its box when told to.
        const resized = new ResizeObserver(() => m.invalidateSize({ pan: false }));
        resized.observe(box.current);
        cleanup = () => { resized.disconnect(); m.remove(); };
      }
      // A point without its address yet: look it up straight away.
      if (!start.formatted) lookupRef.current(start.lat, start.lng);
    })().catch(failed);
    return () => {
      live = false;
      window.removeEventListener('bitevo:maps-auth-failed', failed);
      cleanup();
      view.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const locate = async () => {
    setLocating(true);
    setError('');
    try {
      const { lat, lng } = await currentPosition({ fresh: true });
      if (view.current) view.current.panTo({ lat, lng }); else lookup(lat, lng);
    } catch (err) {
      setError(err.message);
    } finally {
      setLocating(false);
    }
  };

  const busy = moving || finding;
  const outside = place.check?.deliverable === false;
  const blocked = outside && !anywhere;
  return (
    <div className="pin-map">
      <div className={`pin-map__frame${mapFailed ? ' is-failed' : ''}`}>
        <div ref={box} className="pin-map__map" />
        {onSearch && !mapFailed && (
          <button type="button" className="pin-map__search" onClick={onSearch}><Search /><span>Search for apartment, street name…</span></button>
        )}
        {mapFailed ? (
          <p className="pin-map__fallback">The map couldn’t load, but we found this address. You can still confirm it below.</p>
        ) : (
          <>
            <div className={`pin-map__pin${moving ? ' is-lifted' : ''}`} aria-hidden="true">
              <span className="pin-map__tip">{moving ? 'Release to set the pin' : <><b>Order will be delivered here</b><small>Place the pin at your exact location</small></>}</span>
              <svg viewBox="0 0 40 52"><path d="M20 0C9 0 0 8.7 0 19.5 0 33.4 20 52 20 52s20-18.6 20-32.5C40 8.7 31 0 20 0Z" /><circle cx="20" cy="19" r="7.5" /></svg>
            </div>
            <span className="pin-map__dot" aria-hidden="true" />
            <button type="button" className="pin-map__locate" onClick={locate} disabled={locating} aria-label="Go to my current location">
              <Navigation />
            </button>
          </>
        )}
      </div>

      {outside && !finding && !moving && (
        <p className="pin-map__off" role="alert">We are not serviceable at this location. Please select a different location.<small>{unavailableReason(place.check)}</small></p>
      )}
      <div className="pin-card">
        <div className="pin-card__place">
          <span className="pin-card__icon"><MapPin /></span>
          <span className="pin-card__text" aria-live="polite">
            <b>{finding ? 'Finding address…' : place.area || place.name || place.city || 'Pinned location'}</b>
            <span>{finding ? ' ' : place.formatted}</span>
          </span>
          {onBack && <button type="button" className="link" onClick={onBack}>Change</button>}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="button" className="btn btn--red btn--block" disabled={busy || blocked || stale} onClick={() => onConfirm(place)}>
          {busy ? 'Finding address…' : confirmLabel}
        </button>
      </div>
    </div>
  );
}

// The menu's "Delivering to" sheet: the Select location screen, then the map for a searched place or the current
// location. "Add new address" and editing sign in first when needed; onAddAddress(address?) opens the form.
export default function LocationPicker({ onClose, onAddAddress }) {
  const { customer, requireLogin } = useAuth();
  const location = useDeliveryLocation();
  const [place, setPlace] = useState(null);
  const saved = customer?.addresses || [];
  const choose = picked => { setDeliveryLocation(picked); onClose(); };

  const addAddress = async () => {
    if (customer?.name) { onAddAddress(); return; }
    onClose();
    if (await requireLogin('Sign in to save your delivery address.')) onAddAddress();
  };

  return (
    <Modal onClose={onClose} label="Select location" className={`location-sheet${place ? ' location-sheet--map' : ''}`}>
      {place ? (
        <PinMap start={place} anywhere onBack={() => setPlace(null)} onSearch={() => setPlace(null)} onConfirm={p => choose(locationFromPlace(p))} />
      ) : (
        <PlaceSearch
          saved={saved} selectedId={location?.addressId} onPick={setPlace}
          onPickSaved={a => choose(locationFromAddress(a))}
          onAddNew={onAddAddress && addAddress} onEdit={onAddAddress && (a => onAddAddress(a))}
        />
      )}
    </Modal>
  );
}
