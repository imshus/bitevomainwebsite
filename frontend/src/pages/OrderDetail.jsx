import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, invoiceUrl } from '../api.js';
import { useAuth } from '../state/auth.jsx';
import { useToast } from '../state/toast.jsx';
import { Loading, LoadError, CardSkeletons } from '../components/Sections.jsx';
import Confetti from '../components/Confetti.jsx';
import SignInPrompt from '../components/SignInPrompt.jsx';
import { Check, ChefHat, Bike, Star, MapPin, Receipt } from '../components/Icons.jsx';
import { StatusPill, useReorder } from './Orders.jsx';
import { money, formatWhen, formatTime, addressLine, ORDER_STATUS, LIVE_STATUSES } from '../lib/format.js';
import usePageTitle from '../lib/usePageTitle.js';
import { useLiveOrders } from '../lib/live.js';
import { useLiveTrip } from '../lib/eta.js';
import { useConfig } from '../state/menu.js';
import { lazyLoad, LazyPart } from '../lib/lazy.js';
import { RefundRequestForm, RefundStatus } from '../components/RefundRequest.jsx';

// The live map (Leaflet + OpenStreetMap) is its own file, fetched only for an order that's on its way.
const RiderMap = lazyLoad(() => import('../components/RiderMap.jsx'));

const REFRESH_MS = 5000; // while the order is live and the live socket is down, so steps show within seconds
const PUSHED_REFRESH_MS = 30000; // while live updates arrive over the WebSocket

const STATUS_NEWS = {
  preparing: 'The kitchen has accepted your order and started cooking!',
  out_for_delivery: 'Your order is on its way!',
  delivered: 'Delivered — enjoy your meal!',
  cancelled: 'Your order was cancelled.',
};

const STEPS = [
  { status: 'placed', title: 'Order placed', text: 'Waiting for the kitchen to accept it.', icon: <Receipt /> },
  { status: 'preparing', title: 'Being prepared', text: 'Our chefs are cooking your food fresh.', icon: <ChefHat /> },
  { status: 'out_for_delivery', title: 'Out for delivery', text: 'Your order is on its way.', icon: <Bike /> },
  { status: 'delivered', title: 'Delivered', text: 'Enjoy your meal!', icon: <Check /> },
];

// When each step happened, from the order's history (the kitchen's actions in the admin panel).
function stepTime(order, status) {
  if (status === 'placed') return order.placedAt;
  if (status === 'delivered') return order.deliveredAt;
  if (status === 'out_for_delivery') return order.dispatchedAt;
  return [...order.history].reverse().find(h => h.status === status)?.at || null;
}

const firstName = name => String(name || '').trim().split(/\s+/)[0] || 'Your delivery partner';

