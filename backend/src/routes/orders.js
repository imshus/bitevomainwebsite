// Placing and following orders. Orders are written in the admin panel's format, so the kitchen
// sees them on the panel's Orders page and moves them along (preparing → out for delivery → delivered).
import crypto from 'node:crypto';
import { Router } from 'express';
import { store } from '../db/index.js';
import { objectId } from '../lib/ids.js';
import { HttpError, badRequest, conflict, notFound, unauthorized, nowIso, startOfToday, text, MIN } from '../lib/http.js';
import { serialize, money, normalizePhone, LIVE_STATUSES } from '../lib/rules.js';
import { CUSTOMER_CANCEL_REASON } from '../lib/settings.js';
import { deliveryCheck, distanceKm } from '../lib/maps.js';
import { sendMail, orderEmail } from '../lib/mail.js';
import { requireCustomer, optionalCustomer } from '../auth.js';
import { quote, hasOrdered } from '../pricing.js';
import { settleOffers } from '../lib/offers.js';
import { config } from '../config.js';
import { razorpayEnabled, createRazorpayOrder, signatureValid, confirmPayment, methodLabel, refundUnused, refundPayment } from '../lib/razorpay.js';
import { invoiceHtml, invoiceHeaders, invoicePath } from '../lib/invoice.js';
import { REASONS, cantRequest, paidFor, publicRequest } from '../lib/refundRequests.js';

export const router = Router();

// The bill for a cart; guests get prices too, but coupons and the wallet need a signed-in customer.
router.post('/quote', optionalCustomer, async (req, res) => {
  res.json(await quote(req.body || {}, req.customer));
});

router.use(requireCustomer);

// A rider-app position is used while it's under 3 minutes old.
const freshPoint = p => p?.lat != null && p?.lng != null && p.at && Date.now() - Date.parse(p.at) <= 3 * MIN;

// The delivery partner, once the kitchen assigns one (admin panel) or one takes the order (rider app).
// `requested`: assigned by the kitchen and waiting for the rider to accept; `accepted`: the rider accepted.
// Orders assigned before riders could accept have no `riderStatus`, so they count as accepted.
// Once accepted, `leg` says where the rider is heading: 'to_kitchen' (to pick the order up) until it's out for
// delivery, then 'to_customer'. With it: `position` { lat, lng, heading }, the rider's live position for the map,
// `locatedAt`, when the rider app last sent it, and `distanceKm` to the kitchen or the door (null without the
// kitchen's position, KITCHEN_LAT / KITCHEN_LNG, or a location on the address). `agent` is the rider's own record
// (its `location` is kept up to date by the rider app all the time; the order's `riderLocation` only while it's
// carried); it's looked up for the order page only. The position goes only to this order's customer, only
// while the order is live, and only when it's under 3 minutes old.
function riderOf(o, agent = null) {
  if (!o.agentId) return null;
  const rider = {
    name: o.agentName || 'Your delivery partner',
    status: o.riderStatus === 'requested' ? 'requested' : 'accepted',
    acceptedAt: o.riderAcceptedAt || null,
  };
  const leg = rider.status !== 'accepted' ? null
    : o.status === 'out_for_delivery' ? 'to_customer'
    : ['placed', 'preparing'].includes(o.status) ? 'to_kitchen' : null;
  if (!leg) return rider;
  const at = [o.riderLocation, agent?.location].filter(freshPoint).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] || null;
  const target = leg === 'to_kitchen' ? config.maps.kitchen : o.address?.lat != null ? o.address : null;
  return {
    ...rider,
    leg,
    position: at ? { lat: at.lat, lng: at.lng, heading: at.heading ?? null } : null,
    locatedAt: at ? at.at : null,
    distanceKm: at && target ? Math.round(distanceKm(at, target) * 10) / 10 : null,
  };
}

// The assigned rider's record, for the live position before pickup (order page only).
const riderAgent = o => (o.agentId && o.riderStatus !== 'requested' && LIVE_STATUSES.includes(o.status) ? store.findById('agents', o.agentId) : null);

