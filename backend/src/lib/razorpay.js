// Online payments through Razorpay (UPI, cards, netbanking). Needs RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in
// .env (Razorpay dashboard → Account & Settings → API keys; rzp_test_… keys take test payments only).
//
// An online order is created only once its payment is in: routes/orders.js asks Razorpay for an order
// (POST /orders/pay), the browser takes the payment in Razorpay's own window, then POST /orders checks the
// signature and the payment with Razorpay before placing the BiteVo order. Each Razorpay order is recorded in
// "payments" (_id = Razorpay's order id): created → paid (BiteVo order placed) or refunded. If a payment comes
// in but no order follows (the browser closed, or the cart stopped adding up), settlePayments() refunds it.
import crypto from 'node:crypto';
import { store } from '../db/index.js';
import { config } from '../config.js';
import { HttpError, nowIso, MIN, DAY } from './http.js';
import { serialize } from './rules.js';

const API = 'https://api.razorpay.com/v1';
export const razorpayEnabled = () => Boolean(config.razorpay.keyId && config.razorpay.keySecret);
const paise = rupees => Math.round(rupees * 100);

async function call(method, path, body) {
  const auth = Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString('base64');
  let res, data;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Basic ${auth}`, ...(body && { 'Content-Type': 'application/json' }) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    data = await res.json().catch(() => null);
  } catch (err) {
    console.error(`[razorpay] ${method} ${path} failed: ${err.message}`);
    throw new HttpError(502, 'We couldn’t reach the payment service. Please try again in a minute.');
  }
  if (!res.ok) {
    console.error(`[razorpay] ${method} ${path}: HTTP ${res.status} ${data?.error?.code || ''} ${data?.error?.description || ''}`);
    throw Object.assign(new HttpError(502, 'The payment service didn’t accept that. Please try again.'), { razorpay: data?.error });
  }
  return data;
}

export const createRazorpayOrder = (rupees, receipt, notes) => call('POST', '/orders', { amount: paise(rupees), currency: 'INR', receipt, notes });
export const fetchPayment = id => call('GET', `/payments/${encodeURIComponent(id)}`);
const orderPayments = id => call('GET', `/orders/${encodeURIComponent(id)}/payments`);
const capture = (id, amountPaise) => call('POST', `/payments/${encodeURIComponent(id)}/capture`, { amount: amountPaise, currency: 'INR' });
export const refundPayment = (id, rupees, notes) => call('POST', `/payments/${encodeURIComponent(id)}/refund`, { amount: paise(rupees), notes });

// The browser hands back Razorpay's signature: HMAC-SHA256 of "order_id|payment_id" with our secret.
export function signatureValid(orderId, paymentId, signature) {
  const expected = crypto.createHmac('sha256', config.razorpay.keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return typeof signature === 'string' && signature.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// Makes sure a payment for this Razorpay order has really come in (capturing it if it was only authorised).
export async function confirmPayment(paymentId, record) {
  let payment = await fetchPayment(paymentId);
  if (payment.order_id !== record._id || payment.amount !== paise(record.amount) || payment.currency !== 'INR') {
    throw new HttpError(400, 'That payment doesn’t match this order. Please contact us if money was taken.');
  }
  if (payment.status === 'authorized') payment = await capture(paymentId, payment.amount);
  if (payment.status !== 'captured') throw new HttpError(402, 'Your payment didn’t go through. No money was taken; please try again.');
  return payment;
}

// "UPI", "Card", "Netbanking"… (shown in the admin panel, which offers refunds to it).
export function methodLabel(payment) {
  return { upi: 'UPI', card: 'Card', netbanking: 'Netbanking', wallet: 'Online wallet', emi: 'EMI', paylater: 'Pay later' }[payment.method] || 'Online';
}

// Gives back a payment whose BiteVo order wasn't placed. Claimed first, so it can't be refunded twice.
export async function refundUnused(record, paymentId, reason) {
  const claimed = await store.updateMany('payments', { _id: record._id, status: 'created' }, { status: 'refunding', paymentId, refundReason: reason, updatedAt: nowIso() });
  if (!claimed) return null;
  const refund = await refundPayment(paymentId, record.amount, { reason: reason.slice(0, 250) });
  await store.update('payments', record._id, { status: 'refunded', refundId: refund.id, refundedAt: nowIso() });
  console.log(`Refunded ₹${record.amount} (payment ${paymentId}): ${reason}`);
  return refund;
}

// Payments that came in without an order (closed browser, failed order) are refunded after a few minutes.
// A refund cut short ('refunding') is retried.
export function settlePayments() {
  return serialize('payments', async () => {
    if (!razorpayEnabled()) return;
    const stale = new Date(Date.now() - 15 * MIN).toISOString();
    const since = new Date(Date.now() - 3 * DAY).toISOString();
    for (const record of await store.find('payments', { status: 'created', createdAt: { $lte: stale, $gte: since } })) {
      try {
        // Placed after all (the server stopped between writing the order and marking the payment): just mark it.
        const order = await store.findOne('orders', { razorpayOrderId: record._id });
        if (order) { await store.update('payments', record._id, { status: 'paid', orderId: order._id, paymentId: order.payment?.paymentId, paidAt: nowIso() }); continue; }
        const { items = [] } = await orderPayments(record._id);
        const paid = items.find(p => p.status === 'captured' || p.status === 'authorized');
        if (!paid) {
          if (Date.parse(record.createdAt) < Date.now() - DAY) await store.updateMany('payments', { _id: record._id, status: 'created' }, { status: 'expired', updatedAt: nowIso() });
          continue;
        }
        if (paid.status === 'authorized') await capture(paid.id, paid.amount);
        await refundUnused(record, paid.id, 'The order wasn’t placed after the payment');
      } catch (err) {
        console.error(`Payment check for ${record._id} failed: ${err.message}`);
      }
    }
    for (const record of await store.find('payments', { status: 'refunding' })) {
      try {
        const refund = await refundPayment(record.paymentId, record.amount, { reason: (record.refundReason || '').slice(0, 250) });
        await store.update('payments', record._id, { status: 'refunded', refundId: refund.id, refundedAt: nowIso() });
      } catch (err) {
        // Already refunded (e.g. from the Razorpay dashboard): nothing left to do.
        if (/refunded/i.test(err.razorpay?.description || '')) await store.update('payments', record._id, { status: 'refunded', refundedAt: nowIso() });
        else console.error(`Refund for ${record._id} failed, will retry: ${err.message}`);
      }
    }
  });
}

export function startPaymentChecks(everyMs = 3 * MIN) {
  if (!razorpayEnabled()) return;
  const run = () => settlePayments().catch(err => console.error(`Payment check failed: ${err.message}`));
  run();
  setInterval(run, everyMs).unref();
}
