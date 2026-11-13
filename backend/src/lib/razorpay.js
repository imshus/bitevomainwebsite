// Online payments through Razorpay (UPI, cards, netbanking). Needs RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in
// .env (Razorpay dashboard → Account & Settings → API keys; rzp_test_… keys take test payments only).
//
// An online order is created only once its payment is in: routes/orders.js asks Razorpay for an order
// (POST /orders/pay), the browser takes the payment in Razorpay's own window, then POST /orders checks the
// signature and the payment with Razorpay before placing the BiteVo order. Each Razorpay order is recorded in
// "payments" (_id = Razorpay's order id, with the order the customer was placing in `request`): created → paid
// (BiteVo order placed). If a payment comes in but the app or browser never places the order (it lost track of
// the payment, the browser closed…), the server places it itself from `request` (routes/orders.js
// completePayment, via onUnclaimedPayment): when the app asks (POST /orders/pay/:id/complete) or from
// settlePayments() after 2 minutes. If it can't be placed (or the customer has ordered again since), it becomes
// 'held' (holdPayment), as do payments started before `request` was kept, after 15 minutes. The website never
// refunds anything itself: the admin panel lists held payments (No-order payments) and an admin refunds them
// there (→ 'refunded').
import crypto from 'node:crypto';
import { store } from '../db/index.js';
import { config } from '../config.js';
import { HttpError, nowIso, MIN, DAY } from './http.js';
import { serialize } from './rules.js';

// RAZORPAY_API_URL: only to point local tests at a stand-in for Razorpay; empty = Razorpay itself.
const API = (process.env.RAZORPAY_API_URL || 'https://api.razorpay.com/v1').replace(/\/+$/, '');
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

// The payment that came in for a Razorpay order (captured, or only authorised), or null.
export async function paymentFor(razorpayOrderId) {
  const { items = [] } = await orderPayments(razorpayOrderId);
  return items.find(p => p.status === 'captured' || p.status === 'authorized') || null;
}

// routes/orders.js hands over how to finish a paid order nobody placed (it places it, or holds the payment).
let unclaimedHandler = null;
export function onUnclaimedPayment(handler) { unclaimedHandler = handler; }
const capture = (id, amountPaise) => call('POST', `/payments/${encodeURIComponent(id)}/capture`, { amount: amountPaise, currency: 'INR' });

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

// ---- Webhook ---------------------------------------------------------------------------------------
// Razorpay's webhook (POST /api/payments/razorpay-webhook) tells the API about payments and refunds as they
// happen. The order flow above doesn't depend on it (each payment is checked with Razorpay when the order is
// placed, and the 3-minute check holds payments without an order); it keeps payments and refunds (made from the
// admin panel) up to date:
//   payment.captured / payment.authorized / order.paid: the payment is noted on its record (payments)
//   payment.failed: the reason is noted on its record
//   refund.processed / refund.failed: the refund's state is noted on the order (shown in the admin panel) and
//     on the payment record. A failed refund is logged, so it can be sent again from the Razorpay dashboard.