// The delivery partner's live status: who's bringing the order, how far they are (from the rider app's position
// and the address's location) and, while their position is known, when the order arrives (lib/eta.js: the ride
// to the kitchen, any cooking still left, the ride to the door). It updates with the page, every few seconds
// while the order is live. A rider the kitchen assigned shows by name only once they accept (they may
// decline, and then someone else is assigned).
function RiderCard({ order }) {
  const { data: config } = useConfig();
  const trip = useLiveTrip(order, config);
  const r = order.rider;
  const s = order.status;
  if (s === 'cancelled' || (s === 'delivered' && !r)) return null;
  let tone; let chip = null; let title; let text;
  const name = r && r.status !== 'requested' ? firstName(r.name) : null;
  if (s === 'delivered') {
    tone = 'done'; chip = 'Delivered'; title = name;
    text = order.deliveredAt ? `Delivered your order at ${formatTime(order.deliveredAt)}.` : 'Delivered your order.';
  } else if (!name) {
    tone = 'wait'; title = r ? 'Being assigned' : 'Not assigned yet';
    text = r ? 'Finding a delivery partner for your order…'
      : s === 'placed' ? 'A delivery partner is assigned once the kitchen accepts your order.' : 'We’re assigning a delivery partner for your order.';
  } else if (s === 'out_for_delivery') {
    tone = 'live'; chip = 'On the way'; title = name;
    // With the map showing, its chip gives the arrival time and road distance; the card doesn't repeat it.
    text = r.distanceKm == null ? `Picked up your order${order.dispatchedAt ? ` at ${formatTime(order.dispatchedAt)}` : ''} and is on the way.`
      : r.distanceKm < 0.2 ? 'Almost at your door.' : r.position ? 'Is on the way to you with your order.' : `${r.distanceKm} km away from you.`;
  } else {
    // Accepted, before pickup: on the way to the kitchen (or already there) when the rider app shares where they are.
    tone = 'set'; title = name;
    const atKitchen = r.distanceKm != null && r.distanceKm < 0.1;
    chip = !r.position ? 'Assigned' : atKitchen ? 'At kitchen' : 'Picking up';
    text = !r.position ? 'Will pick up your order as soon as it’s ready.'
      : atKitchen ? 'Is at the kitchen and will pick up your order as soon as it’s ready.'
      : r.distanceKm != null ? `Is on the way to the kitchen, ${r.distanceKm} km away from it, to pick up your order.`
      : 'Is on the way to the kitchen to pick up your order.';
  }
  const showMap = r?.position && (tone === 'live' || tone === 'set');
  const eta = showMap ? trip.eta : null;
  const arrivingNow = tone === 'live' && r.distanceKm != null && r.distanceKm < 0.2;
  return (
    <div className={`panel rider-card rider-card--${tone}`}>
      <div className="rider-card__row" aria-live="polite">
        <span className="rider-card__avatar" aria-hidden="true">{name ? name[0].toUpperCase() : <Bike />}</span>
        <div className="rider-card__text">
          <span className="rider-card__top">
            <small>Delivery partner</small>
            {chip && <span className="rider-card__chip"><i aria-hidden="true" />{chip}</span>}
          </span>
          <b>{title}</b>
          <p>{text}</p>
          {eta && (
            <p className="rider-card__eta">
              {arrivingNow ? <b>Arriving now</b> : <><b>Arriving in ~{eta.minutes} min</b><span>by {formatTime(eta.by)}</span></>}
            </p>
          )}
        </div>
      </div>
      {/* The live map, while the rider app is sending the rider's position: to the kitchen, then to you. */}
      {showMap && (
        <LazyPart>
          <RiderMap rider={r.position} home={trip.home} kitchen={trip.kitchen} leg={r.leg} route={trip.route} eta={trip.eta} distanceKm={r.distanceKm} />
        </LazyPart>
      )}
    </div>
  );
}