// What the customer sees of an order (internal fields like dueAt stay on the server).
const publicOrder = (o, agent = null) => ({
  _id: o._id,
  orderNo: o.orderNo,
  placedAt: o.placedAt,
  status: o.status,
  items: o.items,
  subtotal: o.subtotal,
  deliveryFee: o.deliveryFee,
  discount: o.discount,
  cashback: o.cashback,
  deliveryCashback: o.deliveryCashback || 0,
  deliveryCashbackPaid: Boolean(o.deliveryCashbackPaidAt),
  couponCode: o.couponCode,
  total: o.total,
  walletUsed: o.walletUsed || 0,
  paymentMethod: o.paymentMethod,
  paidOnline: Boolean(o.payment),
  address: o.address || null,
  note: o.note || '',
  agentName: o.agentName || null,
  rider: riderOf(o, agent),
  dispatchedAt: o.dispatchedAt || null,
  deliveredAt: o.deliveredAt || null,
  cancelledAt: o.cancelledAt || null,
  cancelReason: o.cancelReason || null,
  refund: o.refund || null,
  rating: o.rating ?? null,
  history: (o.history || []).map(h => ({ status: h.status, at: h.at })),
});

async function ownOrder(req) {
  const order = await store.findById('orders', req.params.id);
  if (!order || order.customerId !== req.customer._id) throw notFound('We couldn’t find that order.');
  return order;
}

// Both first pay any cashback that's due, so a just-delivered order shows it as added to the wallet.
router.get('/', async (req, res) => {
  await settleOffers(req.customer._id);
  const orders = await store.find('orders', { customerId: req.customer._id }, { sort: { placedAt: -1 }, limit: 100 });
  res.json(orders.map(o => publicOrder(o)));
});

// The order page also gets the refund request (if any), whether one can be made, and what was paid how (to offer
// "back to UPI / card" only for orders paid online).
router.get('/:id', async (req, res) => {
  await settleOffers(req.customer._id);
  const order = await ownOrder(req);
  const request = await store.findOne('refundRequests', { orderId: order._id });
  res.json({
    ...publicOrder(order, await riderAgent(order)),
    refundRequest: publicRequest(request),
    canRequestRefund: !cantRequest(order, request),
    paid: paidFor(order),
  });
});

// "Request a refund": { reason (a REASONS key), details, to: 'wallet' | 'source', amount? }. Nothing is refunded
// here: an admin approves or rejects it in the admin panel.
router.post('/:id/refund-request', async (req, res) => {
  const saved = await serialize(`refund-request:${req.customer._id}`, async () => {
    const order = await ownOrder(req);
    const existing = await store.findOne('refundRequests', { orderId: order._id });
    const why = cantRequest(order, existing);
    if (why) throw conflict(why);
    const body = req.body || {};
    const reason = String(body.reason || '');
    if (!REASONS[reason]) throw badRequest('Choose what went wrong.');
    const details = text(body.details, 500);
    if (details.length < 10) throw badRequest('Tell us a little more about what went wrong (at least a few words).');
    const paid = paidFor(order);
    const to = body.to === 'source' ? 'source' : 'wallet';
    if (to === 'source' && paid.online <= 0) throw badRequest('This order wasn’t paid online, so a refund can only go to your BiteVo wallet.');
    const amount = body.amount == null || body.amount === '' ? paid.total : Math.round(Number(body.amount));
    if (!(amount >= 1 && amount <= paid.total)) throw badRequest(`Enter an amount from ₹1 to ₹${paid.total}.`);
    return store.insert('refundRequests', {
      orderId: order._id, orderNo: order.orderNo, customerId: req.customer._id, customerName: order.customerName, customerPhone: order.customerPhone,
      reason, reasonLabel: REASONS[reason], details, amount, to, status: 'pending', createdAt: nowIso(),
    });
  });
  res.status(201).json(publicRequest(saved));
});

