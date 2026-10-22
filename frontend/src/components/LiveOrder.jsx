// "Your order is being prepared · Track" strip on the home and menu pages while an order is live.
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../state/auth.jsx';
import { ORDER_STATUS, LIVE_STATUSES } from '../lib/format.js';
import { ChefHat, Bike, Receipt, ChevronRight } from './Icons.jsx';

const PAGES = ['/'];
const ICONS = { placed: <Receipt />, preparing: <ChefHat />, out_for_delivery: <Bike /> };

export default function LiveOrder() {
  const { customer } = useAuth();
  const { pathname } = useLocation();
  const [order, setOrder] = useState(null);
  const shown = Boolean(customer) && PAGES.includes(pathname);

  useEffect(() => {
    if (!shown) return;
    let live = true;
    api.orders().then(list => { if (live) setOrder(list.find(o => LIVE_STATUSES.includes(o.status)) || null); }, () => {});
    return () => { live = false; };
  }, [shown, pathname, customer?._id]);

  if (!shown || !order) return null;
  return (
    <div className="container">
      <Link to={`/orders/${order._id}`} className={`live-order live-order--${order.status}`}>
        <span className="live-order__icon">{ICONS[order.status]}</span>
        <span className="live-order__text">
          <b>{ORDER_STATUS[order.status].label}</b>
          <small>Order #{order.orderNo}</small>
        </span>
        <span className="live-order__go">Track <ChevronRight /></span>
      </Link>
    </div>
  );
}
