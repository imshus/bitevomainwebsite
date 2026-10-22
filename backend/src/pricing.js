// Works out a cart's bill on the server. Prices, availability, coupons and the wallet balance always
// come from the database, never from the browser.
import { store } from './db/index.js';
import { config } from './config.js';
import { couponStatus, couponValue, money } from './lib/rules.js';
import { isStoreItem, freeCoffee } from './lib/offers.js';

const MAX_LINES = 30;
const MAX_QTY = 20;

export async function walletBalance(customerId) {
  const txns = await store.find('walletTxns', { customerId });
  return txns.reduce((s, t) => s + t.amount, 0);
}

// Non-cancelled orders that used a code (all customers, or one).
const couponUses = (code, customerId) =>
  store.count('orders', { couponCode: code, status: { $ne: 'cancelled' }, ...(customerId ? { customerId } : {}) });

// Has this customer had an order that wasn't cancelled?
export async function hasOrdered(customerId) {
  return (await store.count('orders', { customerId, status: { $ne: 'cancelled' } })) > 0;
}

// Cart lines → order items with today's prices. Unknown or sold-out dishes are reported, not priced.
async function priceLines(rawItems) {
  if (!Array.isArray(rawItems) || !rawItems.length) return { lines: [], unavailable: [] };
  const wanted = new Map();
  for (const item of rawItems.slice(0, MAX_LINES)) {
    const id = String(item?.productId || '');
    const qty = Math.round(Number(item?.qty) || 0);
    if (id && qty > 0) wanted.set(id, Math.min(MAX_QTY, (wanted.get(id) || 0) + qty));
  }
  const [products, categories] = await Promise.all([
    store.find('products', { _id: { $in: [...wanted.keys()] } }),
    store.find('categories'),
  ]);
  const byId = new Map(products.map(p => [p._id, p]));
  const labelOf = new Map(categories.map(c => [c.key, c.label || '']));
  const lines = [];
  const unavailable = [];
  for (const [productId, qty] of wanted) {
    const p = byId.get(productId);
    if (!p || !p.isAvailable) {
      unavailable.push({ productId, name: p?.name || 'A dish that’s no longer on the menu' });
      continue;
    }
    lines.push({
      productId: p._id, name: p.name, category: p.category, price: p.price, qty, isVeg: Boolean(p.isVeg),
      ...(isStoreItem(p, labelOf.get(p.category)) && { store: true }),
    });
  }
  return { lines, unavailable };
}

// Why a coupon can't be used on this cart, or null when it can.
async function couponProblem(coupon, subtotal, customer) {
  if (!coupon) return 'That code doesn’t exist.';
  const usedCount = coupon.usageLimit ? await couponUses(coupon.code) : 0;
  const status = couponStatus({ ...coupon, usedCount });
  if (status === 'expired') return `${coupon.code} has expired.`;
  if (status === 'used_up') return `${coupon.code} has been fully claimed.`;
  if (status !== 'active') return `${coupon.code} isn’t active right now.`;
  if (subtotal < coupon.minOrderValue) return `Add ${money(coupon.minOrderValue - subtotal)} more to use ${coupon.code}.`;
  if (!customer) return `Sign in to use ${coupon.code}.`;
  if (coupon.firstOrderOnly && (await hasOrdered(customer._id))) return `${coupon.code} is only for your first order.`;
  if ((await couponUses(coupon.code, customer._id)) >= (coupon.perUserLimit || 1)) return `You’ve already used ${coupon.code} the maximum number of times.`;
  if (coupon.discountType === 'free_item') {
    const free = await store.findById('products', coupon.freeItem?.productId);
    if (!free || !free.isAvailable) return `The free item for ${coupon.code} isn’t available right now.`;
  }
  return null;
}

const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');

/**
 * The full bill for a cart.
 * Returns { items, unavailable, itemTotal, subtotal, deliveryFee, discount, cashback, coupon, couponError,
 *           total, walletBalance, walletUsed, payable, paymentMethod, minOrderValue,
 *           firstOrder, freeDelivery, deliveryNote, freeCoffee, storeItem, deliveryCashback, offers }.
 * A free-item coupon, and the first order's free Cold Coffee, add their dish as a line marked `free`,
 * priced normally and taken off as discount (the way the admin panel reports coupon value).
 * Guests are quoted as new customers (first order, free delivery); the order is re-quoted once they sign in.
 */
