// Add or edit a delivery address. It's saved as separate fields (see cleanAddress in
// backend/src/routes/account.js): the sector, picked from the delivery areas (the city is filled in), the
// house or flat, the building or street, and an optional landmark and pincode. Without Google Maps the
// customer can add their phone's GPS position ("I'm at this address now") so the rider reaches the door.
// With Maps they first find the place (search or GPS) and set the pin on a map; the sector, street and
// pincode are then filled in from it.
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../state/auth.jsx';
import { useConfig } from '../state/menu.js';
import Modal from './Modal.jsx';
import { PlaceSearch, PinMap } from './LocationPicker.jsx';
import { MapPin, Navigation } from './Icons.jsx';
import { currentPosition } from '../lib/googleMaps.js';
import { areaOf } from '../lib/deliveryArea.js';

const LABELS = ['Home', 'Work', 'Other'];

// A saved address's position: a map pin (it has the map's address) or the phone's GPS position.
const pinOf = a => (a?.lat != null
  ? { lat: a.lat, lng: a.lng, area: a.area, formatted: a.mapAddress || '', source: a.mapAddress ? 'map' : 'gps', check: { deliverable: true } }
  : null);
// A map place's building and street, for the "Building, society or street" box.
const streetLine = p => [...new Set([p.name, p.street].filter(Boolean))].join(', ').slice(0, 120);

// The form's fields for a saved address. Older addresses have two lines only ("Flat 302, Tower B" /
// "Sector 44, Gurugram"): the first is split at its first comma, and the sector is found in the text.
function fieldsOf(a, config) {
  const blank = { label: 'Home', house: '', building: '', area: '', city: '', landmark: '', pincode: '' };
  if (!a) return blank;
  const base = { ...blank, label: a.label || 'Home', landmark: a.landmark || '', pincode: a.pincode || '' };
  if (a.house) return { ...base, house: a.house, building: a.building || '', area: a.area || '', city: a.city || '' };
  const [first = '', ...rest] = (a.line1 || '').split(',');
  return { ...base, house: first.trim(), building: rest.join(',').trim(), area: areaOf(a, config, { anyCity: true }) };
}

