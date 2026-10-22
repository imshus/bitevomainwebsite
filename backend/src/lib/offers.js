// "Order more, save more": a signup bonus for every new account and cashback on every delivered order
// (both wallet coins), free delivery on a customer's first few orders, a free Cold Coffee on the first
// order, and one ₹1 store item once the rest of the order is big enough. Amounts live in config.offers;
// the bill side (delivery, Cold Coffee, ₹1 store) is worked out in ../pricing.js.
//
// Wallet coins are walletTxns of type "cashback" (with `source` saying why), the same as referral rewards,
// so the admin panel's Wallet page lists them.
import crypto from 'node:crypto';
import { store } from '../db/index.js';
import { config } from '../config.js';
import { nowIso, DAY, MIN } from './http.js';
import { serialize } from './rules.js';

// Products in the ₹1 store: the same rule as the website's menu tabs (frontend/src/lib/menuTabs.js).
const STORE = /₹\s?1\b|\b1\s?item|rupee|rupay|\bstore\b/i;
export const isStoreItem = (product, categoryLabel = '') => product.price <= 1 || STORE.test(`${product.category} ${categoryLabel}`);

// The Cold Coffee given free on a first order: one called just "Cold Coffee" if there is one, else any
// available dish with it in the name (not a combo).
export async function freeCoffee() {
  const available = (await store.find('products', { isAvailable: true })).filter(p => p.type !== 'combo' && p.price > 1);
  return available.find(p => /^\s*cold\s+coffee\s*$/i.test(p.name)) || available.find(p => /\bcold\s+coffee\b/i.test(p.name)) || null;
}

// Each payment's wallet entry has an id worked out from what it's for, so it can't be paid twice: a
// second insert with the same id fails in MongoDB and is skipped. Marking the account or order as paid
// comes after, so if we stop in between, the next settleOffers() finds it unpaid, sees the entry and
// just marks it.
const txnId = key => crypto.createHash('sha256').update(key).digest('hex').slice(0, 24);

async function payOnce(_id, txn) {
  if (await store.findById('walletTxns', _id)) return;
  try {
    await store.insert('walletTxns', { _id, orderId: null, ...txn, type: 'cashback', by: 'BiteVo', at: nowIso() });
  } catch (err) {
    if (err.code !== 11000) throw err;
  }
}

// Fields for a new account: the bonus it's owed (paid straight after with paySignupBonus).
export const newAccountFields = () => (config.offers.signupBonus > 0 ? { signupBonus: config.offers.signupBonus, signupBonusPaidAt: null } : {});

export async function paySignupBonus(customer) {
  if (!(customer.signupBonus > 0) || customer.signupBonusPaidAt) return;
  await payOnce(txnId(`signup-bonus:${customer._id}`), {
    customerId: customer._id, customerName: customer.name || 'New customer', customerPhone: customer.phone || customer.deliveryPhone || '',
    source: 'signup', amount: customer.signupBonus, note: 'Signup bonus',
  });
  await store.update('customers', customer._id, { signupBonusPaidAt: nowIso() });
}

// Orders are placed with the cashback they'll earn (`deliveryCashback`); it's paid once the admin panel
// marks them delivered.
async function payOrderCashback(order) {
  await payOnce(txnId(`order-cashback:${order._id}`), {
    customerId: order.customerId, customerName: order.customerName, customerPhone: order.customerPhone,
    orderId: order._id, source: 'order', amount: order.deliveryCashback, note: `Cashback on order #${order.orderNo}`,
  });
  await store.update('orders', order._id, { deliveryCashbackPaidAt: nowIso() });
}

// Pays what's due: cashback on delivered orders, and any signup bonus that was cut short.
// `customerId` narrows it to one customer (when they open their wallet).
export function settleOffers(customerId) {
  return serialize('offers', async () => {
    const since = new Date(Date.now() - 30 * DAY).toISOString(); // orders are delivered within hours
    const delivered = await store.find('orders', {
      ...(customerId && { customerId }), status: 'delivered', deliveryCashback: { $gt: 0 }, deliveryCashbackPaidAt: null, placedAt: { $gte: since },
    });
    for (const order of delivered) await payOrderCashback(order);
    const owed = await store.find('customers', { ...(customerId && { _id: customerId }), signupBonus: { $gt: 0 }, signupBonusPaidAt: null });
    for (const customer of owed) await paySignupBonus(customer);
  });
}

// Orders are marked delivered in the admin panel, so the website checks every few minutes.
export function startOfferChecks(everyMs = 3 * MIN) {
  const run = () => settleOffers().catch(err => console.error(`Offer check failed: ${err.message}`));
  run();
  setInterval(run, everyMs).unref();
}