// X-Razorpay-Signature: HMAC-SHA256 of the request body with the webhook secret.
export function webhookSignatureValid(rawBody, signature) {
  if (!config.razorpay.webhookSecret || !rawBody || typeof signature !== 'string') return false;
  const expected = crypto.createHmac('sha256', config.razorpay.webhookSecret).update(rawBody).digest('hex');
  return signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function handleWebhook(event) {
  const type = String(event?.event || '');
  const payment = event?.payload?.payment?.entity || null;
  const refund = event?.payload?.refund?.entity || null;
  const at = nowIso();

  if (payment && ['payment.captured', 'payment.authorized', 'order.paid'].includes(type)) {
    const record = await store.findById('payments', String(payment.order_id || ''));
    if (record && !record.paymentId) await store.update('payments', record._id, { paymentId: payment.id, gatewayStatus: payment.status, updatedAt: at });
    return;
  }
  if (payment && type === 'payment.failed') {
    const record = await store.findById('payments', String(payment.order_id || ''));
    if (record) await store.update('payments', record._id, { lastError: String(payment.error_description || payment.error_code || 'failed').slice(0, 200), updatedAt: at });
    return;
  }
  if (refund && ['refund.processed', 'refund.failed', 'refund.created'].includes(type)) {
    const status = type === 'refund.processed' ? 'processed' : type === 'refund.failed' ? 'failed' : 'pending';
    const record = await store.findOne('payments', { paymentId: String(refund.payment_id || '') });
    if (record?.refundId === refund.id) await store.update('payments', record._id, { refundStatus: status, updatedAt: at });
    const order = record?.orderId ? await store.findById('orders', record.orderId) : null;
    if (order?.refund?.razorpayRefundId === refund.id && order.refund.refundStatus !== 'processed') {
      await store.update('orders', order._id, { refund: { ...order.refund, refundStatus: status, refundUpdatedAt: at }, updatedAt: at });
    }
    if (status === 'failed') console.error(`[razorpay] Refund ${refund.id} of payment ${refund.payment_id} FAILED: send it again from the Razorpay dashboard.`);
  }
}

// "UPI", "Card", "Netbanking"… (shown in the admin panel, which offers refunds to it).
export function methodLabel(payment) {
  return { upi: 'UPI', card: 'Card', netbanking: 'Netbanking', wallet: 'Online wallet', emi: 'EMI', paylater: 'Pay later' }[payment.method] || 'Online';
}

// A payment whose BiteVo order wasn't placed: kept for an admin to refund from the admin panel (Payments without
// an order), with who paid and why no order followed. Only a 'created' payment can be held, so it's held once.
export async function holdPayment(record, payment, reason) {
  const customer = await store.findById('customers', record.customerId);
  const at = nowIso();
  const held = await store.updateMany('payments', { _id: record._id, status: 'created' }, {
    status: 'held', paymentId: payment.id, method: methodLabel(payment), heldReason: String(reason).slice(0, 250), heldAt: at, updatedAt: at,
    customerName: customer?.name || '', customerPhone: customer?.phone || customer?.deliveryPhone || '',
  });
  if (held) console.log(`Payment ${payment.id} (₹${record.amount}) has no order; kept for a refund from the admin panel: ${reason}`);
  return held;
}

// Payments that came in without an order (closed browser, failed order) are held for the admin panel after a few
// minutes (captured first if they were only authorised, so Razorpay doesn't hand them back by itself).
export function settlePayments() {
  return serialize('payments', async () => {
    if (!razorpayEnabled()) return;
    // Two minutes gives the app or browser time to place the order itself after paying.
    const stale = new Date(Date.now() - 2 * MIN).toISOString();
    const since = new Date(Date.now() - 3 * DAY).toISOString();
    for (const record of await store.find('payments', { status: 'created', createdAt: { $lte: stale, $gte: since } })) {
      try {
        // Placed after all (the server stopped between writing the order and marking the payment): just mark it.
        const order = await store.findOne('orders', { razorpayOrderId: record._id });
        if (order) { await store.update('payments', record._id, { status: 'paid', orderId: order._id, paymentId: order.payment?.paymentId, paidAt: nowIso() }); continue; }
        // Started before the order was kept with the payment: refund after 15 minutes, as before.
        if (!record.request && Date.parse(record.createdAt) > Date.now() - 15 * MIN) continue;
        const paid = await paymentFor(record._id);
        if (!paid) {
          if (Date.parse(record.createdAt) < Date.now() - DAY) await store.updateMany('payments', { _id: record._id, status: 'created' }, { status: 'expired', updatedAt: nowIso() });
          continue;
        }
        if (record.request && unclaimedHandler) { await unclaimedHandler(record); continue; } // places it (or holds it)
        if (paid.status === 'authorized') await capture(paid.id, paid.amount);
        await holdPayment(record, paid, 'The order wasn’t placed after the payment');
      } catch (err) {
        console.error(`Payment check for ${record._id} failed: ${err.message}`);
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
