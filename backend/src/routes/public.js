// Public, no-sign-in routes: site settings, the menu, current offers and the support form.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { store } from '../db/index.js';
import { config } from '../config.js';
import { badRequest, nowIso, text, MIN } from '../lib/http.js';
import { couponStatus, normalizePhone, clientIp } from '../lib/rules.js';
import { getSettings } from '../lib/settings.js';
import { optionalCustomer } from '../auth.js';
import { emailSignInEnabled } from '../lib/mail.js';

export const router = Router();

router.get('/config', async (req, res) => {
  const { zones } = await getSettings();
  res.json({
    zones,
    deliveryFee: config.deliveryFee,
    freeDeliveryOrders: config.freeDeliveryOrders, // delivery is free on each customer's first orders
    freeDeliveryAbove: null, // dropped (kept so older pages don't break)
    minOrderValue: config.minOrderValue,
    // "Order more, save more" (0 = off): signup bonus and per-order cashback (wallet coins), the order
    // total that gets a first order its free Cold Coffee, and what unlocks one ₹1 store item.
    offers: config.offers,
    otpDevMode: config.otpDevMode,
    googleClientId: config.googleClientId || null, // shows "Continue with Google" when set
    emailLogin: emailSignInEnabled(), // shows "Sign in with email"
    referral: config.referral.enabled ? { reward: config.referral.reward, ordersNeeded: config.referral.orders } : null,
    // null when no Google Maps key is set: addresses are then typed in by hand.
    maps: config.maps.serverKey
      ? { browserKey: config.maps.browserKey, kitchen: config.maps.kitchen, radiusKm: config.maps.radiusKm || null }
      : null,
  });
});

// Photos the admin panel uploaded are stored as /uploads/<file> on the admin API. Unsplash links the
// panel saves as small thumbnails are asked for at the website's card size instead.
function imageUrl(src) {
  if (!src) return '';
  if (src.startsWith('/uploads/')) return `${config.adminPublicUrl}${src}`;
  try {
    const url = new URL(src);
    if (url.hostname === 'images.unsplash.com' && Number(url.searchParams.get('w')) < 600) {
      url.searchParams.set('w', '600');
      url.searchParams.set('h', '450');
      url.searchParams.set('fit', 'crop');
      return url.toString();
    }
  } catch { /* not a full URL: leave it as it is */ }
  return src;
}

const publicProduct = p => ({
  _id: p._id,
  type: p.type === 'combo' ? 'combo' : 'single',
  name: p.name,
  heading: p.heading || '',
  category: p.category,
  price: p.price,
  mrp: p.mrp ?? null,
  isVeg: Boolean(p.isVeg),
  description: p.description || '',
  prepTimeMins: p.prepTimeMins || null,
  isAvailable: Boolean(p.isAvailable),
  isBestseller: Boolean(p.isBestseller),
  image: imageUrl(p.image),
  comboItems: p.type === 'combo' ? (p.comboItems || []).map(i => ({ name: i.name, qty: i.qty })) : undefined,
});

// The whole menu: categories in the panel's order (empty ones left out), newest dishes first and
// sold-out dishes last within each category.
router.get('/menu', async (req, res) => {
  const [categories, products] = await Promise.all([
    store.find('categories', {}, { sort: { order: 1 } }),
    store.find('products', {}, { sort: { createdAt: -1 } }),
  ]);
  const used = new Set(products.map(p => p.category));
  const rank = new Map(categories.map((c, i) => [c.key, i]));
  const sorted = products
    .filter(p => rank.has(p.category))
    .sort((a, b) => rank.get(a.category) - rank.get(b.category) || Number(b.isAvailable) - Number(a.isAvailable));
  res.set('Cache-Control', 'no-cache');
  res.json({
    categories: categories.filter(c => used.has(c.key)).map(c => ({ key: c.key, label: c.label, image: imageUrl(c.image) })),
    products: sorted.map(publicProduct),
  });
});

// Offers a customer can use right now. Signed-in customers don't see first-order offers once they've ordered.
router.get('/offers', optionalCustomer, async (req, res) => {
  const coupons = await store.find('coupons', { isActive: true });
  const live = [];
  for (const c of coupons) {
    const usedCount = c.usageLimit ? await store.count('orders', { couponCode: c.code, status: { $ne: 'cancelled' } }) : 0;
    if (couponStatus({ ...c, usedCount }) === 'active') live.push(c);
  }
  const ordered = req.customer && (await store.count('orders', { customerId: req.customer._id, status: { $ne: 'cancelled' } })) > 0;
  res.json(live
    .filter(c => !(ordered && c.firstOrderOnly))
    .sort((a, b) => a.minOrderValue - b.minOrderValue)
    .map(c => ({
      code: c.code,
      description: c.description,
      discountType: c.discountType,
      discountValue: c.discountValue,
      maxDiscount: c.maxDiscount ?? null,
      cashbackUnit: c.cashbackUnit ?? null,
      freeItem: c.freeItem ? { name: c.freeItem.name, qty: c.freeItem.qty } : null,
      minOrderValue: c.minOrderValue,
      firstOrderOnly: Boolean(c.firstOrderOnly),
      expiresAt: c.expiresAt,
    })));
});

// ---- Support form ---------------------------------------------------------------------
// Messages are saved in the "supportMessages" collection for the team to follow up.

const TOPICS = ['Order issue', 'Payment or refund', 'Delivery', 'Account', 'Feedback', 'Other'];
const supportLimiter = rateLimit({
  windowMs: 60 * MIN, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'You’ve sent a few messages already. Please call us if it’s urgent.' },
});

router.post('/support', supportLimiter, optionalCustomer, async (req, res) => {
  const name = text(req.body?.name, 60);
  const phone = normalizePhone(req.body?.phone);
  const topic = TOPICS.includes(req.body?.topic) ? req.body.topic : 'Other';
  const orderNo = text(req.body?.orderNo, 20).toUpperCase();
  const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 2000) : '';
  if (name.length < 2) throw badRequest('Enter your name.');
  if (!phone) throw badRequest('Enter a valid 10-digit mobile number, so we can call you back.');
  if (message.length < 10) throw badRequest('Tell us a little more, so we can help.');
  await store.insert('supportMessages', {
    name, phone, topic, orderNo: orderNo || null, message,
    customerId: req.customer?._id ?? null, ip: clientIp(req), status: 'open', createdAt: nowIso(),
  });
  res.status(201).json({ ok: true });
});
