// Placing and following orders. Orders are written in the admin panel's format, so the kitchen
// sees them on the panel's Orders page and moves them along (preparing → out for delivery → delivered).
import { Router } from 'express';
import { store } from '../db/index.js';
import { objectId } from '../lib/ids.js';
import { badRequest, notFound, unauthorized, nowIso, startOfToday, text } from '../lib/http.js';
import { serialize, money, normalizePhone } from '../lib/rules.js';
import { getSettings, CUSTOMER_CANCEL_REASON } from '../lib/settings.js';
import { deliveryCheck } from '../lib/maps.js';
import { sendMail, orderEmail } from '../lib/mail.js';
import { requireCustomer, optionalCustomer } from '../auth.js';
import { quote, hasOrdered } from '../pricing.js';
import { settleOffers } from '../lib/offers.js';

export const router = Router();

// The bill for a cart; guests get prices too, but coupons and the wallet need a signed-in customer.
router.post('/quote', optionalCustomer, async (req, res) => {
  res.json(await quote(req.body || {}, req.customer));
});

router.use(requireCustomer);

// What the customer sees of an order (internal fields like dueAt stay on the server).
const publicOrder = o => ({
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
  address: o.address || null,
  note: o.note || '',
  agentName: o.agentName || null,
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
  res.json(orders.map(publicOrder));
});

router.get('/:id', async (req, res) => {
  await settleOffers(req.customer._id);
  res.json(publicOrder(await ownOrder(req)));
});

// Places an order. Orders are placed one at a time, so a double-click can't spend the same wallet
// balance twice and order numbers (the panel's BVmmdd-NNN pattern) don't clash.
router.post('/', async (req, res) => {
  const customer = req.customer;
  const order = await serialize('orders', async () => {
    if (!(await store.findById('customers', customer._id))) throw unauthorized(); // account deleted meanwhile
    if (!customer.name) throw badRequest('Add your name before placing an order.');
    // Deliveries need a mobile number. Accounts made with an email address give one here; it's kept as
    // `deliveryPhone`, never as `phone` (the verified sign-in number), so typing a number can't claim a phone account.
    const phone = customer.phone || normalizePhone(req.body?.deliveryPhone);
    if (!phone) throw badRequest('Add a 10-digit mobile number for delivery.');
    const address = (customer.addresses || []).find(a => a._id === String(req.body?.addressId || ''));
    if (!address) throw badRequest('Pick a delivery address.');
    const { zones } = await getSettings();
    if (!zones.includes(address.zone)) throw badRequest(`We don’t deliver to ${address.zone || 'that area'} right now. Pick another address.`);
    if (address.lat != null && !deliveryCheck(address).deliverable) throw badRequest('That address is outside our delivery range right now. Pick another address.');

    const bill = await quote(req.body || {}, customer);
    if (bill.unavailable.length) {
      throw badRequest(`${bill.unavailable.map(u => u.name).join(', ')} ${bill.unavailable.length > 1 ? 'are' : 'is'} no longer available. Remove ${bill.unavailable.length > 1 ? 'them' : 'it'} to continue.`, { unavailable: bill.unavailable });
    }
    if (!bill.items.length) throw badRequest('Your cart is empty.');
    if (bill.couponError) throw badRequest(bill.couponError);
    if (bill.storeItem?.error) throw badRequest(bill.storeItem.error);
    if (bill.itemTotal < bill.minOrderValue) throw badRequest(`The minimum order is ${money(bill.minOrderValue)}.`);

    // Prices may have changed since the customer last saw the bill.
    const expected = Number(req.body?.expectedTotal);
    if (Number.isFinite(expected) && expected !== bill.total) {
      throw badRequest(`Your total changed to ${money(bill.total)}. Please check the bill and place the order again.`, { quote: bill });
    }

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
      paymentMethod: bill.paymentMethod,
      status: 'placed',
      agentId: null, agentName: null,
      zone: address.zone,
      deliveryMins: null, rating: null,
      isFirstOrder: !(await hasOrdered(customer._id)),
      walletUsed: bill.walletUsed,
      refund: null,
      history: [],
      address: {
        label: address.label, line1: address.line1, line2: address.line2, landmark: address.landmark, zone: address.zone, pincode: address.pincode,
        ...(address.lat != null && { lat: address.lat, lng: address.lng, area: address.area || '', mapAddress: address.mapAddress || '' }),
      },
      note: text(req.body?.note, 200),
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
  });
  res.status(201).json(publicOrder(order));
  if (customer.email) sendMail(orderEmail(customer, order)); // confirmation email, if they gave an address
});

// Customers can cancel until the kitchen accepts the order. Anything paid from the wallet goes back to it.
router.post('/:id/cancel', async (req, res) => {
  const saved = await serialize(req.customer._id, async () => {
    const order = await ownOrder(req);
    if (order.status !== 'placed') {
      throw badRequest(order.status === 'cancelled' ? 'This order is already cancelled.' : 'The kitchen has started on this order, so it can’t be cancelled here. Please call us.');
    }
    const at = nowIso();
    const refund = order.walletUsed > 0 ? { amount: order.walletUsed, to: 'wallet' } : null;
    const updated = await store.update('orders', order._id, {
      status: 'cancelled', cancelReason: CUSTOMER_CANCEL_REASON, cancelledAt: at, refund, deliveryMins: null, rating: null, updatedAt: at,
    }, { push: { history: { status: 'cancelled', note: CUSTOMER_CANCEL_REASON, at, by: `${order.customerName} (website)` } } });
    if (refund) {
      await store.insert('walletTxns', {
        customerId: order.customerId, customerName: order.customerName, customerPhone: order.customerPhone,
        orderId: order._id, type: 'refund', amount: refund.amount, note: `Cancelled order ${order.orderNo}`, at,
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
