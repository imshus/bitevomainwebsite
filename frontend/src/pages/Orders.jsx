import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../state/auth.jsx';
import { useCart } from '../state/cart.jsx';
import { useMenu } from '../state/menu.js';
import { useToast } from '../state/toast.jsx';
import { PageHero, Loading, LoadError, CardSkeletons } from '../components/Sections.jsx';
import { Receipt, ChevronRight } from '../components/Icons.jsx';
import SignInPrompt from '../components/SignInPrompt.jsx';
import { money, formatWhen, itemsSummary, ORDER_STATUS, LIVE_STATUSES } from '../lib/format.js';
import usePageTitle from '../lib/usePageTitle.js';

export function StatusPill({ status }) {
  const s = ORDER_STATUS[status] || { short: status, tone: 'grey' };
  return <span className={`status status--${s.tone}`}>{LIVE_STATUSES.includes(status) && <i className="status__dot" />}{s.short}</span>;
}

// Puts an old order's dishes back in the cart (skipping free items and anything no longer on the menu).
export function useReorder() {
  const cart = useCart();
  const toast = useToast();
  const navigate = useNavigate();
  const { data: menu } = useMenu();
  return order => {
    if (!menu) return;
    const byId = new Map(menu.products.map(p => [p._id, p]));
    let added = 0;
    let missing = 0;
    for (const item of order.items.filter(i => !i.free)) {
      const p = byId.get(item.productId);
      if (p?.isAvailable) { cart.setQty(p, cart.qtyOf(p._id) + item.qty); added++; } else missing++;
    }
    if (!added) { toast('Those dishes aren’t available right now.', 'error'); return; }
    if (missing) toast(`${missing} dish${missing > 1 ? 'es aren’t' : ' isn’t'} available right now, so we left ${missing > 1 ? 'them' : 'it'} out.`);
    navigate('/checkout');
  };
}

export default function Orders() {
  usePageTitle('My Orders');
  const { customer, ready } = useAuth();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);
  const reorder = useReorder();

  const load = () => { setError(null); api.orders().then(setOrders, setError); };
  useEffect(() => { if (customer) load(); }, [customer?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <PageHero compact title={<>My <em>orders</em></>}>Follow live orders and order your favourites again.</PageHero>
      <section className="section section--tight">
        <div className="container narrow">
          {!ready ? <Loading /> : !customer ? (
            <SignInPrompt text="Sign in to see your orders." />
          ) : error ? <LoadError error={error} onRetry={load} /> : !orders ? <CardSkeletons /> : !orders.length ? (
            <div className="empty">
              <div className="empty__icon"><Receipt /></div>
              <h3>No orders yet</h3>
              <p>Your first BiteVo meal is a few taps away.</p>
              <Link to="/menu" className="btn btn--red btn--lg">Browse the menu</Link>
            </div>
          ) : (
            <ul className="order-list">
              {orders.map((o, i) => (
                <li key={o._id} className={`order-card${LIVE_STATUSES.includes(o.status) ? ' is-live' : ''}`} style={{ '--i': Math.min(i, 8) }}>
                  <Link to={`/orders/${o._id}`} className="order-card__main">
                    <div className="order-card__top">
                      <span className="order-card__no">#{o.orderNo}</span>
                      <StatusPill status={o.status} />
                    </div>
                    <p className="order-card__items">{itemsSummary(o.items)}</p>
                    <div className="order-card__meta">
                      <span>{formatWhen(o.placedAt)}</span>
                      <b>{money(o.total)}</b>
                    </div>
                  </Link>
                  <div className="order-card__actions">
                    {LIVE_STATUSES.includes(o.status)
                      ? <Link to={`/orders/${o._id}`} className="btn btn--red btn--sm">Track order <ChevronRight /></Link>
                      : <button type="button" className="btn btn--outline btn--sm" onClick={() => reorder(o)}>Order again</button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
