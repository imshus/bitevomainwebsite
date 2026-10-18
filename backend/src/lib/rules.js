// Business rules shared by several routes. Coupon maths matches the admin panel exactly.

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const money = n => inr.format(Math.round(n || 0));

// Order flow (owned by the admin panel): placed → preparing → out_for_delivery → delivered; or cancelled.
export const LIVE_STATUSES = ['placed', 'preparing', 'out_for_delivery'];

// Coupon lifecycle, as the admin panel defines it. `usedCount` comes from orders.
export function couponStatus(c, now = Date.now()) {
  if (c.expiresAt && Date.parse(c.expiresAt) < now) return 'expired';
  if (c.usageLimit && c.usedCount >= c.usageLimit) return 'used_up';
  if (!c.isActive) return 'paused';
  if (c.startsAt && Date.parse(c.startsAt) > now) return 'scheduled';
  return 'active';
}

// What a coupon is worth on an order: `discount` comes off the bill, `cashback` goes to the wallet
// when the order is delivered (the admin panel credits it). `priceOf` looks up the free item's price.
export function couponValue(coupon, subtotal, deliveryFee, priceOf) {
  const pct = cap => Math.min(Math.round((subtotal * coupon.discountValue) / 100), cap ?? Infinity);
  switch (coupon.discountType) {
    case 'percent': return { discount: pct(coupon.maxDiscount), cashback: 0 };
    case 'flat': return { discount: Math.min(coupon.discountValue, subtotal), cashback: 0 };
    case 'free_delivery': return { discount: deliveryFee, cashback: 0 };
    case 'free_item': return { discount: (priceOf(coupon.freeItem.productId) || 0) * coupon.freeItem.qty, cashback: 0 };
    case 'cashback': return { discount: 0, cashback: coupon.cashbackUnit === 'flat' ? coupon.discountValue : pct(coupon.maxDiscount) };
    default: return { discount: 0, cashback: 0 };
  }
}

// Indian mobile numbers: accepts "98765 43210", "+91 98765 43210", "09876543210" …
// Returns the stored form "+91 98765 43210", or null when it isn't a valid mobile number.
export function normalizePhone(input) {
  let digits = String(input || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

// "Chrome on Windows", "Safari on iOS", …
export function deviceName(userAgent = '') {
  const ua = userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unknown OS';
  return `${browser} on ${os}`;
}

// Strips IPv6-mapped prefixes so 127.0.0.1 reads normally.
export const clientIp = req => (req.ip || '').replace(/^::ffff:/, '') || null;

// Runs tasks for the same key one after another (e.g. one customer's orders), so wallet balances
// and order numbers can't be raced by double-clicks within this server process.
const queues = new Map();
export function serialize(key, task) {
  const run = (queues.get(key) || Promise.resolve()).then(task, task);
  const tail = run.catch(() => {});
  queues.set(key, tail);
  tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
  return run;
}
