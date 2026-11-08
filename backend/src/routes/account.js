// The signed-in customer's profile, saved addresses, wallet, and deleting the account.
import { Router } from 'express';
import { store } from '../db/index.js';
import { config } from '../config.js';
import { objectId } from '../lib/ids.js';
import { badRequest, conflict, notFound, nowIso, text } from '../lib/http.js';
import { deliveryCheck } from '../lib/maps.js';
import { deliveryAreaRule, areaOf } from '../lib/deliveryArea.js';
import { settleReferrals } from '../lib/referrals.js';
import { settleOffers } from '../lib/offers.js';
import { serialize, normalizePhone, LIVE_STATUSES } from '../lib/rules.js';
import { requireCustomer, publicCustomer, clearSessionCookie } from '../auth.js';
import { walletBalance } from '../pricing.js';
import { sendMail, welcomeEmail } from '../lib/mail.js';

export const router = Router();
router.use(requireCustomer);

const MAX_ADDRESSES = 10;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.get('/', (req, res) => {
  res.json(publicCustomer(req.customer));
});

router.patch('/', async (req, res) => {
  const changes = {};
  if ('name' in (req.body || {})) {
    changes.name = text(req.body.name, 60);
    if (changes.name.length < 2) throw badRequest('Enter your name.');
  }
  if ('email' in (req.body || {})) {
    changes.email = text(req.body.email, 120).toLowerCase();
    if (changes.email && !EMAIL.test(changes.email)) throw badRequest('That email address doesn’t look right.');
  }
  // A mobile number for deliveries, for accounts made with an email address (not a sign-in number: that would
  // need a code sent to it). Checkout uses it, so it isn't asked for again there.
  if ('deliveryPhone' in (req.body || {})) {
    changes.deliveryPhone = normalizePhone(req.body.deliveryPhone);
    if (!changes.deliveryPhone) throw badRequest('Enter a valid 10-digit mobile number.');
  }
  // Signing up (a new account gets its name): every account has both an email address (invoices and refund
  // updates) and a mobile number (the delivery partner calls it). Phone sign-ups give the email here, email
  // sign-ups the number; Google accounts have both already.
  const signingUp = Boolean(changes.name) && !req.customer.name;
  if (signingUp && !(changes.email ?? req.customer.email)) {
    throw badRequest('Enter your email address. We send your invoices and refund updates there.');
  }
  if (signingUp && !(req.customer.phone || changes.deliveryPhone || req.customer.deliveryPhone)) {
    throw badRequest('Enter your mobile number. Our delivery partner calls it when they reach you.');
  }
  const saved = await store.update('customers', req.customer._id, { ...changes, updatedAt: nowIso() });
  if (signingUp && saved.email) sendMail(welcomeEmail(saved)); // the welcome email, now that it has an address
  // Keep the name on the customer's open sessions in step (shown on the admin panel's Login status page).
  if (changes.name && changes.name !== req.customer.name) {
    await store.updateMany('sessions', { userId: req.customer._id, role: 'customer', revokedAt: null }, { userName: changes.name });
  }
  res.json(publicCustomer(saved));
});

// ---- Addresses ------------------------------------------------------------------------

// A saved address is stored as separate fields:
//   house     flat / house number and floor          "Flat 302, 3rd floor"   (required)
//   building  building, society or street            "Tower B, Palm Residency" (required)
//   area      one of the delivery areas, picked from the list                  "Sector 44"
//   city      the delivery city (set by the server when there's an area rule)  "Gurugram"
//   landmark, pincode (optional), label (Home / Work / Other)
//   lat, lng  where the customer was when they tapped "I'm at this address" (phone GPS), or a map pin;
//             mapAddress is the map's address for a pin (none for GPS)
// line1 ("house, building") and line2 ("area, city") are kept too: orders, emails, the rider app and the
// admin panel show them, and older app versions send and read only those two lines (then the area is
// worked out from the text, as before). Older app versions also send a `zone`; it's ignored.
function cleanAddress(body) {
  const a = {
    label: text(body?.label, 20) || 'Home',
    landmark: text(body?.landmark, 80),
    pincode: text(body?.pincode, 6).replace(/\D/g, ''),
  };
  if (body && ('house' in body || 'building' in body)) {
    const house = text(body.house, 60);
    const building = text(body.building, 120);
    if (!house) throw badRequest('Enter your house or flat number.');
    if (building.length < 3) throw badRequest('Enter your building, society or street.');
    const rule = deliveryAreaRule();
    let area;
    let city;
    if (rule) {
      area = rule.areas.find(x => x.toLowerCase() === text(body.area, 60).toLowerCase());
      if (!area) throw badRequest(`Pick your sector. We deliver only to ${rule.label} for now.`);
      city = rule.city;
    } else {
      area = text(body.area, 60);
      city = text(body.city, 60);
      if (!area) throw badRequest('Enter your area or sector.');
      if (!city) throw badRequest('Enter your city.');
    }
    Object.assign(a, { house, building, area, city, line1: `${house}, ${building}`.slice(0, 120), line2: [area, city].filter(Boolean).join(', ') });
  } else {
    a.line1 = text(body?.line1, 120);
    a.line2 = text(body?.line2, 120);
    if (a.line1.length < 5) throw badRequest('Enter your house/flat number and street.');
  }
  if (a.pincode && a.pincode.length !== 6) throw badRequest('Pincode must be 6 digits.');

  // The phone's GPS position or a map pin, when the customer gave one (it takes the rider to the door).
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  if (body?.lat != null && body?.lng != null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    Object.assign(a, { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 });
    const mapAddress = text(body?.mapAddress, 200);
    if (mapAddress) a.mapAddress = mapAddress;
    if (!a.area && body?.area) a.area = text(body.area, 60); // an older app's map area
  }
  const check = deliveryCheck(a);
  if (!check.deliverable) throw badRequest(check.message);
  if (!a.house) a.area = areaOf(a) || a.area || ''; // two-line addresses: name the sector for riders and the panel
  return a;
}

