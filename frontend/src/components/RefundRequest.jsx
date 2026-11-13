// "Request a refund" on the order page (backend lib/refundRequests.js): the customer says what went wrong and
// where the money should go (BiteVo wallet, or back to UPI / card for orders paid online). Only an admin makes
// refunds: they approve or reject requests in the admin panel. RefundStatus shows where one stands, on the order
// page and the Refunds page (also for a cancelled paid order, whose request is made for the customer, and for a
// payment that didn't become an order).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from './Modal.jsx';
import { api } from '../api.js';
import { money, formatWhen } from '../lib/format.js';

const REASONS = [
  { key: 'quality', label: 'Food quality or taste' },
  { key: 'missing', label: 'Items missing' },
  { key: 'wrong', label: 'Wrong items' },
  { key: 'late', label: 'Very late delivery' },
  { key: 'other', label: 'Something else' },
];

const where = (to, paymentMethod) => (to === 'source' ? `your ${paymentMethod && paymentMethod !== 'Cash on delivery' ? paymentMethod : 'original payment method'}` : 'your BiteVo wallet');

// While it's under review, by kind: a cancelled paid order, a payment without an order, or a request the
// customer made. `paid` ({ online, wallet, … }) splits a cancelled order's refund back to UPI / card and wallet.
function waiting(request, paymentMethod, paid) {
  const to = where(request.to, paymentMethod);
  if (request.kind === 'cancelled') {
    const split = request.to === 'source' && paid?.wallet > 0 && paid.online > 0
      ? `: ${money(paid.online)} to ${to} and ${money(paid.wallet)} to your BiteVo wallet` : ` to ${to}`;
    return `You cancelled this order, so we’ve asked our team to refund the ${money(request.amount)} you paid${split}. We’ll email you once it’s decided.`;
  }
  if (request.kind === 'no_order') return `The order wasn’t placed, so our team will refund the ${money(request.amount)} you paid to ${to}.`;
  return `We’re looking into it: ${String(request.reason || '').toLowerCase()}. You asked for ${money(request.amount)} to ${to}. We’ll email you once it’s decided.`;
}

const SINCE = { cancelled: 'Cancelled', no_order: 'Paid' };

// `title` and `to` (a link, e.g. to the order) are for the Refunds page; the order page shows "Refund request"
// and, with `allLink`, a link to the Refunds page.
export function RefundStatus({ request, paymentMethod, paid = null, title = 'Refund request', to = null, allLink = false }) {
  const tone = request.status === 'approved' ? 'ok' : request.status === 'rejected' ? 'no' : 'wait';
  const d = request.decision;
  return (
    <div className={`panel refund-status refund-status--${tone}`} aria-live="polite">
      <div className="refund-status__head">
        {to ? <Link to={to} className="refund-status__title">{title} ›</Link> : <b>{title}</b>}
        <span className="refund-status__pill">{tone === 'ok' ? 'Approved' : tone === 'no' ? 'Not approved' : 'Under review'}</span>
      </div>
      {tone === 'wait' && <p>{waiting(request, paymentMethod, paid)}</p>}
      {tone === 'ok' && d && (
        <p>
          {money(d.amount)} refunded{d.to === 'source' && d.wallet > 0
            ? `: ${money(d.amount - d.wallet)} to ${where('source', paymentMethod)} (5–7 working days) and ${money(d.wallet)} to your BiteVo wallet`
            : d.to === 'source' ? ` to ${where('source', paymentMethod)}. It reaches you in 5–7 working days` : ' to your BiteVo wallet, ready for your next order'}.
        </p>
      )}
      {tone === 'no' && <p>We couldn’t approve this refund.</p>}
      {request.note && <p className="refund-status__note"><b>From BiteVo:</b> {request.note}</p>}
      <small className="muted">
        {SINCE[request.kind] || 'Asked'} {formatWhen(request.createdAt)}{request.decidedAt ? ` · decided ${formatWhen(request.decidedAt)}` : ''}
        {allLink && <> · <Link to="/refunds">All your refunds</Link></>}
      </small>
    </div>
  );
}

export function RefundRequestForm({ order, onClose, onSent }) {
  const paid = order.paid || { total: order.total, online: 0 };
  const canSource = paid.online > 0;
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [to, setTo] = useState(canSource ? 'source' : 'wallet');
  const [amount, setAmount] = useState(String(paid.total));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const amountOk = Number(amount) >= 1 && Number(amount) <= paid.total;
  const ok = reason && details.trim().length >= 10 && amountOk;

  const send = async e => {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      await api.requestRefund(order._id, { reason, details: details.trim(), to, amount: Math.round(Number(amount)) });
      onSent();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} label="Request a refund" className="refund-form">
      <form onSubmit={send}>
        <h2>Request a refund</h2>
        <p className="muted">Order #{order.orderNo} · you paid {money(paid.total)}. Our team checks every request and replies by email.</p>

        <fieldset className="refund-form__group">
          <legend>What went wrong?</legend>
          {REASONS.map(r => (
            <label key={r.key} className={`refund-form__opt${reason === r.key ? ' is-on' : ''}`}>
              <input type="radio" name="reason" checked={reason === r.key} onChange={() => setReason(r.key)} />
              <span>{r.label}</span>
            </label>
          ))}
        </fieldset>

        <label className="field">
          <span>Tell us more</span>
          <textarea rows={3} maxLength={500} value={details} onChange={e => setDetails(e.target.value)} placeholder="e.g. The biryani was cold and the raita was missing." required />
        </label>

        <fieldset className="refund-form__group">
          <legend>Where should the money go?</legend>
          {canSource && (
            <label className={`refund-form__opt${to === 'source' ? ' is-on' : ''}`}>
              <input type="radio" name="to" checked={to === 'source'} onChange={() => setTo('source')} />
              <span>Back to {order.paymentMethod} <small>5–7 working days after approval{paid.wallet > 0 ? '; the part paid from your wallet goes back to the wallet' : ''}</small></span>
            </label>
          )}
          <label className={`refund-form__opt${to === 'wallet' ? ' is-on' : ''}`}>
            <input type="radio" name="to" checked={to === 'wallet'} onChange={() => setTo('wallet')} />
            <span>BiteVo wallet <small>Straight away once approved, for your next order</small></span>
          </label>
          {!canSource && <p className="muted refund-form__fine">This order was paid {paid.cash > 0 ? 'in cash' : 'from your wallet'}, so a refund goes to your BiteVo wallet.</p>}
        </fieldset>

        <label className="field">
          <span>Amount <i>(up to {money(paid.total)})</i></span>
          <input type="number" inputMode="numeric" min={1} max={paid.total} value={amount} onChange={e => setAmount(e.target.value)} required />
        </label>

        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn--red btn--block" disabled={busy || !ok}>{busy ? 'Sending…' : 'Send refund request'}</button>
        <p className="muted refund-form__fine">The refund is made only once our team approves it.</p>
      </form>
    </Modal>
  );
}