// Everything an order must pass before it's placed or paid for online: the customer, the delivery number and
// address, and a bill that still adds up. Returns { bill, phone, address }.
async function checkOrder(body, customer) {
  if (!(await store.findById('customers', customer._id))) throw unauthorized(); // account deleted meanwhile
  if (!customer.name) throw badRequest('Add your name before placing an order.');
  // Deliveries need a mobile number. Accounts made with an email address give one here; it's kept as
  // `deliveryPhone`, never as `phone` (the verified sign-in number), so typing a number can't claim a phone account.
  const phone = customer.phone || normalizePhone(body.deliveryPhone);
  if (!phone) throw badRequest('Add a 10-digit mobile number for delivery.');
  const address = (customer.addresses || []).find(a => a._id === String(body.addressId || ''));
  if (!address) throw badRequest('Pick a delivery address.');
  const check = deliveryCheck(address);
  if (!check.deliverable) throw badRequest(`${check.message} Pick another address.`);

  const bill = await quote(body, customer);
  if (bill.unavailable.length) {
    throw badRequest(`${bill.unavailable.map(u => u.name).join(', ')} ${bill.unavailable.length > 1 ? 'are' : 'is'} no longer available. Remove ${bill.unavailable.length > 1 ? 'them' : 'it'} to continue.`, { unavailable: bill.unavailable });
  }
  if (!bill.items.length) throw badRequest('Your cart is empty.');
  if (bill.couponError) throw badRequest(bill.couponError);
  if (bill.storeItem?.error) throw badRequest(bill.storeItem.error);
  if (bill.itemTotal < bill.minOrderValue) throw badRequest(`The minimum order is ${money(bill.minOrderValue)}.`);

  // Prices may have changed since the customer last saw the bill.
  const expected = Number(body.expectedTotal);
  if (Number.isFinite(expected) && expected !== bill.total) {
    throw badRequest(`Your total changed to ${money(bill.total)}. Please check the bill and place the order again.`, { quote: bill });
  }
  return { bill, phone, address };
}

// Writes the order and its wallet payment. `online` is the confirmed Razorpay payment for an order paid online.
async function insertOrder(customer, body, { bill, phone, address }, online) {
  const now = new Date();
  const seq = (await store.count('orders', { placedAt: { $gte: new Date(startOfToday(now.getTime())).toISOString() } })) + 1;
  const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const _id = objectId(now);
  const orderNo = `BV${mmdd}-${String(seq).padStart(3, '0')}`;

  const saved = await store.insert('orders', {
    _id,
    orderNo,
    placedAt: now.toISOString(),
    customerId: customer._id, customerName: customer.name, customerPhone: phone,
    items: bill.items.map(({ isVeg, store: _, ...item }) => item),
    subtotal: bill.subtotal,
    deliveryFee: bill.deliveryFee,
    discount: bill.discount,
    cashback: bill.cashback,
    // Paid to the wallet by the website once the order is delivered (lib/offers.js), apart from coupon `cashback`.
    ...(bill.deliveryCashback > 0 && { deliveryCashback: bill.deliveryCashback, deliveryCashbackPaidAt: null }),
    couponCode: bill.coupon?.code ?? null,
    total: bill.total,
    // Paid online: "UPI", "Card"… (the admin panel offers refunds to it); otherwise cash on delivery or wallet.
    paymentMethod: online ? methodLabel(online.payment) : bill.paymentMethod,
    ...(online && {
      razorpayOrderId: online.record._id,
      payment: { provider: 'razorpay', orderId: online.record._id, paymentId: online.payment.id, amount: online.record.amount, method: online.payment.method || null },
    }),
    status: 'placed',
    agentId: null, agentName: null,
    deliveryMins: null, rating: null,
    isFirstOrder: !(await hasOrdered(customer._id)),
    walletUsed: bill.walletUsed,
    refund: null,
    history: [],
    // A copy of the address as it was when ordered (see cleanAddress in account.js for the fields).
    address: {
      label: address.label, line1: address.line1, line2: address.line2, landmark: address.landmark, pincode: address.pincode,
      area: address.area || '',
      ...(address.house && { house: address.house, building: address.building, city: address.city || '' }),
      ...(address.lat != null && { lat: address.lat, lng: address.lng, mapAddress: address.mapAddress || '' }),
    },
    note: text(body.note, 200),
    source: 'web',
    updatedAt: now.toISOString(),
  });
  if (bill.walletUsed > 0) {
    await store.insert('walletTxns', {
      customerId: customer._id, customerName: customer.name, customerPhone: phone,
      orderId: _id, type: 'payment', amount: -bill.walletUsed, note: `Order ${orderNo}`, at: now.toISOString(),
    });
  }
  if (!customer.phone && phone !== customer.deliveryPhone) await store.update('customers', customer._id, { deliveryPhone: phone });
  return saved;
}