export default function AddressForm({ address, startPlace, onClose, onSaved }) {
  const { setCustomer } = useAuth();
  const { data: config } = useConfig();
  const maps = Boolean(config?.maps);
  const rule = config?.delivery || null; // the delivery areas, e.g. Sector 40, 44 and 45 in Gurugram
  const [form, setForm] = useState(() => fieldsOf(address, config));
  const [pin, setPin] = useState(() => pinOf(address));
  const [step, setStep] = useState(() => (!maps || address?._id ? 'details' : startPlace ? 'map' : 'search'));
  const [pinStart, setPinStart] = useState(startPlace || null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }));

  // The site settings may arrive after the form opens: then find an older address's sector.
  useEffect(() => {
    if (!config || !address || address.house) return;
    const found = areaOf(address, config, { anyCity: true });
    if (found) setForm(f => (f.area ? f : { ...f, area: found }));
  }, [config]); // eslint-disable-line react-hooks/exhaustive-deps

  const pinned = p => {
    setPin({ ...p, source: 'map' });
    setForm(f => ({ ...f, building: f.building || streetLine(p), pincode: p.pincode || f.pincode, area: areaOf(p, config) || f.area }));
    setStep('details');
  };
  const movePin = () => {
    if (pin?.source === 'map') { setPinStart(pin); setStep('map'); } else setStep('search');
  };

  // "I'm at this address now": the phone's GPS position, so the rider's Navigate goes to the door.
  const addLocation = async () => {
    setLocating(true);
    setError('');
    try {
      setPin({ ...(await currentPosition({ fallback: 'You can still save the address without it.', fresh: true })), source: 'gps' });
    } catch (err) {
      setError(err.message);
    } finally {
      setLocating(false);
    }
  };

  const save = async e => {
    e.preventDefault();
    if (rule && !form.area) { setError('Pick your sector.'); return; }
    setBusy(true);
    setError('');
    const body = {
      label: form.label, house: form.house, building: form.building, area: form.area,
      ...(!rule && { city: form.city }),
      landmark: form.landmark, pincode: form.pincode,
      ...(pin && { lat: pin.lat, lng: pin.lng, ...(pin.source === 'map' && pin.formatted && { mapAddress: pin.formatted }) }),
    };
    try {
      const result = address?._id ? await api.updateAddress(address._id, body) : await api.addAddress(body);
      setCustomer(result.customer);
      onSaved?.(result.address);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const title = address?._id ? 'Edit address' : 'Add a delivery address';
  const mapPin = pin?.source === 'map';
  return (
    <Modal onClose={onClose} label={title} className={`address-sheet${step === 'details' ? '' : ' location-sheet'}${step === 'map' ? ' location-sheet--map' : ''}`}>
      {step === 'search' && (
        <PlaceSearch title="Where should we deliver?" onPick={p => { setPinStart(p); setStep('map'); }} />
      )}
      {step === 'map' && (
        <PinMap start={pinStart} confirmLabel="Confirm & add details" onConfirm={pinned} onBack={() => setStep('search')} />
      )}
      {step === 'details' && (
        <form className="stack" onSubmit={save}>
          <h2>{title}</h2>
          {mapPin ? (
            <div className="pin-card__place pin-card__place--boxed">
              <span className="pin-card__icon"><MapPin /></span>
              <span className="pin-card__text"><b>{pin.area || pin.name || 'Pinned location'}</b><span>{pin.formatted}</span></span>
              {maps
                ? <button type="button" className="link" onClick={movePin}>Change</button>
                : <button type="button" className="link" onClick={() => setPin(null)}>Remove</button>}
            </div>
          ) : maps && (
            <button type="button" className="link pin-add" onClick={movePin}><MapPin /> Pin this address on the map</button>
          )}

          <div className="chips" role="radiogroup" aria-label="Save as">
            {LABELS.map(l => (
              <button key={l} type="button" role="radio" aria-checked={form.label === l} className={`chip-btn${form.label === l ? ' is-active' : ''}`} onClick={() => setForm(f => ({ ...f, label: l }))}>{l}</button>
            ))}
          </div>

          {rule ? (
            <div className="field">
              <span id="address-sector">Sector <i>in {rule.city}</i></span>
              <div className="chips chips--fit" role="radiogroup" aria-labelledby="address-sector">
                {rule.areas.map(a => (
                  <button key={a} type="button" role="radio" aria-checked={form.area === a} className={`chip-btn${form.area === a ? ' is-active' : ''}`} onClick={() => setForm(f => ({ ...f, area: a }))}>{a}</button>
                ))}
              </div>
            </div>
          ) : (
            <div className="field-row">
              <label className="field">
                <span>Area / sector</span>
                <input value={form.area} onChange={set('area')} maxLength={60} required />
              </label>
              <label className="field">
                <span>City</span>
                <input value={form.city} onChange={set('city')} maxLength={60} autoComplete="address-level2" required />
              </label>
            </div>
          )}

          <label className="field">
            <span>House / flat no. &amp; floor</span>
            <input value={form.house} onChange={set('house')} autoComplete="address-line1" maxLength={60} required autoFocus={mapPin && !form.house} placeholder="e.g. Flat 302, 3rd floor" />
          </label>
          <label className="field">
            <span>Building, society or street</span>
            <input value={form.building} onChange={set('building')} autoComplete="address-line2" minLength={3} maxLength={120} required placeholder="e.g. Tower B, Palm Residency" />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Landmark <i>(optional)</i></span>
              <input value={form.landmark} onChange={set('landmark')} maxLength={80} />
            </label>
            <label className="field">
              <span>Pincode <i>(optional)</i></span>
              <input value={form.pincode} onChange={e => setForm(f => ({ ...f, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) }))} inputMode="numeric" autoComplete="postal-code" />
            </label>
          </div>

          {pin?.source === 'gps' ? (
            <div className="pin-card__place pin-card__place--boxed">
              <span className="pin-card__icon"><Navigation /></span>
              <span className="pin-card__text">
                <b>Your location is added</b>
                <span>The rider is taken to this spot{pin.accuracy ? ` (accurate to about ${pin.accuracy} m)` : ''}.</span>
              </span>
              <button type="button" className="link" onClick={() => setPin(null)}>Remove</button>
            </div>
          ) : !maps && !pin && (
            <div className="gps-add">
              <button type="button" className="link pin-add" onClick={addLocation} disabled={locating}>
                <Navigation /> {locating ? 'Finding your location…' : 'I’m at this address now: add my location'}
              </button>
              <small>Helps the rider reach your door. Only tap it while you’re at this address.</small>
            </div>
          )}

          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn--red btn--block" disabled={busy}>{busy ? 'Saving…' : 'Save address'}</button>
        </form>
      )}
    </Modal>
  );
}