export async function quote({ items, couponCode, useWallet }, customer) {
  const { lines, unavailable } = await priceLines(items);
  const itemTotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const { offers } = config;

  // Free delivery on the first few orders (cancelled ones don't count), then the delivery fee.
  const pastOrders = customer ? await store.count('orders', { customerId: customer._id, status: { $ne: 'cancelled' } }) : 0;
  const firstOrder = pastOrders === 0;
  const freeLeft = Math.max(0, config.freeDeliveryOrders - pastOrders); // including this order
  const deliveryFee = itemTotal === 0 || freeLeft > 0 ? 0 : config.deliveryFee;
  const deliveryNote = freeLeft > 0
    ? (customer ? `Free delivery: your ${ordinal(pastOrders + 1)} of ${config.freeDeliveryOrders} free deliveries` : `Free delivery on your first ${config.freeDeliveryOrders} orders`)
    : config.freeDeliveryOrders > 0 ? `${money(config.deliveryFee)} delivery after your first ${config.freeDeliveryOrders} orders` : null;

  // One ₹1 store item per order, once the other items reach storeUnlockAt.
  const storeQty = lines.filter(l => l.store).reduce((s, l) => s + l.qty, 0);
  const otherItemsTotal = lines.filter(l => !l.store).reduce((s, l) => s + l.price * l.qty, 0);
  const unlockAt = offers.storeUnlockAt;
  let storeError = null;
  if (unlockAt > 0 && storeQty > 1) storeError = 'Only one ₹1 store item per order. Remove the extra to continue.';
  else if (unlockAt > 0 && storeQty === 1 && otherItemsTotal < unlockAt) storeError = `Add ${money(unlockAt - otherItemsTotal)} more to unlock your ₹1 item.`;

  let coupon = null;
  let couponError = null;
  let discount = 0;
  let cashback = 0;
  const code = String(couponCode || '').trim().toUpperCase();
  if (code && lines.length) {
    const found = /^[A-Z0-9]{3,20}$/.test(code) ? await store.findOne('coupons', { code }) : null;
    couponError = await couponProblem(found, itemTotal, customer);
    if (!couponError) {
      const free = found.discountType === 'free_item' ? await store.findById('products', found.freeItem.productId) : null;
      ({ discount, cashback } = couponValue(found, itemTotal, deliveryFee, () => free?.price || 0));
      if (free) lines.push({ productId: free._id, name: free.name, category: free.category, price: free.price, qty: found.freeItem.qty, isVeg: Boolean(free.isVeg), free: true });
      coupon = {
        code: found.code, description: found.description, discountType: found.discountType,
        message: savingsMessage(found, discount, cashback),
      };
    }
  }

  // A free Cold Coffee on the first order of freeCoffeeFrom or more (skipped if none is available).
  let coffee = null;
  if (offers.freeCoffeeFrom > 0 && firstOrder && itemTotal >= offers.freeCoffeeFrom) {
    coffee = await freeCoffee();
    if (coffee) {
      lines.push({ productId: coffee._id, name: coffee.name, category: coffee.category, price: coffee.price, qty: 1, isVeg: Boolean(coffee.isVeg), free: true, offer: 'first_order_coffee' });
      discount += coffee.price;
    }
  }

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const total = Math.max(0, subtotal + deliveryFee - discount);
  const balance = customer ? await walletBalance(customer._id) : 0;
  const walletUsed = useWallet && customer ? Math.max(0, Math.min(balance, total)) : 0;
  const payable = total - walletUsed;
  const deliveryCashback = lines.length ? offers.deliveryCashback : 0;

  return {
    items: lines,
    unavailable,
    itemTotal,
    subtotal,
    deliveryFee,
    discount,
    cashback,
    coupon,
    couponError,
    total,
    walletBalance: balance,
    walletUsed,
    payable,
    paymentMethod: walletUsed > 0 && payable === 0 ? 'Wallet' : 'Cash on delivery',
    minOrderValue: config.minOrderValue,
    freeDeliveryAbove: null, // dropped: delivery is free on the first orders instead (see freeDelivery)
    // The "Order more, save more" offers on this bill:
    firstOrder,
    freeDelivery: { orders: config.freeDeliveryOrders, left: freeLeft, applied: freeLeft > 0 && itemTotal > 0 },
    deliveryNote,
    freeCoffee: coffee ? { name: coffee.name, value: coffee.price } : null,
    storeItem: unlockAt > 0 ? { unlockAt, otherItemsTotal, moreNeeded: Math.max(0, unlockAt - otherItemsTotal), unlocked: otherItemsTotal >= unlockAt, inCart: storeQty, error: storeError } : null,
    deliveryCashback,
    offers: [
      freeLeft > 0 && itemTotal > 0 && { key: 'free_delivery', text: deliveryNote },
      coffee && { key: 'first_order_coffee', text: `Free ${coffee.name} on your first order` },
      deliveryCashback > 0 && { key: 'delivery_cashback', text: `${money(deliveryCashback)} cashback to your wallet after delivery` },
    ].filter(Boolean),
  };
}

function savingsMessage(c, discount, cashback) {
  if (c.discountType === 'cashback') return `${money(cashback)} cashback to your wallet after delivery`;
  if (c.discountType === 'free_item') return `Free ${c.freeItem.qty > 1 ? `${c.freeItem.qty} × ` : ''}${c.freeItem.name} added`;
  if (c.discountType === 'free_delivery') return discount ? 'Free delivery applied' : 'Delivery is already free on this order';
  return `You save ${money(discount)}`;
}
