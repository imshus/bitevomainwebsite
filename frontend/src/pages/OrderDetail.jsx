import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../state/auth.jsx';
import { useToast } from '../state/toast.jsx';
import { Loading, LoadError, CardSkeletons } from '../components/Sections.jsx';
import Confetti from '../components/Confetti.jsx';
import SignInPrompt from '../components/SignInPrompt.jsx';
import { Check, ChefHat, Bike, Star, MapPin, Receipt } from '../components/Icons.jsx';
import { StatusPill, useReorder } from './Orders.jsx';
import { money, formatWhen, formatTime, addressLine, ORDER_STATUS, LIVE_STATUSES } from '../lib/format.js';
import usePageTitle from '../lib/usePageTitle.js';

const REFRESH_MS = 15000;

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
              {state === 'now' && <p>{s.status === 'out_for_delivery' && order.agentName ? `${order.agentName} is on the way with your order.` : s.text}</p>}
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
  usePageTitle(order ? `Order #${order.orderNo}` : 'Your order');

  // When the kitchen moves the order along, say so (the page refreshes itself while it's live).
  const lastStatus = useRef(null);
  const load = () => api.order(id).then(o => {
    if (lastStatus.current && lastStatus.current !== o.status && STATUS_NEWS[o.status]) toast(STATUS_NEWS[o.status]);
    lastStatus.current = o.status;
    setOrder(o);
    setError(null);
  }, setError);
  useEffect(() => { if (customer) load(); }, [id, customer?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live orders refresh every few seconds while the page is open.
  const live = order && LIVE_STATUSES.includes(order.status);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [live]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = async () => {
    if (!window.confirm('Cancel this order?')) return;
    setCancelling(true);
    try {
      setOrder(await api.cancelOrder(order._id));
      toast('Your order has been cancelled.');
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
              <div className="bill__total"><dt>{order.status === 'delivered' ? 'Paid' : order.status === 'cancelled' ? 'Order total' : 'To pay on delivery'}</dt><dd>{money(order.total - order.walletUsed)}</dd></div>
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
            <p className="order-pay"><b>Payment</b>{order.paymentMethod === 'Wallet' ? 'Paid from BiteVo wallet' : 'Pay on delivery (cash or UPI)'}</p>
            {order.note && <p className="order-pay"><b>Note</b>{order.note}</p>}
            <div className="order-actions">
              {order.status === 'placed' && (
                <button type="button" className="btn btn--outline" onClick={cancel} disabled={cancelling}>{cancelling ? 'Cancelling…' : 'Cancel order'}</button>
              )}
              {!live && <button type="button" className="btn btn--red" onClick={() => reorder(order)}>Order again</button>}
              <Link to={`/support?order=${encodeURIComponent(order.orderNo)}`} className="btn btn--outline">Get help</Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