// Paying online, step 1: check the order, then ask Razorpay for an order to pay (what's left after the wallet).
// The browser takes the payment in Razorpay's window and then places the order below with the payment.
router.post('/pay', async (req, res) => {
  if (!razorpayEnabled()) throw notFound('Online payment isn’t set up.');
  const customer = req.customer;
  const { bill, phone } = await checkOrder(req.body || {}, customer);
  if (bill.payable <= 0) throw badRequest('There’s nothing left to pay online for this order.');
  const rzp = await createRazorpayOrder(bill.payable, `bv-${Date.now()}`, { customerId: String(customer._id) });
  await store.insert('payments', { _id: rzp.id, customerId: customer._id, amount: bill.payable, total: bill.total, status: 'created', createdAt: nowIso() });
  res.json({
    keyId: config.razorpay.keyId, orderId: rzp.id, amount: rzp.amount, currency: rzp.currency,
    prefill: { name: customer.name, email: customer.email || '', contact: phone.replace(/\D/g, '').slice(-10) },
  });
});

// Places an order. Orders are placed one at a time, so a double-click can't spend the same wallet
// balance twice and order numbers (the panel's BVmmdd-NNN pattern) don't clash.
// Paid online: `payment` = { orderId, paymentId, signature } from Razorpay. The signature and the payment are
// checked with Razorpay first; if the order then can't be placed, the payment is refunded straight away.
router.post('/', async (req, res) => {
  const customer = req.customer;
  const body = req.body || {};
  let online = null;
  if (body.payment) {
    const { orderId, paymentId, signature } = body.payment;
    if (!razorpayEnabled()) throw badRequest('Online payment isn’t set up.');
    if (!signatureValid(String(orderId), String(paymentId), String(signature))) {
      throw badRequest('We couldn’t verify that payment. If money was taken, it will be refunded automatically.');
    }
    const record = await store.findById('payments', String(orderId));
    if (!record || record.customerId !== customer._id) throw badRequest('We couldn’t find that payment.');
    if (record.status === 'paid') return res.json(publicOrder(await store.findById('orders', record.orderId))); // a retry: already placed
    if (record.status !== 'created') throw conflict('This payment has been refunded. Please place the order again.');
    online = { record, payment: await confirmPayment(String(paymentId), record) };
  }

  let placed;
  try {
    placed = await serialize('orders', async () => {
      if (online) { // a double submit may have placed it a moment ago
        const fresh = await store.findById('payments', online.record._id);
        if (fresh.status === 'paid') return { order: await store.findById('orders', fresh.orderId), again: true };
        if (fresh.status !== 'created') throw conflict('This payment has been refunded. Please place the order again.');
      }
      const checked = await checkOrder(body, customer);
      if (online && checked.bill.payable !== online.record.amount) {
        throw badRequest(`Your total changed to ${money(checked.bill.total)}. Please check the bill and order again.`);
      }
      const order = await insertOrder(customer, body, checked, online);
      if (online) await store.update('payments', online.record._id, { status: 'paid', orderId: order._id, paymentId: online.payment.id, paidAt: nowIso() });
      return { order };
    });
  } catch (err) {
    if (!online || err.status === 409) throw err;
    // Paid, but the order couldn't be placed: give the money back now (settlePayments() retries if this fails).
    await refundUnused(online.record, online.payment.id, `Order not placed: ${err.message}`)
      .catch(e => console.error(`Refund of ${online.payment.id} failed, will retry: ${e.message}`));
    throw new HttpError(err.status || 400, `${err.message} The ${money(online.record.amount)} you paid is being refunded to your ${methodLabel(online.payment)} (3–5 working days).`);
  }
  res.status(placed.again ? 200 : 201).json(publicOrder(placed.order));
  // Confirmation email, if they gave an address. Its invoice link points at this API (API_PUBLIC_URL, or the address
  // this request came in on).
  if (!placed.again && customer.email) sendMail(orderEmail(customer, placed.order, { apiBase: config.apiUrl || `${req.protocol}://${req.get('host')}` }));
});

