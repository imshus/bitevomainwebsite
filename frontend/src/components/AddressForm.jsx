// Add or edit a delivery address, the way delivery apps do it: find the place (search or current location),
// set the pin on the map, then type only the flat / house / plot number and who receives the order (name and
// mobile number). The area, city and pincode come from the map. See cleanAddress in
// backend/src/routes/account.js for how it's saved.
import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../state/auth.jsx';
import Modal from './Modal.jsx';
import { PlaceSearch, PinMap } from './LocationPicker.jsx';
import { MapPin } from './Icons.jsx';

const LABELS = ['Home', 'Work', 'Other'];

// A saved address's map pin, if it has one with the map's address.
const pinOf = a => (a?.lat != null && a.mapAddress
  ? { lat: a.lat, lng: a.lng, area: a.area, city: a.city, pincode: a.pincode, formatted: a.mapAddress, check: { deliverable: true } }
  : null);
// "+91 98765 43210" → "9876543210", for the phone box.
const tenDigits = phone => String(phone || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').slice(-10);

export default function AddressForm({ address, startPlace, onClose, onSaved }) {
  const { customer, setCustomer } = useAuth();
  const editing = Boolean(address?._id);
  const [pin, setPin] = useState(() => pinOf(address));
  // An address with a pin opens on its details; one with only a GPS point opens on the map there; older
  // addresses without a point, and new ones, start by finding the place.
  const [step, setStep] = useState(() => (pinOf(address) ? 'details' : startPlace || address?.lat != null ? 'map' : 'search'));
  const [pinStart, setPinStart] = useState(() => startPlace || (address?.lat != null ? { lat: address.lat, lng: address.lng } : null));
  const [form, setForm] = useState(() => ({
    label: address?.label || 'Home',
    house: address?.house || (address && !address.house ? (address.line1 || '').split(',')[0].trim() : ''),
    receiverName: address?.receiverName || customer?.name || '',
    receiverPhone: tenDigits(address?.receiverPhone || customer?.phone || customer?.deliveryPhone),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }));

  const pinned = p => { setPin(p); setError(''); setStep('details'); };
  const movePin = () => { setPinStart(pin); setStep('map'); };

  const save = async e => {
    e.preventDefault();
    if (!pin) { setStep('search'); return; }
    if (!/^[6-9]\d{9}$/.test(form.receiverPhone)) { setError('Enter a valid 10-digit mobile number for the person receiving the order.'); return; }
    setBusy(true);
    setError('');
    const body = {
      label: form.label, house: form.house, receiverName: form.receiverName, receiverPhone: form.receiverPhone,
      lat: pin.lat, lng: pin.lng, mapAddress: pin.formatted, area: pin.area || '', city: pin.city || '', pincode: pin.pincode || '',
    };
    try {
      const result = editing ? await api.updateAddress(address._id, body) : await api.addAddress(body);
      setCustomer(result.customer);
      onSaved?.(result.address);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const title = editing ? 'Edit address' : 'Add new address';
  return (
    <Modal onClose={onClose} label={title} className={`address-sheet${step === 'details' ? '' : ' location-sheet'}${step === 'map' ? ' location-sheet--map' : ''}`}>
      {step === 'search' && (
        <>
          {editing && <p className="address-sheet__note">Set this address on the map so the rider reaches your door.</p>}
          <PlaceSearch title={editing ? 'Find your address' : 'Add new address'} onPick={p => { setPinStart(p); setStep('map'); }} />
        </>
      )}
      {step === 'map' && (
        <PinMap
          start={pinStart} confirmLabel="Confirm location" onConfirm={pinned}
          onBack={() => setStep('search')} onSearch={() => setStep('search')}
        />
      )}
      {step === 'details' && (
        <form className="stack" onSubmit={save}>
          <h2>{title}</h2>
          <div className="pin-card__place pin-card__place--boxed">
            <span className="pin-card__icon"><MapPin /></span>
            <span className="pin-card__text"><b>{pin.area || pin.name || pin.city || 'Pinned location'}</b><span>{pin.formatted}</span></span>
            <button type="button" className="link" onClick={movePin}>Change</button>
          </div>

          <label className="field">
            <span>Flat / House / Plot no.</span>
            <input
              value={form.house} onChange={set('house')} maxLength={60} required autoFocus={!form.house}
              autoComplete="address-line1" placeholder="e.g. Flat 302, 3rd floor, Tower B"
            />
          </label>
          <label className="field">
            <span>Receiver’s name</span>
            <input value={form.receiverName} onChange={set('receiverName')} minLength={2} maxLength={60} required autoComplete="name" />
          </label>
          <label className="field">
            <span>Receiver’s contact number</span>
            <div className="phone-input">
              <span>+91</span>
              <input
                value={form.receiverPhone} required inputMode="numeric" autoComplete="tel-national" placeholder="10-digit mobile number"
                onChange={e => setForm(f => ({ ...f, receiverPhone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
              />
            </div>
          </label>

          <div className="field">
            <span id="address-label">Save address as</span>
            <div className="chips" role="radiogroup" aria-labelledby="address-label">
              {LABELS.map(l => (
                <button key={l} type="button" role="radio" aria-checked={form.label === l} className={`chip-btn${form.label === l ? ' is-active' : ''}`} onClick={() => setForm(f => ({ ...f, label: l }))}>{l}</button>
              ))}
            </div>
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn--red btn--block" disabled={busy}>{busy ? 'Saving…' : 'Save address'}</button>
        </form>
      )}
    </Modal>
  );
}
