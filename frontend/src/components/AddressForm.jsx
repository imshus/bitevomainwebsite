// Add or edit a delivery address. With Google Maps set up, the customer first finds the place (search
// or GPS) and sets the pin on a map, then adds the flat/house details; area, pincode and delivery zone
// are filled in from the map. Without Maps it's a plain form. Zones are the ones set in the admin panel.
import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../state/auth.jsx';
import { useConfig } from '../state/menu.js';
import Modal from './Modal.jsx';
import { PlaceSearch, PinMap } from './LocationPicker.jsx';
import { MapPin } from './Icons.jsx';

const LABELS = ['Home', 'Work', 'Other'];

// A saved address's pin, in the shape the map expects.
const pinOf = a => (a?.lat != null ? { lat: a.lat, lng: a.lng, area: a.area, formatted: a.mapAddress, check: { deliverable: true } } : null);
const streetLine = p => [...new Set([p.name, p.street, p.area, p.city].filter(Boolean))].join(', ').slice(0, 120);

export default function AddressForm({ address, startPlace, onClose, onSaved }) {
  const { setCustomer } = useAuth();
  const { data: config } = useConfig();
  const maps = Boolean(config?.maps);
  const [form, setForm] = useState(() => ({ label: 'Home', line1: '', line2: '', landmark: '', zone: '', pincode: '', ...address }));
  const [place, setPlace] = useState(() => pinOf(address));
  const [step, setStep] = useState(() => (!maps || address?._id ? 'details' : startPlace ? 'map' : 'search'));
  const [pinStart, setPinStart] = useState(startPlace || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }));

  const pinned = p => {
    setPlace(p);
    setForm(f => ({ ...f, line2: streetLine(p) || f.line2, pincode: p.pincode || f.pincode, zone: p.zone || f.zone }));
    setStep('details');
  };
  const movePin = () => {
    if (place) { setPinStart(place); setStep('map'); } else setStep('search');
  };

  const save = async e => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = place ? { ...form, lat: place.lat, lng: place.lng, area: place.area || '', mapAddress: place.formatted || '' } : form;
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
          {place ? (
            <div className="pin-card__place pin-card__place--boxed">
              <span className="pin-card__icon"><MapPin /></span>
              <span className="pin-card__text"><b>{place.area || place.name || 'Pinned location'}</b><span>{place.formatted}</span></span>
              <button type="button" className="link" onClick={movePin}>Change</button>
            </div>
          ) : maps && (
            <button type="button" className="link pin-add" onClick={movePin}><MapPin /> Pin this address on the map</button>
          )}
          <div className="chips" role="radiogroup" aria-label="Save as">
            {LABELS.map(l => (
              <button key={l} type="button" role="radio" aria-checked={form.label === l} className={`chip-btn${form.label === l ? ' is-active' : ''}`} onClick={() => setForm(f => ({ ...f, label: l }))}>{l}</button>
            ))}
          </div>
          <label className="field">
            <span>{place ? 'House / flat / floor no.' : 'House / flat no., building, street'}</span>
            <input value={form.line1} onChange={set('line1')} autoComplete="address-line1" maxLength={120} required autoFocus={Boolean(place) && !form.line1} placeholder={place ? 'e.g. Flat 302, 3rd floor' : undefined} />
          </label>
          <label className="field">
            <span>{place ? 'Building, street, area' : <>Area / locality <i>(optional)</i></>}</span>
            <input value={form.line2} onChange={set('line2')} autoComplete="address-line2" maxLength={120} />
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
          <label className="field">
            <span>Delivery zone</span>
            <select value={form.zone} onChange={set('zone')} required>
              <option value="" disabled>Pick your zone</option>
              {(config?.zones || []).map(z => <option key={z}>{z}</option>)}
            </select>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn--red btn--block" disabled={busy}>{busy ? 'Saving…' : 'Save address'}</button>
        </form>
      )}
    </Modal>
  );
}
