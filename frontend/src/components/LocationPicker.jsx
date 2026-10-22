// Picking a delivery location: search for a place (or use GPS), then fine-tune the pin on a map.
// <PlaceSearch> and <PinMap> are also used inside the address form; <LocationPicker> is the menu's
// "Delivering to" sheet, which also lists the customer's saved addresses.
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../state/auth.jsx';
import { useConfig, loadConfig } from '../state/menu.js';
import { setDeliveryLocation, locationFromAddress, locationFromPlace } from '../state/location.js';
import { loadGoogleMaps, currentPosition, newSession } from '../lib/googleMaps.js';
import { addressLine } from '../lib/format.js';
import Modal from './Modal.jsx';
import { Search, Close, MapPin, Navigation, Crosshair, ChevronRight } from './Icons.jsx';

const outOfRange = check => `We don’t deliver here yet. This spot is ${check.distanceKm} km from our kitchen, and we deliver up to ${check.radiusKm} km away.`;

export function PlaceSearch({ title, saved = [], onPick, onPickSaved }) {
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
    if (q.length < 2) { setResults([]); setSearching(false); return; }
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
    }, 280);
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
      const { lat, lng } = await currentPosition();
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
          type="search" value={query} onChange={e => setQuery(e.target.value)} autoFocus
          placeholder="Search for area, street or building" aria-label="Search for your location"
          enterKeyHint="search" autoComplete="off"
        />
        {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><Close /></button>}
      </label>

      <button type="button" className="place-row place-row--gps" onClick={useGps} disabled={Boolean(busy)}>
        <span className="place-row__icon"><Crosshair /></span>
        <span className="place-row__text">
          <b>{busy === 'gps' ? 'Finding your location…' : 'Use my current location'}</b>
          <span>Using your phone’s GPS</span>
        </span>
        <ChevronRight />
      </button>

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
      ) : saved.length > 0 && onPickSaved && (
        <div className="place-list">
          <h3 className="place-list__title">Saved addresses</h3>
          {saved.map(a => (
            <button type="button" key={a._id} className="place-row" onClick={() => onPickSaved(a)} disabled={Boolean(busy)}>
              <span className="place-row__icon"><MapPin /></span>
              <span className="place-row__text"><b>{a.label}</b><span>{addressLine(a)}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// A map with a pin fixed in the middle: the customer drags the map until the pin sits on their door.
export function PinMap({ start, confirmLabel = 'Confirm location', onConfirm, onBack }) {
  const box = useRef(null);
  const map = useRef(null);
  const looked = useRef({ lat: start.lat, lng: start.lng });
  const seq = useRef(0);
  const [place, setPlace] = useState(start);
  const [moving, setMoving] = useState(false);
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState('');
  const [mapFailed, setMapFailed] = useState(false);
  const [locating, setLocating] = useState(false);
  const [stale, setStale] = useState(false); // the last pin lookup failed, so the address shown is out of date

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

  useEffect(() => {
    let live = true;
    const listeners = [];
    const failed = () => live && setMapFailed(true);
    window.addEventListener('bitevo:maps-auth-failed', failed);
    loadConfig()
      .then(cfg => loadGoogleMaps(cfg.maps.browserKey))
      .then(gm => gm.importLibrary('maps'))
      .then(({ Map }) => {
        if (!live) return;
        const m = new Map(box.current, {
          center: { lat: start.lat, lng: start.lng }, zoom: 17,
          disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy', clickableIcons: false,
        });
        map.current = m;
        listeners.push(m.addListener('center_changed', () => setMoving(true)));
        // Once the map settles, look up the address under the pin if it moved more than a few metres.
        listeners.push(m.addListener('idle', () => {
          setMoving(false);
          const c = m.getCenter();
          const moved = Math.abs(c.lat() - looked.current.lat) + Math.abs(c.lng() - looked.current.lng) > 0.00004;
          if (moved) lookupRef.current(c.lat(), c.lng());
        }));
      })
      .catch(failed);
    return () => {
      live = false;
      window.removeEventListener('bitevo:maps-auth-failed', failed);
      listeners.forEach(l => l.remove());
    };
  }, []);

  const locate = async () => {
    setLocating(true);
    setError('');
    try {
      const p = await currentPosition();
      if (map.current) { map.current.panTo(p); map.current.setZoom(18); } else lookup(p.lat, p.lng);
    } catch (err) {
      setError(err.message);
    } finally {
      setLocating(false);
    }
  };

  const busy = moving || finding;
  const blocked = !place.check?.deliverable;
  return (
    <div className="pin-map">
      <div className={`pin-map__frame${mapFailed ? ' is-failed' : ''}`}>
        <div ref={box} className="pin-map__map" />
        {mapFailed ? (
          <p className="pin-map__fallback">The map couldn’t load, but we found this address. You can still confirm it below.</p>
        ) : (
          <>
            <div className={`pin-map__pin${moving ? ' is-lifted' : ''}`} aria-hidden="true">
              <span className="pin-map__tip">{moving ? 'Release to set the pin' : 'Your order will be delivered here'}</span>
              <svg viewBox="0 0 40 52"><path d="M20 0C9 0 0 8.7 0 19.5 0 33.4 20 52 20 52s20-18.6 20-32.5C40 8.7 31 0 20 0Z" /><circle cx="20" cy="19" r="7.5" /></svg>
            </div>
            <span className="pin-map__dot" aria-hidden="true" />
            <button type="button" className="pin-map__locate" onClick={locate} disabled={locating} aria-label="Go to my current location">
              <Navigation />
            </button>
          </>
        )}
      </div>

      <div className="pin-card">
        <p className="pin-card__hint">{mapFailed ? 'Delivery location' : 'Drag the map to move the pin to your door'}</p>
        <div className="pin-card__place">
          <span className="pin-card__icon"><MapPin /></span>
          <span className="pin-card__text" aria-live="polite">
            <b>{finding ? 'Finding address…' : place.area || place.name || place.city || 'Pinned location'}</b>
            <span>{finding ? ' ' : place.formatted}</span>
          </span>
          {onBack && <button type="button" className="link" onClick={onBack}>Change</button>}
        </div>
        {blocked && !finding && <p className="pin-card__warn" role="alert">{outOfRange(place.check)}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="button" className="btn btn--red btn--block" disabled={busy || blocked || stale} onClick={() => onConfirm(place)}>
          {busy ? 'Finding address…' : confirmLabel}
        </button>
      </div>
    </div>
  );
}

// The menu's "Delivering to" sheet. Without a Maps key it can still switch between saved addresses.
// "Add a new address" is always offered; someone who isn't signed in signs in first.
export default function LocationPicker({ onClose, onAddAddress }) {
  const { customer, requireLogin } = useAuth();
  const { data: config } = useConfig();
  const [place, setPlace] = useState(null);
  const saved = customer?.addresses || [];
  const choose = location => { setDeliveryLocation(location); onClose(); };

  const addAddress = async () => {
    if (customer?.name) { onAddAddress(); return; }
    onClose();
    if (await requireLogin('Sign in to save your delivery address.')) onAddAddress();
  };
  const addButton = onAddAddress && (
    <button type="button" className="btn btn--outline btn--block place-add" onClick={addAddress}>+ Add a new address</button>
  );

  return (
    <Modal onClose={onClose} label="Choose delivery location" className={`location-sheet${place ? ' location-sheet--map' : ''}`}>
      {place ? (
        <PinMap start={place} onBack={() => setPlace(null)} onConfirm={p => choose(locationFromPlace(p))} />
      ) : !config ? (
        <div className="place-search"><h2>Choose delivery location</h2><p className="muted">Loading…</p></div>
      ) : config.maps ? (
        <>
          <PlaceSearch title="Choose delivery location" saved={saved} onPick={setPlace} onPickSaved={a => choose(locationFromAddress(a))} />
          {addButton}
        </>
      ) : (
        <div className="place-search">
          <h2>Choose delivery location</h2>
          {saved.length ? (
            <div className="place-list">
              {saved.map(a => (
                <button type="button" key={a._id} className="place-row" onClick={() => choose(locationFromAddress(a))}>
                  <span className="place-row__icon"><MapPin /></span>
                  <span className="place-row__text"><b>{a.label}</b><span>{addressLine(a)}</span></span>
                </button>
              ))}
            </div>
          ) : <p className="muted">Add your delivery address so we know where to bring your food.</p>}
          {addButton}
        </div>
      )}
    </Modal>
  );
}
