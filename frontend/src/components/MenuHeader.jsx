// The top of the menu: where we're delivering to (tap to change), dish search with a rotating hint,
// and the veg-only switch.
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../state/auth.jsx';
import { useDeliveryLocation, describeLocation, setDeliveryLocation, locationFromAddress } from '../state/location.js';
import { prefersReducedMotion } from '../lib/motion.js';
import LocationPicker from './LocationPicker.jsx';
import AddressForm from './AddressForm.jsx';
import SiteMenu from './SiteMenu.jsx';
import { Search, Close, Navigation, ChevronDown } from './Icons.jsx';

const FALLBACK_HINTS = ['Biryani', 'Fries', 'Burger', 'Cold Coffee', 'Paneer Tikka', 'Wraps'];

function useRotatingHint(names) {
  const hints = useMemo(() => {
    // Phones have room for short names only (the hint shares one row with location and VEG there).
    const max = window.matchMedia('(max-width: 520px)').matches ? 10 : 22;
    const unique = [...new Set(names.filter(n => n && n.length <= max))];
    return unique.length >= 3 ? unique.slice(0, 12) : FALLBACK_HINTS;
  }, [names]);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const t = setInterval(() => setI(n => (n + 1) % hints.length), 2600);
    return () => clearInterval(t);
  }, [hints]);
  return hints[i % hints.length];
}

export default function MenuHeader({ query, setQuery, vegOnly, setVegOnly, dishNames = [] }) {
  const { customer } = useAuth();
  const location = useDeliveryLocation();
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const where = describeLocation(location, customer?.addresses);
  const hint = useRotatingHint(dishNames);

  return (
    <div className="menu-head">
      <button type="button" className="where" onClick={() => setPicking(true)} aria-label={where ? `Delivering to ${where.title}. Change location` : 'Set your delivery location'}>
        <span className="where__icon"><Navigation /></span>
        <span className="where__text">
          <span className="where__title">
            <b>{where?.title || 'Set delivery location'}</b>
            <ChevronDown />
          </span>
          <span className="where__line">{where?.subtitle || 'Tap to choose where we deliver'}</span>
        </span>
      </button>

      <div className="menu-head__row">
        <label className="menu-search">
          <Search />
          <input
            type="search" value={query} onChange={e => setQuery(e.target.value)}
            aria-label="Search the menu" enterKeyHint="search" autoComplete="off"
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />
          {!query && (
            <span className="menu-search__hint" aria-hidden="true">
              <span className="menu-search__lead">Search for </span><span key={hint} className="menu-search__dish">‘{hint}’</span>
            </span>
          )}
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><Close /></button>}
        </label>
        <button type="button" role="switch" aria-checked={vegOnly} className={`veg-switch${vegOnly ? ' is-on' : ''}`} onClick={() => setVegOnly(v => !v)}>
          <span className="veg-switch__label">VEG</span>
          <span className="veg-switch__track" aria-hidden="true"><span /></span>
          <span className="visually-hidden">Show veg dishes only</span>
        </button>
        <button type="button" className="menu-head__menu" onClick={() => setMenuOpen(true)} aria-label="Open menu">
          <span></span><span></span><span></span>
        </button>
      </div>

      {picking && <LocationPicker onClose={() => setPicking(false)} onAddAddress={() => { setPicking(false); setAdding(true); }} />}
      {menuOpen && <SiteMenu onClose={() => setMenuOpen(false)} />}
      {adding && <AddressForm onClose={() => setAdding(false)} onSaved={a => setDeliveryLocation(locationFromAddress(a))} />}
    </div>
  );
}
