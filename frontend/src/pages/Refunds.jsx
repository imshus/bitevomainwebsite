// The Refunds page (/refunds): every refund the customer has asked for, or that was asked for them when they
// cancelled a paid order, and every online payment that didn't become an order, with where each stands (under
// review, approved, not approved). Only BiteVo's team makes refunds, from the admin panel; this page and the
// order page just show them. How to ask is explained underneath.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../state/auth.jsx';
import { PageHero, Loading, LoadError, CardSkeletons } from '../components/Sections.jsx';
import SignInPrompt from '../components/SignInPrompt.jsx';
import { RefundStatus } from '../components/RefundRequest.jsx';
import { Receipt, Shield, Wallet, ChevronRight } from '../components/Icons.jsx';
import { money } from '../lib/format.js';
import usePageTitle from '../lib/usePageTitle.js';

function RefundList() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const load = () => api.refunds().then(list => { setItems(list); setError(null); }, setError);
  useEffect(() => { load(); }, []);

  if (error) return <LoadError error={error} onRetry={load} />;
  if (!items) return <CardSkeletons count={2} />;
  const open = items.filter(i => i.status === 'pending');
  return (
    <>
      {items.length === 0 ? (
        <div className="panel refunds-empty">
          <span className="panel__icon"><Receipt /></span>
          <div>
            <b>No refunds yet</b>
            <p className="muted">If something was wrong with an order, open it in My orders and choose “Request a refund”.</p>
          </div>
        </div>
      ) : (
        <>
          <p className="refunds-summary muted">
            {open.length ? `${open.length} under review (${money(open.reduce((s, i) => s + (i.amount || 0), 0))}) · ` : ''}
            {items.length} in all
          </p>
          {items.map(i => (
            <RefundStatus
              key={`${i.type}-${i._id}`}
              request={i}
              paymentMethod={i.paymentMethod}
              paid={i.paid}
              title={i.type === 'payment' ? 'Payment without an order' : `Order #${i.orderNo}`}
              to={i.type === 'order' ? `/orders/${i.orderId}` : null}
            />
          ))}
        </>
      )}
    </>
  );
}

function HowItWorks() {
  return (
    <div className="panel">
      <div className="panel__head"><span className="panel__icon"><Shield /></span><h2>How refunds work</h2></div>
      <ul className="earn-list">
        <li>
          <span className="panel__icon"><Receipt /></span>
          <span>
            <b>Ask from the order</b>
            <small>Open a delivered order (up to 3 days after delivery) in <Link to="/orders">My orders</Link> and choose “Request a refund”: tell us what went wrong, how much, and where the money should go. If you cancel a paid order, we ask for you.</small>
          </span>
        </li>
        <li>
          <span className="panel__icon"><Shield /></span>
          <span>
            <b>Our team checks every request</b>
            <small>Nothing is refunded automatically. We approve or decline each request, tell you why if we can’t approve it, and email you the outcome.</small>
          </span>
        </li>
        <li>
          <span className="panel__icon"><Wallet /></span>
          <span>
            <b>Where the money goes</b>
            <small>To your BiteVo wallet straight away once approved, or back to your UPI / card for orders paid online (5–7 working days). Anything paid from your wallet or in cash comes back to the wallet.</small>
          </span>
        </li>
      </ul>
    </div>
  );
}

export default function Refunds() {
  usePageTitle('Refunds');
  const { customer, ready } = useAuth();

  return (
    <>
      <PageHero compact title={<>Your <em>refunds</em></>}>
        Every refund you’ve asked for, and where it stands.
      </PageHero>
      <section className="section section--tight">
        <div className="container narrow refunds">
          {!ready ? <Loading /> : !customer ? <SignInPrompt text="Sign in to see your refunds." /> : <RefundList key={customer._id} />}
          <HowItWorks />
          <Link to="/orders" className="panel panel--link">
            <span className="panel__icon"><Receipt /></span>
            <span><b>My orders</b><small>Ask for a refund from an order’s page</small></span>
            <ChevronRight />
          </Link>
        </div>
      </section>
    </>
  );
}
