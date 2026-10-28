// Checkout, laid out like a food-delivery app: a header with the delivery time and address, the cart
// with quick extras, "Complete your meal" add-ons, offers, delivery details, the bill, and a pay bar
// pinned to the bottom. Styles in ../checkout.css.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../state/auth.jsx';
import { useCart, keyOf } from '../state/cart.jsx';
import { useToast } from '../state/toast.jsx';
import { useMenu, useConfig } from '../state/menu.js';
import { payWithRazorpay } from '../lib/razorpay.js';
import { useDeliveryLocation, setDeliveryLocation, locationFromAddress } from '../state/location.js';
import { PageHero } from '../components/Sections.jsx';
import { VegMark, Stepper } from '../components/Dish.jsx';
import AddressForm from '../components/AddressForm.jsx';
import StoreLock from '../components/StoreLock.jsx';
import { Bag, MapPin, Tag, Wallet, Close, Sparkle, Navigation, ChevronDown, Receipt } from '../components/Icons.jsx';
import Modal from '../components/Modal.jsx';
import Confetti from '../components/Confetti.jsx';
import { money, addressLine, offerHeadline } from '../lib/format.js';
import { srcSet } from '../lib/photo.js';
import { deliversTo, whereWeDeliver } from '../lib/deliveryArea.js';
import usePageTitle from '../lib/usePageTitle.js';
import '../checkout.css';

const LAST_ADDRESS = 'bitevo_last_address';
const remember = id => { try { localStorage.setItem(LAST_ADDRESS, id); } catch { /* ignore */ } };
const recall = () => { try { return localStorage.getItem(LAST_ADDRESS); } catch { return null; } };
const DELIVERY_MINS = Number(import.meta.env.VITE_DELIVERY_MINS) || 30;

const Back = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>;
const Plus = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
const Pencil = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4" /></svg>;

// Re-prices the cart on the server whenever the cart, coupon, wallet choice or customer changes.
// What the server is sent for each cart line (half plates say so).
const orderItems = lines => lines.map(l => ({ productId: l.productId, qty: l.qty, ...(l.portion === 'half' && { portion: 'half' }) }));