// Re-reads the address list inside a per-customer queue, so two quick saves can't overwrite each other.
// `change(list)` returns the new list (and optionally the address it touched).
const editAddresses = (req, change) => serialize(req.customer._id, async () => {
  const current = await store.findById('customers', req.customer._id);
  const { list, address } = await change(current.addresses || []);
  const customer = publicCustomer(await store.update('customers', current._id, { addresses: list, updatedAt: nowIso() }));
  return { address, customer };
});

const requireAddress = (list, id) => {
  if (!list.some(a => a._id === id)) throw notFound('That address no longer exists.');
};

router.post('/addresses', async (req, res) => {
  const fields = cleanAddress(req.body);
  res.status(201).json(await editAddresses(req, list => {
    if (list.length >= MAX_ADDRESSES) throw badRequest(`You can save up to ${MAX_ADDRESSES} addresses. Remove one first.`);
    const address = { _id: objectId(), ...fields };
    return { list: [...list, address], address };
  }));
});

router.patch('/addresses/:id', async (req, res) => {
  const address = { _id: req.params.id, ...cleanAddress(req.body) };
  res.json(await editAddresses(req, list => {
    requireAddress(list, address._id);
    return { list: list.map(a => (a._id === address._id ? address : a)), address };
  }));
});

router.delete('/addresses/:id', async (req, res) => {
  res.json(await editAddresses(req, list => {
    requireAddress(list, req.params.id);
    return { list: list.filter(a => a._id !== req.params.id) };
  }));
});

// ---- Wallet ---------------------------------------------------------------------------
// Cashback, refunds and admin credits add to it; wallet payments take from it (see the admin panel).

const TXN_LABELS = {
  cashback: 'Cashback', refund: 'Refund', payment: 'Paid for order',
  admin_credit: 'Added by BiteVo', admin_debit: 'Deducted by BiteVo',
};
// Cashback the website pays itself, by `source`.
const SOURCE_LABELS = { referral: 'Referral cashback', signup: 'Signup bonus', order: 'Order cashback' };

router.get('/wallet', async (req, res) => {
  if (config.referral.enabled) await settleReferrals({ referrerId: req.customer._id }); // pay any referral reward that's due
  await settleOffers(req.customer._id); // and any order cashback
  const txns = await store.find('walletTxns', { customerId: req.customer._id }, { sort: { at: -1 }, limit: 50 });
  res.json({
    balance: await walletBalance(req.customer._id),
    transactions: txns.map(t => ({ _id: t._id, type: t.type, label: SOURCE_LABELS[t.source] || TXN_LABELS[t.type] || 'Wallet', note: t.note, amount: t.amount, at: t.at })),
  });
});

// ---- Delete account ---------------------------------------------------------------------
// Removes the customer and their personal details. Orders and wallet history stay (the admin panel
// needs them for accounts and tax), but with the name, phone, address and notes taken out. Not
// allowed while an order is still on its way. Any wallet balance is given up.

const DELETED_NAME = 'Deleted customer';

router.delete('/', async (req, res) => {
  const customer = req.customer;
  await serialize('orders', async () => {
    const live = await store.find('orders', { customerId: customer._id, status: { $in: LIVE_STATUSES } }, { limit: 1 });
    if (live.length) throw conflict(`Order #${live[0].orderNo} is still on its way. You can delete your account once it’s delivered or cancelled.`);

    const id = customer._id;
    const at = nowIso();
    await store.updateMany('orders', { customerId: id }, { customerName: DELETED_NAME, customerPhone: '', address: null, note: '' });
    await store.updateMany('walletTxns', { customerId: id }, { customerName: DELETED_NAME, customerPhone: '' });
    await store.updateMany('sessions', { userId: id, revokedAt: null }, { revokedAt: at });
    await store.updateMany('sessions', { userId: id }, { userName: DELETED_NAME, identifier: '' });
    await store.updateMany('loginEvents', { userId: id }, { userName: DELETED_NAME, identifier: '' });
    await store.updateMany('supportMessages', { customerId: id }, { name: DELETED_NAME, phone: '' });
    // Referral rewards that haven't been paid yet lapse, either way round.
    await store.updateMany('referrals', { friendId: id, status: 'pending' }, { status: 'void', voidReason: 'The friend deleted their account' });
    await store.updateMany('referrals', { referrerId: id, status: 'pending' }, { status: 'void', voidReason: 'The inviter deleted their account' });
    await store.updateMany('referrals', { friendId: id }, { friendName: DELETED_NAME, friendPhone: '' });
    await store.updateMany('referrals', { referrerId: id }, { referrerName: DELETED_NAME });
    // So does cashback on orders not delivered yet.
    await store.updateMany('orders', { customerId: id, deliveryCashback: { $gt: 0 }, deliveryCashbackPaidAt: null }, { deliveryCashback: 0 });
    if (customer.phone) {
      for (const code of await store.find('otpCodes', { phone: customer.phone })) await store.remove('otpCodes', code._id);
    }
    if (customer.loginEmail) {
      for (const code of await store.find('emailCodes', { email: customer.loginEmail })) await store.remove('emailCodes', code._id);
    }
    await store.remove('customers', id);
    console.log(`Customer account deleted (${id}).`);
  });
  clearSessionCookie(res);
  res.status(204).end();
});
