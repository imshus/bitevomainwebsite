// The top of the menu, on BiteVo red: delivery time, where we're delivering to (tap to change), the
// wallet and profile buttons (profile opens the site menu), then dish search (with voice search where
// the browser supports it) and the veg-only switch.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../state/auth.jsx';
import { useDeliveryLocation, describeLocation, setDeliveryLocation, locationFromAddress } from '../state/location.js';
import { prefersReducedMotion } from '../lib/motion.js';
import { lazyLoad, LazyPart, whenIdle, CANT_OPEN } from '../lib/lazy.js';
import { useToast } from '../state/toast.jsx';
import { useConfig } from '../state/menu.js';
import { deliversTo, whereWeDeliver } from '../lib/deliveryArea.js';
import SiteMenu from './SiteMenu.jsx';
import { Search, Close } from './Icons.jsx';

// The usual delivery time shown in the badge (frontend/.env).
const DELIVERY_MINS = Number(import.meta.env.VITE_DELIVERY_MINS) || 30;
const FALLBACK_HINTS = ['Biryani', 'Fries', 'Burger', 'Cold Coffee', 'Paneer Tikka', 'Wraps'];

// The location and address sheets are their own files: the picker is fetched once the menu has settled
// (or as soon as the address button is pointed at), the address form when the picker opens.
const LocationPicker = lazyLoad(() => import('./LocationPicker.jsx'));
const AddressForm = lazyLoad(() => import('./AddressForm.jsx'));
const warmPicker = () => LocationPicker.preload().catch(() => {});

const Caret = () => <svg className="where__caret" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1h10L6 7Z" /></svg>;
const Mic = () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2.5" width="6" height="12" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg>;
const Person = () => <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.5" r="4.5" /><path d="M3.5 21a8.5 7 0 0 1 17 0Z" /></svg>;
const WalletArt = () => (
  <svg viewBox="0 0 32 32" aria-hidden="true">
    <path d="M6 9.5 20.6 4.2a2 2 0 0 1 2.6 1.2l1.4 4.1Z" fill="#C98A00" />
    <rect x="3" y="9" width="26" height="19" rx="4.5" fill="#F2B705" />
    <rect x="3" y="9" width="26" height="5" rx="2.5" fill="#E0A400" />
    <text x="16" y="25" textAnchor="middle" fontSize="12" fontWeight="800" fill="#7A4A00">₹</text>
  </svg>
);

function useRotatingHint(names) {
  const hints = useMemo(() => {
    const max = window.matchMedia('(max-width: 520px)').matches ? 16 : 22;
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

// Speech-to-text search in Chrome, Edge and Android; null where the browser can't do it (the mic is hidden).
const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

function useVoiceSearch(onText) {
  const [listening, setListening] = useState(false);
  const current = useRef(null);
  useEffect(() => () => current.current?.abort(), []);
  if (!Recognition) return null;
  const toggle = () => {
    if (listening) { current.current?.stop(); return; }
    const r = new Recognition();
    r.lang = 'en-IN';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = e => onText(e.results[0][0].transcript.replace(/[.?!]+$/, ''));
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    current.current = r;
    setListening(true);
    r.start();
  };
  return { listening, toggle };
}

export default function MenuHeader({ query, setQuery, vegOnly, setVegOnly, dishNames = [] }) {
  const { customer } = useAuth();
  const location = useDeliveryLocation();
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const toast = useToast();
  useEffect(() => { whenIdle(warmPicker); }, []);
  useEffect(() => { if (picking) AddressForm.preload().catch(() => {}); }, [picking]);
  const where = describeLocation(location, customer?.addresses);
  const { data: config } = useConfig();
  const unserved = Boolean(where) && !deliversTo(where.spot, config);
  const saved = where?.addressId && customer?.addresses?.find(a => a._id === where.addressId);
  const tag = saved?.label || 'Deliver to';
  const hint = useRotatingHint(dishNames);
  const voice = useVoiceSearch(setQuery);
  // Signed in: the profile button shows the customer's initial instead of the generic person.
  const who = customer?.name?.trim() || customer?.email || '';
  const initial = who[0]?.toUpperCase();

  return (
    <div className="menu-head">
      <div className="menu-head__top">
        {unserved ? (
          <span className="eta eta--off" title="We don’t deliver to this location yet"><b>✕</b><small>N/A</small></span>
        ) : (
          <span className="eta" title={`Usually delivered in about ${DELIVERY_MINS} minutes`}>
            <b>{DELIVERY_MINS}</b><small>mins</small>
          </span>
        )}
        <button type="button" className="where" onClick={() => setPicking(true)} onPointerEnter={warmPicker} onFocus={warmPicker} aria-label={where ? `Delivering to ${where.subtitle || where.title}. Change location` : 'Set your delivery location'}>
          {where ? (
            <><span className="where__text"><b>{tag} - </b>{where.subtitle || where.title}</span><Caret /></>
          ) : (
            <span className="where__text where__text--empty"><b>Select location</b><Caret /><small>Tap to choose where we deliver</small></span>
          )}
        </button>
        <Link to="/wallet" className="menu-head__btn" aria-label="BiteVo wallet"><WalletArt /></Link>
        <button
          type="button" className={`menu-head__btn menu-head__btn--me${initial ? ' is-signed-in' : ''}`} onClick={() => setMenuOpen(true)}
          aria-label={customer ? `Signed in as ${who}. My account and site menu` : 'Sign in and site menu'} title={customer ? `Signed in as ${who}` : undefined}
        >
          {initial ? <span className="menu-head__initial" aria-hidden="true">{initial}</span> : <Person />}
        </button>
      </div>

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
              {voice?.listening ? 'Listening…' : <>Search <span key={hint} className="menu-search__dish">“{hint}”</span></>}
            </span>
          )}
          {query && <button type="button" className="menu-search__clear" onClick={() => setQuery('')} aria-label="Clear search"><Close /></button>}
          {voice && (
            <button
              type="button" className={`menu-search__mic${voice.listening ? ' is-listening' : ''}`} onClick={voice.toggle}
              aria-label={voice.listening ? 'Stop voice search' : 'Search by voice'} aria-pressed={voice.listening}
            >
              <Mic />
            </button>
          )}
        </label>
        <button type="button" role="switch" aria-checked={vegOnly} className={`veg-switch${vegOnly ? ' is-on' : ''}`} onClick={() => setVegOnly(v => !v)}>
          <span className="veg-switch__label">VEG</span>
          <span className="veg-switch__track" aria-hidden="true"><span /></span>
          <span className="visually-hidden">Show veg dishes only</span>
        </button>
      </div>

      {unserved && (
        <div className="unserved" role="status">
          <span className="unserved__icon" aria-hidden="true">!</span>
          <span className="unserved__text">
            <b>Service unavailable at this location</b>
            <small>{whereWeDeliver(config)}</small>
          </span>
          <button type="button" className="unserved__change" onClick={() => setPicking(true)} onPointerEnter={warmPicker}>Change</button>
        </div>
      )}

      <LazyPart onError={() => { setPicking(false); setAdding(false); toast(CANT_OPEN, 'error'); }}>
        {picking && <LocationPicker onClose={() => setPicking(false)} onAddAddress={() => { setPicking(false); setAdding(true); }} />}
        {adding && <AddressForm onClose={() => setAdding(false)} onSaved={a => setDeliveryLocation(locationFromAddress(a))} />}
      </LazyPart>
      {menuOpen && <SiteMenu onClose={() => setMenuOpen(false)} />}
    </div>
  );
}