function useQuote(cart, useWallet, customerId) {
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState(null);
  const seq = useRef(0);
  const items = orderItems(cart.lines);
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

// Small add-ons that aren't in the cart yet: cheaper dishes and bestsellers first.
function CompleteMeal() {
  const { data: menu } = useMenu();
  const cart = useCart();
  const picks = useMemo(() => {
    if (!menu) return [];
    const inCart = new Set(cart.lines.map(l => l.productId));
    const score = p => (p.price <= 150 ? 0 : 2) - (p.isBestseller ? 1 : 0);
    return menu.products
      .filter(p => p.isAvailable && p.price > 1 && !inCart.has(p._id))
      .sort((a, b) => score(a) - score(b) || a.price - b.price)
      .slice(0, 10);
  }, [menu, cart.lines]);
  if (!picks.length) return null;

  return (
    <section className="co-card co-meal">
      <h2 className="co-label">Complete your meal</h2>
      <div className="co-meal__rail">
        {picks.map(p => (
          <article key={p._id} className="co-meal__item">
            <div className="co-meal__img">
              {p.image ? <img src={p.image} srcSet={srcSet(p.image)} sizes="104px" alt="" loading="lazy" decoding="async" /> : <span>{p.name[0]}</span>}
              <button type="button" className="co-meal__add" onClick={() => cart.add(p)} aria-label={`Add ${p.name}`}><Plus /></button>
            </div>
            <span className="co-meal__name"><VegMark veg={p.isVeg} />{p.name}</span>
            <span className="co-meal__price">{p.mrp > p.price && <s>{money(p.mrp)}</s>}{money(p.price)}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function Checkout() {
  usePageTitle('Checkout');
  const navigate = useNavigate();
  const toast = useToast();
  const { customer, ready, requireLogin, setCustomer } = useAuth();
  const cart = useCart();
  const [useWallet, setUseWallet] = useState(false);
  // Accounts made with an email address have no mobile number yet; deliveries need one.
  const [deliveryPhone, setDeliveryPhone] = useState('');
  const phoneInput = useRef(null);
  useEffect(() => {
    if (customer?.deliveryPhone) setDeliveryPhone(p => p || customer.deliveryPhone.replace(/^\+91\s*/, ''));
  }, [customer?.deliveryPhone]);
  const [addressId, setAddressIdState] = useState(null);
  const deliveryLocation = useDeliveryLocation();
  // Choosing an address here also updates the "Delivering to" location shown on the menu.
  const setAddressId = id => { setAddressIdState(id); if (id) setDeliveryLocation(locationFromAddress({ _id: id })); };
  const [editing, setEditing] = useState(null); // address being added/edited
  const [choosing, setChoosing] = useState(false); // the "Deliver to" sheet
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [noCutlery, setNoCutlery] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState('');
  const signedIn = Boolean(customer?.name);
  const needsPhone = signedIn && !customer.phone;
  const phoneOk = /^[6-9]\d{9}$/.test(deliveryPhone.replace(/\D/g, ''));
  const { quote, setQuote, error: quoteError, refresh } = useQuote(cart, useWallet, signedIn ? customer._id : null);
  // Pay online through Razorpay (when it's set up) or cash on delivery; online is the default.
  const { data: siteConfig } = useConfig();
  const [payBy, setPayBy] = useState('online'); // 'online' | 'cod'
  const [choosingPay, setChoosingPay] = useState(false);
  const onlineOk = Boolean(siteConfig?.razorpay);
  const payingOnline = onlineOk && payBy === 'online' && quote?.payable > 0;

  // Phones and tablets: this page has its own header with a back arrow instead of the site header.
  useEffect(() => {
    document.documentElement.classList.add('is-checkout-page');
    return () => document.documentElement.classList.remove('is-checkout-page');
  }, []);

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
  const selected = addresses.find(a => a._id === addressId);
  const served = !selected || deliversTo(selected, siteConfig);

  if (!cart.lines.length) {
    return (
      <>
        <PageHero compact title={<>Your <em>cart</em></>} />
        <section className="section section--tight">
          <div className="container empty">
            <div className="empty__icon"><Bag /></div>
            <h3>Your cart is empty</h3>
            <p>Add a few dishes from the menu and they’ll show up here.</p>
            <Link to="/" className="btn btn--red btn--lg">Browse the menu</Link>
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

  // Where to deliver: sign in first, then pick a saved address or add one.
  const chooseAddress = async () => {
    const who = signedIn ? customer : await requireLogin('Sign in to choose where we deliver.');
    if (!who) return;
    if (!(who.addresses || []).length) setEditing({});
    else setChoosing(true);
  };

  const place = async () => {
    setPlaceError('');
    const who = signedIn ? customer : await requireLogin('Sign in to place your order.');
    if (!who) return;
    if (!addressId) { setPlaceError('Add a delivery address first.'); return; }
    if (!who.phone && !phoneOk) { setPlaceError('Add a 10-digit mobile number for delivery.'); phoneInput.current?.focus(); return; }
    setPlacing(true);
    const orderBody = {
      items: orderItems(cart.lines),
      addressId, couponCode: cart.coupon, useWallet, expectedTotal: quote?.total,
      note: [note.trim(), noCutlery && 'No cutlery please'].filter(Boolean).join(' · ').slice(0, 200),
      ...(!who.phone && { deliveryPhone: deliveryPhone.replace(/\D/g, '') }),
    };
    try {
      let order;
      if (payingOnline) {
        // Razorpay takes the payment in its own window; the order is placed once the server has checked it.
        const pay = await api.payOnline(orderBody);
        let paid;
        try {
          paid = await payWithRazorpay(pay, { onFailed: msg => toast(msg || 'That payment didn’t go through. Try again or pick another way to pay.', 'error') });
        } catch (err) {
          if (!err.dismissed) throw err;
          toast(err.message);
          setPlacing(false);
          return;
        }
        order = await api.placeOrder({ ...orderBody, payment: { orderId: paid.razorpay_order_id, paymentId: paid.razorpay_payment_id, signature: paid.razorpay_signature } });
      } else {
        order = await api.placeOrder(orderBody);
      }
      remember(addressId);
      cart.clear();
      if (!who.phone) api.me().then(setCustomer, () => {}); // picks up the saved delivery number
      navigate(`/orders/${order._id}`, { state: { justPlaced: true } });
    } catch (err) {
      if (err.data?.quote) setQuote(err.data.quote);
      else refresh();
      setPlaceError(err.message);
      toast(err.message, 'error');
      setPlacing(false);
    }
  };

  const blocker = !served ? `Service unavailable at this address. ${whereWeDeliver(siteConfig)}`
    : !quote ? null
    : quote.unavailable.length ? 'Remove the dishes that are no longer available.'
    : quote.couponError ? 'Remove the offer, or update your cart to use it.'
    : quote.storeItem?.error ? quote.storeItem.error
    : quote.itemTotal < quote.minOrderValue ? `The minimum order is ${money(quote.minOrderValue)}.`
    : null;

  // The one main button, in the pay bar.
  const action = !signedIn ? { label: 'Sign in to order', run: place }
    : !addressId ? { label: 'Add address', run: chooseAddress }
    : !served ? { label: 'Change address', run: chooseAddress }
    : needsPhone && !phoneOk ? { label: 'Add mobile number', run: () => phoneInput.current?.focus() }
    : { label: !quote ? 'Place order' : payingOnline ? `Pay ${money(quote.payable)}` : `Place order · ${money(quote.payable)}`, run: place };
  const actionDisabled = served ? placing || !quote || Boolean(blocker) : false;
  const paidByWallet = quote?.payable === 0 && quote?.walletUsed > 0;
  const canChoosePay = onlineOk && !paidByWallet;

  return (
    <div className="co">
      <header className="co-head">
        <div className="co-head__row">
          <button type="button" className="co-head__back" onClick={() => navigate('/')} aria-label="Back to the menu"><Back /></button>
          <div className="co-head__text">
            <small>BiteVo Kitchen</small>
            <button type="button" className="co-head__where" onClick={chooseAddress}>
              <Navigation />
              <span><b>{served ? `${DELIVERY_MINS} mins` : 'Service unavailable'}</b> {served ? 'to' : 'at'} {selected ? `${selected.label} | ${addressLine(selected)}` : signedIn ? 'add a delivery address' : 'your address'}</span>
              <ChevronDown />
            </button>
          </div>
        </div>
        <p className="co-strip"><b>₹0</b> Packaging fee <i aria-hidden="true">·</i> <b>₹0</b> Platform fee</p>
      </header>

      <div className="co-body">
        {/* Cart */}
        <section className="co-card">
          <ul className="co-items">
            {cart.lines.map(l => {
              const gone = quote?.unavailable.some(u => u.productId === l.productId && (u.portion === 'half') === (l.portion === 'half'));
              return (
                <li key={keyOf(l)} className={`co-item${gone ? ' is-gone' : ''}`}>
                  <span className="co-item__name"><VegMark veg={l.isVeg} /><span>{l.name}{gone && <small>No longer available</small>}</span></span>
                  {gone
                    ? <button type="button" className="link" onClick={() => cart.setQty(keyOf(l), 0)}>Remove</button>
                    : <Stepper small qty={l.qty} label={l.name} onChange={n => cart.setQty(keyOf(l), n)} max={cart.maxQtyOf(l)} />}
                  <span className="co-item__price">{money(l.price * l.qty)}</span>
                </li>
              );
            })}
            {quote?.items.filter(i => i.free).map(i => (
              <li key={`free-${i.productId}`} className="co-item co-item--free">
                <span className="co-item__name"><VegMark veg={i.isVeg} /><span>{i.qty > 1 ? `${i.qty} × ` : ''}{i.name}</span></span>
                <span className="co-item__price"><s>{money(i.price * i.qty)}</s> FREE</span>
              </li>
            ))}
          </ul>
          <StoreLock onPick={() => {}} />
          <div className="co-chips">
            <Link to="/" className="co-chip"><Plus />Add items</Link>
            <button type="button" className={`co-chip${noteOpen || note ? ' is-on' : ''}`} onClick={() => setNoteOpen(o => !o)} aria-expanded={noteOpen}><Pencil />Cooking requests</button>
            <label className={`co-chip${noCutlery ? ' is-on' : ''}`}>
              <input type="checkbox" checked={noCutlery} onChange={e => setNoCutlery(e.target.checked)} />Don’t send cutlery
            </label>
          </div>
          {noteOpen && (
            <label className="field co-note">
              <span className="visually-hidden">Cooking requests</span>
              <textarea rows={2} maxLength={180} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Less spicy, no onions" autoFocus />
            </label>
          )}
        </section>

        <CompleteMeal />

        {/* Offers */}
        <section className="co-card">
          <h2 className="co-label">Offers &amp; savings</h2>
          <div className="coupon co-coupon">
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
          {quote?.offers?.length > 0 && (
            <ul className="co-perks">
              {quote.offers.map(o => <li key={o.key}><Sparkle />{o.text}</li>)}
            </ul>
          )}
          {signedIn && quote?.walletBalance > 0 && (
            <label className={`co-wallet${useWallet ? ' is-on' : ''}`}>
              <span className="co-wallet__icon"><Wallet /></span>
              <span className="co-wallet__text">
                <b>Use BiteVo wallet</b>
                <small>Balance {money(quote.walletBalance)}{useWallet && quote.walletUsed ? ` · ${money(quote.walletUsed)} used` : ''}</small>
              </span>
              <input type="checkbox" role="switch" checked={useWallet} onChange={e => setUseWallet(e.target.checked)} />
              <span className="co-switch" aria-hidden="true"><span /></span>
            </label>
          )}
        </section>

        {/* Delivery details */}
        <section className="co-card">
          <h2 className="co-label">Delivery details</h2>
          {!ready ? <p className="muted">Checking…</p> : !signedIn ? (
            <div className="co-signin">
              <p>Sign in to choose an address and place the order.</p>
              <button type="button" className="btn btn--red" onClick={() => requireLogin()}>{customer ? 'Add your name' : 'Sign in'}</button>
            </div>
          ) : (
            <>
              <button type="button" className="co-row" onClick={chooseAddress}>
                <span className="co-row__icon"><MapPin /></span>
                <span className="co-row__text">
                  {selected ? <><b>Deliver to {selected.label}</b><small>{addressLine(selected)}</small></> : <><b>Add a delivery address</b><small>We’ll need it to deliver your order</small></>}
                  {!served && <small className="co-row__off">Service unavailable here. Pick or add an address in our delivery area.</small>}
                </span>
                <span className="co-row__go">{selected ? 'Change' : 'Add'}</span>
              </button>
              <p className="co-who">Ordering as <b>{customer.name}</b> · {customer.phone || customer.email}</p>
              {needsPhone && (
                <label className="field delivery-phone">
                  <span>Mobile number for delivery</span>
                  <div className="phone-input">
                    <span>+91</span>
                    <input
                      ref={phoneInput} type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="98765 43210" required
                      value={deliveryPhone} onChange={e => setDeliveryPhone(e.target.value.replace(/[^\d ]/g, '').slice(0, 11))}
                    />
                  </div>
                  <small>Our delivery partner calls this number if they can’t find you.</small>
                </label>
              )}
            </>
          )}
        </section>

        {/* Bill */}
        {quoteError && <p className="form-error">{quoteError.message}</p>}
        {quote && (
          <section className="co-card co-bill">
            <div className="co-bill__head">
              <span className="co-bill__icon"><Receipt /></span>
              <div>
                <b>To pay {money(quote.payable)}</b>
                <small>Incl. all taxes &amp; charges</small>
              </div>
              <span className="co-stamp" aria-hidden="true">No hidden<br />fees</span>
            </div>
            <dl className="co-bill__rows">
              <div><dt>Item total</dt><dd>{money(quote.subtotal)}</dd></div>
              <div>
                <dt>Delivery fee</dt>
                <dd>{quote.deliveryFee ? money(quote.deliveryFee) : <span className="co-free">FREE</span>}</dd>
              </div>
              {quote.deliveryNote && <p className="co-bill__hint">{quote.deliveryNote}</p>}
              {quote.discount > 0 && <div className="is-save"><dt>{quote.coupon?.code ? `Offer (${quote.coupon.code})` : 'Offers applied'}</dt><dd>−{money(quote.discount)}</dd></div>}
              {quote.walletUsed > 0 && <div className="is-save"><dt>From wallet</dt><dd>−{money(quote.walletUsed)}</dd></div>}
            </dl>
            <p className="co-bill__nofees">THAT’S IT. No unnecessary fees. Ever!</p>
            <div className="co-bill__total"><span>To pay</span><b key={quote.payable} className="pop">{money(quote.payable)}</b></div>
            {(quote.cashback || 0) + (quote.deliveryCashback || 0) > 0 && (
              <p className="co-bill__cashback">{money((quote.cashback || 0) + (quote.deliveryCashback || 0))} cashback will be added to your wallet after delivery</p>
            )}
          </section>
        )}

        <p className="co-policy">
          <b>Cancellation policy:</b> please double-check your order and address. You can cancel free of charge until the kitchen starts cooking.
          By placing this order you agree to our <Link to="/terms">Terms</Link>.
        </p>
      </div>

      {/* Pay bar, pinned to the bottom of the screen while the page scrolls */}
      <div className="co-pay">
        {(placeError || blocker) && <p className="co-pay__error" role="alert">{placeError || blocker}</p>}
        <div className="co-pay__row">
          <button type="button" className="co-pay__using" onClick={() => setChoosingPay(true)} disabled={!canChoosePay} aria-haspopup="dialog">
            <small>Pay using{canChoosePay && <ChevronDown />}</small>
            <b>{paidByWallet ? 'BiteVo Wallet' : canChoosePay && payBy === 'online' ? 'Pay online' : 'Cash on Delivery'}</b>
            <span>{paidByWallet ? 'Nothing to pay on delivery' : canChoosePay && payBy === 'online' ? 'UPI, cards, netbanking' : 'Pay cash or ask for a UPI QR code'}</span>
          </button>
          <button type="button" className="co-pay__btn" onClick={action.run} disabled={actionDisabled}>
            {placing ? (payingOnline ? 'Opening payment…' : 'Placing your order…') : action.label}
          </button>
        </div>
      </div>

      {choosingPay && (
        <Modal onClose={() => setChoosingPay(false)} label="Choose how to pay" className="co-paysheet">
          <h2>Pay using</h2>
          {[
            { key: 'online', title: 'Pay online', text: 'UPI, cards, netbanking (secured by Razorpay)' },
            { key: 'cod', title: 'Cash on Delivery', text: 'Pay cash or by UPI to the delivery partner' },
          ].map(o => (
            <label key={o.key} className={`co-payopt${payBy === o.key ? ' is-selected' : ''}`}>
              <input type="radio" name="pay" checked={payBy === o.key} onChange={() => { setPayBy(o.key); setChoosingPay(false); }} />
              <span><b>{o.title}</b><small>{o.text}</small></span>
            </label>
          ))}
        </Modal>
      )}

      {choosing && (
        <Modal onClose={() => setChoosing(false)} label="Choose a delivery address" className="co-addr-sheet">
          <h2>Deliver to</h2>
          <div className="addresses" role="radiogroup" aria-label="Delivery address">
            {addresses.map(a => (
              <label key={a._id} className={`address${addressId === a._id ? ' is-selected' : ''}`}>
                <input type="radio" name="address" checked={addressId === a._id} onChange={() => { setAddressId(a._id); setChoosing(false); }} />
                <span className="address__body">
                  <b>{a.label}</b>
                  <span>{addressLine(a)}</span>
                  {!deliversTo(a, siteConfig) && <small className="co-row__off">Service unavailable here</small>}
                </span>
                <button type="button" className="link" onClick={e => { e.preventDefault(); setChoosing(false); setEditing(a); }}>Edit</button>
              </label>
            ))}
          </div>
          <button type="button" className="btn btn--outline btn--block" onClick={() => { setChoosing(false); setEditing({}); }}>+ Add a new address</button>
        </Modal>
      )}

      {celebrate && <CouponCelebration coupon={celebrate} onClose={closeCelebration} />}

      {editing && (
        <AddressForm
          address={editing._id ? editing : null}
          startPlace={editing._id ? null : deliveryLocation?.place}
          onClose={() => setEditing(null)}
          onSaved={a => setAddressId(a._id)}
        />
      )}
    </div>
  );
}
