import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../state/auth.jsx';
import { useCart } from '../state/cart.jsx';
import { useToast } from '../state/toast.jsx';
import { useDeliveryLocation, setDeliveryLocation, locationFromAddress } from '../state/location.js';
import { PageHero } from '../components/Sections.jsx';
import { VegMark, Stepper } from '../components/Dish.jsx';
import AddressForm from '../components/AddressForm.jsx';
import { useBottomBar } from '../components/CartDrawer.jsx';
import { Bag, MapPin, Tag, User, Wallet, Close, Sparkle } from '../components/Icons.jsx';
import Modal from '../components/Modal.jsx';
import Confetti from '../components/Confetti.jsx';
import { money, addressLine, offerHeadline } from '../lib/format.js';
import usePageTitle from '../lib/usePageTitle.js';

const LAST_ADDRESS = 'bitevo_last_address';
const remember = id => { try { localStorage.setItem(LAST_ADDRESS, id); } catch { /* ignore */ } };
const recall = () => { try { return localStorage.getItem(LAST_ADDRESS); } catch { return null; } };

// Re-prices the cart on the server whenever the cart, coupon, wallet choice or customer changes.
function useQuote(cart, useWallet, customerId) {
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState(null);
  const seq = useRef(0);
  const items = cart.lines.map(l => ({ productId: l.productId, qty: l.qty }));
  const key = JSON.stringify([items, cart.coupon, useWallet, customerId]);

  const refresh = () => {
    const n = ++seq.current;
    if (!items.length) { setQuote(null); return; }
    api.quote({ items, couponCode: cart.coupon, useWallet }).then(
      q => { if (n === seq.current) { setQuote(q); setError(null); } },
      err => { if (n === seq.current) setError(err); },
    );
  };
  useEffect(() => {
    const t = setTimeout(refresh, 150);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return { quote, setQuote, error, refresh };
}

function Offers({ applied, onApply }) {
  const [offers, setOffers] = useState(null);
  const [open, setOpen] = useState(false);
  const { customer } = useAuth();
  useEffect(() => { api.offers().then(setOffers, () => setOffers([])); }, [customer?._id]);
  if (!offers?.length) return null;
  return (
    <div className="offers">
      <button type="button" className="link" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        {open ? 'Hide offers' : `View ${offers.length} offer${offers.length > 1 ? 's' : ''}`}
      </button>
      {open && (
        <ul className="offers__list">
          {offers.map(o => (
            <li key={o.code} className="offer">
              <div>
                <span className="offer__code">{o.code}</span>
                <b>{offerHeadline(o)}</b>
                <p>{o.description}{o.minOrderValue ? ` · Min. order ${money(o.minOrderValue)}` : ''}{o.firstOrderOnly ? ' · First order only' : ''}</p>
              </div>
              <button type="button" className="btn btn--outline btn--sm" disabled={applied === o.code} onClick={() => { onApply(o.code); setOpen(false); }}>
                {applied === o.code ? 'Applied' : 'Apply'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// A short "Woohoo!" when an offer the customer just applied works. Closes itself after a few seconds.
function CouponCelebration({ coupon, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <Modal onClose={onClose} label={`${coupon.code} applied`} className="celebrate">
      <span className="celebrate__badge"><Sparkle /><Confetti pieces={34} /></span>
      <p className="celebrate__code">‘{coupon.code}’ applied</p>
      <h2>{coupon.message}</h2>
      <p className="muted">Woohoo! Your offer is on this order.</p>
      <button type="button" className="btn btn--red btn--block" onClick={onClose}>Yay, thanks!</button>
    </Modal>
  );
}

export default function Checkout() {
  usePageTitle('Checkout');
  const navigate = useNavigate();
  const toast = useToast();
  const { customer, ready, requireLogin } = useAuth();
  const cart = useCart();
  const [useWallet, setUseWallet] = useState(false);
  const [addressId, setAddressIdState] = useState(null);
  const deliveryLocation = useDeliveryLocation();
  // Choosing an address here also updates the "Delivering to" location shown on the menu.
  const setAddressId = id => { setAddressIdState(id); if (id) setDeliveryLocation(locationFromAddress({ _id: id })); };
  const [editing, setEditing] = useState(null); // address being added/edited
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState('');
  const signedIn = Boolean(customer?.name);
  const { quote, setQuote, error: quoteError, refresh } = useQuote(cart, useWallet, signedIn ? customer._id : null);
  useBottomBar(cart.lines.length > 0);

  // Celebrate an offer once the server confirms it (only right after the customer applies it).
  const justApplied = useRef(null);
  const [celebrate, setCelebrate] = useState(null);
  useEffect(() => {
    const code = justApplied.current;
    if (!code || !quote) return;
    if (quote.coupon?.code === code) { setCelebrate(quote.coupon); justApplied.current = null; }
    else if (quote.couponError) justApplied.current = null; // the error shows under the code instead
  }, [quote]);
  const closeCelebration = useCallback(() => setCelebrate(null), []);

  // Pick the address chosen on the menu, else the one used last time, else the first saved one.
  // A map pin chosen on the menu (not a saved address yet) waits for "Add a new address" instead.
  const addresses = customer?.addresses || [];
  useEffect(() => {
    if (addresses.some(a => a._id === addressId)) return;
    const chosen = addresses.find(a => a._id === deliveryLocation?.addressId);
    const last = recall();
    setAddressIdState((chosen || (!deliveryLocation?.place && (addresses.find(a => a._id === last) || addresses[0])))?._id || null);
  }, [addresses, addressId, deliveryLocation]);

  if (!cart.lines.length) {
    return (
      <>
        <PageHero compact title={<>Your <em>cart</em></>} />
        <section className="section section--tight">
          <div className="container empty">
            <div className="empty__icon"><Bag /></div>
            <h3>Your cart is empty</h3>
            <p>Add a few dishes from the menu and they’ll show up here.</p>
            <Link to="/menu" className="btn btn--red btn--lg">Browse the menu</Link>
          </div>
        </section>
      </>
    );
  }

  const applyCode = c => {
    const value = (c ?? code).trim().toUpperCase();
    if (!value) return;
    if (!signedIn) {
      requireLogin('Sign in to use offers on your order.').then(who => {
        if (!who) return;
        justApplied.current = value;
        cart.setCoupon(value);
      });
      return;
    }
    justApplied.current = value;
    cart.setCoupon(value);
    setCode('');
  };

  const place = async () => {
    setPlaceError('');
    const who = signedIn ? customer : await requireLogin('Sign in to place your order.');
    if (!who) return;
    if (!addressId) { setPlaceError('Add a delivery address first.'); return; }
    setPlacing(true);
    try {
      const order = await api.placeOrder({
        items: cart.lines.map(l => ({ productId: l.productId, qty: l.qty })),
        addressId, couponCode: cart.coupon, useWallet, note, expectedTotal: quote?.total,
      });
      remember(addressId);
      cart.clear();
      navigate(`/orders/${order._id}`, { state: { justPlaced: true } });
    } catch (err) {
      if (err.data?.quote) setQuote(err.data.quote);
      else refresh();
      setPlaceError(err.message);
      toast(err.message, 'error');
      setPlacing(false);
    }
  };

  const blocker = !quote ? null
    : quote.unavailable.length ? 'Remove the dishes that are no longer available.'
    : quote.couponError ? 'Remove the offer, or update your cart to use it.'
    : quote.itemTotal < quote.minOrderValue ? `The minimum order is ${money(quote.minOrderValue)}.`
    : null;

  // The one main button (in the summary, and in the bar pinned to the bottom on phones).
  const action = !signedIn ? { label: 'Sign in to order', short: 'Sign in to order', run: place }
    : !addressId ? { label: 'Add a delivery address', short: 'Add address', run: () => setEditing({}) }
    : { label: `Place order · ${quote ? money(quote.payable) : ''}`, short: 'Place order', run: place };
  const actionDisabled = placing || !quote || Boolean(blocker);

  return (
    <>
      <PageHero compact title={<>Almost <em>there!</em></>}>Check your order, pick an address and we’ll start cooking.</PageHero>

      <section className="section section--tight">
        <div className="container checkout">
          <div className="checkout__main">
            {/* Account */}
            <div className="panel">
              <div className="panel__head"><span className="panel__icon"><User /></span><h2>Account</h2></div>
              {!ready ? <p className="muted">Checking…</p> : signedIn ? (
                <p className="panel__done">Ordering as <b>{customer.name}</b> · {customer.phone}</p>
              ) : (
                <div className="panel__cta">
                  <p>Sign in with your mobile number to place the order and follow it live.</p>
                  <button className="btn btn--red" onClick={() => requireLogin()}>{customer ? 'Add your name' : 'Sign in to continue'}</button>
                </div>
              )}
            </div>

            {/* Address */}
            <div className={`panel${signedIn ? '' : ' is-locked'}`}>
              <div className="panel__head"><span className="panel__icon"><MapPin /></span><h2>Delivery address</h2></div>
              {signedIn && (
                <>
                  <div className="addresses" role="radiogroup" aria-label="Delivery address">
                    {addresses.map(a => (
                      <label key={a._id} className={`address${addressId === a._id ? ' is-selected' : ''}`}>
                        <input type="radio" name="address" checked={addressId === a._id} onChange={() => setAddressId(a._id)} />
                        <span className="address__body">
                          <b>{a.label}</b>
                          <span>{addressLine(a)}</span>
                        </span>
                        <button type="button" className="link" onClick={e => { e.preventDefault(); setEditing(a); }}>Edit</button>
                      </label>
                    ))}
                  </div>
                  <button type="button" className="btn btn--outline" onClick={() => setEditing({})}>+ Add a new address</button>
                </>
              )}
              {!signedIn && <p className="muted">Sign in to choose where we deliver.</p>}
            </div>

            {/* Payment */}
            <div className={`panel${signedIn ? '' : ' is-locked'}`}>
              <div className="panel__head"><span className="panel__icon"><Wallet /></span><h2>Payment</h2></div>
              {signedIn && quote?.walletBalance > 0 && (
                <label className="wallet-opt">
                  <input type="checkbox" checked={useWallet} onChange={e => setUseWallet(e.target.checked)} />
                  <span>
                    <b>Use BiteVo wallet</b>
                    <small>Balance {money(quote.walletBalance)}{useWallet && quote.walletUsed ? ` · ${money(quote.walletUsed)} will be used` : ''}</small>
                  </span>
                </label>
              )}
              {quote?.payable === 0 && quote?.walletUsed > 0 ? (
                <p className="pay-opt"><b>Paid fully from your wallet</b><small>Nothing to pay on delivery.</small></p>
              ) : (
                <p className="pay-opt"><b>Pay on delivery</b><small>Pay {quote ? money(quote.payable) : 'the total'} in cash or by UPI to the delivery partner.</small></p>
              )}
              <label className="field">
                <span>Note for the kitchen <i>(optional)</i></span>
                <textarea rows={2} maxLength={200} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Less spicy, no onions, ring the bell twice" />
              </label>
            </div>
          </div>

          <aside className="checkout__summary">
            <div className="panel panel--summary">
              <h2>Your order</h2>
              <ul className="summary__lines">
                {cart.lines.map(l => {
                  const gone = quote?.unavailable.some(u => u.productId === l.productId);
                  return (
                    <li key={l.productId} className={`line${gone ? ' is-gone' : ''}`}>
                      <div className="line__info">
                        <span className="line__name"><VegMark veg={l.isVeg} />{l.name}</span>
                        {gone ? <span className="line__warn">No longer available</span> : <span className="line__price">{money(l.price * l.qty)}</span>}
                      </div>
                      {gone
                        ? <button type="button" className="link" onClick={() => cart.setQty(l.productId, 0)}>Remove</button>
                        : <Stepper small qty={l.qty} label={l.name} onChange={n => cart.setQty(l.productId, n)} />}
                    </li>
                  );
                })}
                {quote?.items.filter(i => i.free).map(i => (
                  <li key={`free-${i.productId}`} className="line line--free">
                    <div className="line__info">
                      <span className="line__name"><VegMark veg={i.isVeg} />{i.qty > 1 ? `${i.qty} × ` : ''}{i.name}</span>
                      <span className="line__price"><s>{money(i.price * i.qty)}</s> FREE</span>
                    </div>
                  </li>
                ))}
              </ul>
              <Link to="/menu" className="cart__more">+ Add more dishes</Link>

              <div className="coupon">
                {cart.coupon ? (
                  <div className={`coupon__applied${quote?.couponError ? ' has-error' : ''}`}>
                    <Tag />
                    <div>
                      <b>{cart.coupon}</b>
                      <small>{quote?.couponError || quote?.coupon?.message || 'Checking…'}</small>
                    </div>
                    <button type="button" onClick={() => cart.setCoupon('')} aria-label="Remove offer"><Close /></button>
                  </div>
                ) : (
                  <form className="coupon__form" onSubmit={e => { e.preventDefault(); applyCode(); }}>
                    <Tag />
                    <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Offer code" maxLength={20} aria-label="Offer code" />
                    <button className="link" disabled={!code.trim()}>Apply</button>
                  </form>
                )}
                <Offers applied={cart.coupon} onApply={applyCode} />
              </div>

              {quoteError && <p className="form-error">{quoteError.message}</p>}
              {quote && (
                <dl className="bill">
                  <div><dt>Item total</dt><dd>{money(quote.subtotal)}</dd></div>
                  <div><dt>Delivery fee</dt><dd>{quote.deliveryFee ? money(quote.deliveryFee) : <span className="free">FREE</span>}</dd></div>
                  {quote.deliveryFee > 0 && quote.itemTotal < quote.freeDeliveryAbove && (
                    <p className="bill__hint">Add {money(quote.freeDeliveryAbove - quote.itemTotal)} more for free delivery</p>
                  )}
                  {quote.discount > 0 && <div className="bill__save"><dt>Offer ({quote.coupon?.code})</dt><dd>−{money(quote.discount)}</dd></div>}
                  {quote.walletUsed > 0 && <div className="bill__save"><dt>From wallet</dt><dd>−{money(quote.walletUsed)}</dd></div>}
                  <div className="bill__total"><dt>To pay</dt><dd><span key={quote.payable} className="pop">{money(quote.payable)}</span></dd></div>
                  {quote.cashback > 0 && <p className="bill__hint bill__hint--green">{money(quote.cashback)} cashback will be added to your wallet after delivery</p>}
                </dl>
              )}

              {placeError && <p className="form-error" role="alert">{placeError}</p>}
              {blocker && <p className="form-error">{blocker}</p>}
              <button className="btn btn--red btn--block btn--lg place-btn" onClick={action.run} disabled={actionDisabled}>
                {placing ? 'Placing your order…' : action.label}
              </button>
              <p className="fine">By placing this order you agree to our <Link to="/terms">Terms</Link>. You can cancel free of charge until the kitchen starts cooking.</p>
            </div>
          </aside>
        </div>
      </section>

      {/* Phones and tablets: total and the main button stay in reach at the bottom of the screen. */}
      <div className="checkout-bar">
        <div className="checkout-bar__total">
          <small className={blocker ? 'is-error' : ''}>{blocker || (quote?.walletUsed ? 'To pay after wallet' : 'To pay')}</small>
          <b key={quote?.payable} className="pop">{quote ? money(quote.payable) : '…'}</b>
        </div>
        <button className="btn btn--red btn--lg" onClick={action.run} disabled={actionDisabled}>
          {placing ? 'Placing…' : action.short}
        </button>
      </div>

      {celebrate && <CouponCelebration coupon={celebrate} onClose={closeCelebration} />}

      {editing && (
        <AddressForm
          address={editing._id ? editing : null}
          startPlace={editing._id ? null : deliveryLocation?.place}
          onClose={() => setEditing(null)}
          onSaved={a => setAddressId(a._id)}
        />
      )}
    </>
  );
}