// The order's invoice (lib/invoice.js): the page itself for the signed-in customer (the website's order page
// links to it), and a link to it that works without signing in for a day (the app opens that in the phone's
// browser, where it can be saved as a PDF).
router.get('/:id/invoice', async (req, res) => {
  const order = await ownOrder(req);
  const nonce = crypto.randomBytes(16).toString('base64');
  invoiceHeaders(res, nonce);
  res.send(invoiceHtml(order, { nonce }));
});

router.get('/:id/invoice-link', async (req, res) => {
  const order = await ownOrder(req);
  res.json({ path: invoicePath(order._id, 1) });
});

// Customers can cancel until the kitchen accepts the order. Anything paid from the wallet goes back to it;
// anything paid online is refunded through Razorpay (or to the wallet, if that refund can't be made).
router.post('/:id/cancel', async (req, res) => {
  const saved = await serialize(req.customer._id, async () => {
    const order = await ownOrder(req);
    if (order.status !== 'placed') {
      throw badRequest(order.status === 'cancelled' ? 'This order is already cancelled.' : 'The kitchen has started on this order, so it can’t be cancelled here. Please call us.');
    }
    const at = nowIso();
    const online = order.payment?.provider === 'razorpay' ? order.payment : null;
    let sourceRefund = null;
    if (online) {
      sourceRefund = await refundPayment(online.paymentId, online.amount, { reason: CUSTOMER_CANCEL_REASON })
        .catch(err => { console.error(`Refund for cancelled order ${order.orderNo} failed, credited to the wallet: ${err.message}`); return null; });
    }
    const toWallet = (order.walletUsed || 0) + (online && !sourceRefund ? online.amount : 0);
    const paid = (order.walletUsed || 0) + (online ? online.amount : 0);
    const refund = !paid ? null
      : sourceRefund ? { amount: paid, to: 'source', razorpayRefundId: sourceRefund.id, refundStatus: sourceRefund.status || 'pending', ...(order.walletUsed > 0 && { wallet: order.walletUsed }) }
      : { amount: paid, to: 'wallet' };
    const updated = await store.update('orders', order._id, {
      status: 'cancelled', cancelReason: CUSTOMER_CANCEL_REASON, cancelledAt: at, refund, deliveryMins: null, rating: null, updatedAt: at,
    }, { push: { history: { status: 'cancelled', note: CUSTOMER_CANCEL_REASON, at, by: `${order.customerName} (website)` } } });
    if (toWallet > 0) {
      await store.insert('walletTxns', {
        customerId: order.customerId, customerName: order.customerName, customerPhone: order.customerPhone,
        orderId: order._id, type: 'refund', amount: toWallet, note: `Cancelled order ${order.orderNo}`, at,
      });
    }
    return updated;
  });
  res.json(publicOrder(saved));
});

router.post('/:id/rating', async (req, res) => {
  const order = await ownOrder(req);
  if (order.status !== 'delivered') throw badRequest('You can rate an order once it has been delivered.');
  const rating = Math.round(Number(req.body?.rating));
  if (!(rating >= 1 && rating <= 5)) throw badRequest('Pick 1 to 5 stars.');
  res.json(publicOrder(await store.update('orders', order._id, { rating, ratedAt: nowIso() })));
});