function Tracker({ order }) {
  const current = STEPS.findIndex(s => s.status === order.status);
  return (
    <ol className="tracker">
      {STEPS.map((s, i) => {
        const state = i < current || order.status === 'delivered' ? 'done' : i === current ? 'now' : 'next';
        const at = state !== 'next' && stepTime(order, s.status);
        return (
          <li key={s.status} className={`tracker__step is-${state} tracker__step--${s.status}`} style={{ '--s': i }}>
            <span className="tracker__icon">{s.icon}</span>
            <div>
              <b>{s.title}{at && <time> · {formatTime(at)}</time>}</b>
              {state === 'now' && <p>{s.text}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Rating({ order, onRated }) {
  const [hover, setHover] = useState(0);
  const toast = useToast();
  const rate = async n => {
    try {
      onRated(await api.rateOrder(order._id, n));
      toast('Thanks for rating your order!');
    } catch (err) { toast(err.message, 'error'); }
  };
  const shown = hover || order.rating || 0;
  return (
    <div className="rating">
      <b>{order.rating ? 'Your rating' : 'How was your food?'}</b>
      <div className="rating__stars" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" className={n <= shown ? 'is-on' : ''} onMouseEnter={() => setHover(n)} onClick={() => rate(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`}>
            <Star />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  const { state } = useLocation();
  const { customer, ready } = useAuth();
  const toast = useToast();
  const reorder = useReorder();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [askingRefund, setAskingRefund] = useState(false);
  usePageTitle(order ? `Order #${order.orderNo}` : 'Your order');

  // When the kitchen moves the order along, say so (the page refreshes itself while it's live).
  const lastStatus = useRef(null);
  const lastRider = useRef(undefined);
  const load = () => api.order(id).then(o => {
    if (lastStatus.current && lastStatus.current !== o.status && STATUS_NEWS[o.status]) toast(STATUS_NEWS[o.status]);
    else {
      // …and when a delivery partner accepts it.
      const rider = o.rider?.status === 'accepted' ? o.rider.name : null;
      if (lastRider.current !== undefined && rider && rider !== lastRider.current && o.status !== 'out_for_delivery') {
        toast(`${firstName(rider)} accepted your order and will pick it up once it’s ready.`);
      }
    }
    lastRider.current = o.rider?.status === 'accepted' ? o.rider.name : null;
    lastStatus.current = o.status;
    setOrder(o);
    setError(null);
  }, setError);
  useEffect(() => { if (customer) load(); }, [id, customer?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pushed the moment the kitchen or the rider changes the order (lib/live.js); then the refresh below is only a
  // safety net. Without the socket, live orders refresh every few seconds while the page is open.
  const liveUp = useLiveOrders(m => { if (m.type === 'resync' || m.id === id) load(); }, customer?._id);
  const live = order && LIVE_STATUSES.includes(order.status);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => { if (!document.hidden) load(); }, liveUp ? PUSHED_REFRESH_MS : REFRESH_MS);
    return () => clearInterval(t);
  }, [live, liveUp]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = async () => {
    if (!window.confirm('Cancel this order?')) return;
    setCancelling(true);
    try {
      setOrder(await api.cancelOrder(order._id));
      toast('Your order has been cancelled.');
      load(); // picks up whether a refund can still be asked for
    } catch (err) {
      toast(err.message, 'error');
      load();
    } finally { setCancelling(false); }
  };

  if (!ready) return <div className="container narrow section"><Loading /></div>;
  if (!customer) return <div className="container narrow section"><SignInPrompt text="Sign in to see this order." /></div>;
  if (error) return <div className="container narrow section"><LoadError error={error} onRetry={load} /></div>;
  if (!order) return <div className="container narrow section"><CardSkeletons count={2} /></div>;

  const status = ORDER_STATUS[order.status];
  return (
    <section className="section section--order">
      <div className="container narrow">
        <Link to="/orders" className="back-link">← All orders</Link>

        {state?.justPlaced && order.status === 'placed' && (
          <div className="placed-banner">
            <span className="placed-banner__tick">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path className="draw" d="M5 12.5 10 17.5 19 7.5" /></svg>
              <Confetti />
            </span>
            <div>
              <b>Order placed!</b>
              <p>We’ve sent it to the kitchen. This page updates by itself as your food gets ready.</p>
            </div>
          </div>
        )}

        <div className="order-head">
          <div>
            <h1>Order #{order.orderNo}</h1>
            <p className="muted">{formatWhen(order.placedAt)}</p>
          </div>
          <StatusPill status={order.status} />
        </div>

        {order.status === 'cancelled' ? (
          <div className="panel panel--cancelled">
            <b>{status.label}</b>
            <p>{order.cancelReason}{order.cancelledAt ? ` · ${formatWhen(order.cancelledAt)}` : ''}</p>
            {order.refund && <p>{money(order.refund.amount)} refunded to {order.refund.to === 'wallet' ? 'your BiteVo wallet' : 'your original payment method'}.</p>}
          </div>
        ) : (
          <div className="panel"><Tracker order={order} /></div>
        )}

        <RiderCard order={order} />

        {order.refundRequest && <RefundStatus request={order.refundRequest} paymentMethod={order.paymentMethod} />}

        {order.status === 'delivered' && <div className="panel"><Rating order={order} onRated={setOrder} /></div>}

        <div className="order-grid">
          <div className="panel">
            <h2>Items</h2>
            <ul className="summary__lines">
              {order.items.map((i, n) => (
                <li key={n} className="line">
                  <div className="line__info">
                    <span className="line__name">{i.qty} × {i.name}</span>
                    <span className="line__price">{i.free ? <><s>{money(i.price * i.qty)}</s> FREE</> : money(i.price * i.qty)}</span>
                  </div>
                </li>
              ))}
            </ul>
            <dl className="bill">
              <div><dt>Item total</dt><dd>{money(order.subtotal)}</dd></div>
              <div><dt>Delivery fee</dt><dd>{order.deliveryFee ? money(order.deliveryFee) : <span className="free">FREE</span>}</dd></div>
              {order.discount > 0 && <div className="bill__save"><dt>{order.couponCode ? `Offer (${order.couponCode})` : 'Offers'}</dt><dd>−{money(order.discount)}</dd></div>}
              {order.walletUsed > 0 && <div className="bill__save"><dt>Paid from wallet</dt><dd>−{money(order.walletUsed)}</dd></div>}
              <div className="bill__total"><dt>{order.paidOnline ? 'Paid online' : order.status === 'delivered' ? 'Paid' : order.status === 'cancelled' ? 'Order total' : 'To pay on delivery'}</dt><dd>{money(order.total - order.walletUsed)}</dd></div>
              {order.cashback > 0 && order.status !== 'cancelled' && (
                <p className="bill__hint bill__hint--green">{money(order.cashback)} cashback {order.status === 'delivered' ? 'added to' : 'goes to'} your wallet{order.status === 'delivered' ? '' : ' after delivery'}</p>
              )}
              {order.deliveryCashback > 0 && order.status !== 'cancelled' && (
                <p className="bill__hint bill__hint--green">
                  {order.deliveryCashbackPaid ? `${money(order.deliveryCashback)} order cashback added to your wallet` : `${money(order.deliveryCashback)} order cashback goes to your wallet after delivery`}
                </p>
              )}
            </dl>
          </div>
          <div className="panel">
            <h2>Delivery</h2>
            {order.address && (
              <p className="order-address"><MapPin /><span><b>{order.address.label}</b>{addressLine(order.address)}</span></p>
            )}
            <p className="order-pay"><b>Payment</b>{order.paidOnline ? `Paid online (${order.paymentMethod})` : order.paymentMethod === 'Wallet' ? 'Paid from BiteVo wallet' : 'Pay on delivery (cash or UPI)'}</p>
            {order.note && <p className="order-pay"><b>Note</b>{order.note}</p>}
            <div className="order-actions">
              {order.status === 'placed' && (
                <button type="button" className="btn btn--outline" onClick={cancel} disabled={cancelling}>{cancelling ? 'Cancelling…' : 'Cancel order'}</button>
              )}
              {!live && <button type="button" className="btn btn--red" onClick={() => reorder(order)}>Order again</button>}
              <a href={invoiceUrl(order._id)} target="_blank" rel="noreferrer" className="btn btn--outline">Invoice</a>
              {order.canRequestRefund && <button type="button" className="btn btn--outline" onClick={() => setAskingRefund(true)}>Request a refund</button>}
              <Link to={`/support?order=${encodeURIComponent(order.orderNo)}`} className="btn btn--outline">Get help</Link>
            </div>
          </div>
        </div>
      </div>
      {askingRefund && (
        <RefundRequestForm order={order} onClose={() => setAskingRefund(false)}
          onSent={() => { setAskingRefund(false); toast('Refund request sent. We’ll email you once it’s reviewed.'); load(); }} />
      )}
    </section>
  );
}
