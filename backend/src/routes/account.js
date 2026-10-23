// The signed-in customer's profile, saved addresses, wallet, and deleting the account.
import { Router } from 'express';
import { store } from '../db/index.js';
import { config } from '../config.js';
import { objectId } from '../lib/ids.js';
import { badRequest, conflict, notFound, nowIso, text } from '../lib/http.js';
import { getSettings } from '../lib/settings.js';
import { deliveryCheck } from '../lib/maps.js';
import { settleReferrals } from '../lib/referrals.js';
import { settleOffers } from '../lib/offers.js';
import { serialize, LIVE_STATUSES } from '../lib/rules.js';
import { requireCustomer, publicCustomer, clearSessionCookie } from '../auth.js';
import { walletBalance } from '../pricing.js';

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
  const saved = await store.update('customers', req.customer._id, { ...changes, updatedAt: nowIso() });
  // Keep the name on the customer's open sessions in step (shown on the admin panel's Login status page).
  if (changes.name && changes.name !== req.customer.name) {
    await store.updateMany('sessions', { userId: req.customer._id, role: 'customer', revokedAt: null }, { userName: changes.name });
  }
  res.json(publicCustomer(saved));
});

// ---- Addresses ------------------------------------------------------------------------

async function cleanAddress(body) {
  const a = {
    label: text(body?.label, 20) || 'Home',
    line1: text(body?.line1, 120),
    line2: text(body?.line2, 120),
    landmark: text(body?.landmark, 80),
    zone: text(body?.zone, 60),
    pincode: text(body?.pincode, 6).replace(/\D/g, ''),
  };
  if (a.line1.length < 5) throw badRequest('Enter your house/flat number and street.');
  const { zones } = await getSettings();
  if (!zones.includes(a.zone)) throw badRequest('Pick your delivery area.');
  if (a.pincode && a.pincode.length !== 6) throw badRequest('Pincode must be 6 digits.');

  // The map pin, when the address was picked on the map (older and hand-typed addresses have none).
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  if (body?.lat != null && body?.lng != null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    Object.assign(a, { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, area: text(body?.area, 60), mapAddress: text(body?.mapAddress, 200) });
  }
  const check = deliveryCheck(a);
  if (!check.deliverable) throw badRequest(check.message);
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
  const fields = await cleanAddress(req.body);
  res.status(201).json(await editAddresses(req, list => {
    if (list.length >= MAX_ADDRESSES) throw badRequest(`You can save up to ${MAX_ADDRESSES} addresses. Remove one first.`);
    const address = { _id: objectId(), ...fields };
    return { list: [...list, address], address };
  }));
});

router.patch('/addresses/:id', async (req, res) => {
  const address = { _id: req.params.id, ...(await cleanAddress(req.body)) };
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
