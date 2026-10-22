import crypto from 'node:crypto';
import { store } from '../db/index.js';
import { config } from '../config.js';
import { badRequest, notFound, nowIso, MIN } from './http.js';
import { serialize } from './rules.js';
import { hasOrdered } from '../pricing.js';

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no 0/O, 1/I/L: easy to read out and type

// "Priya Sharma" → "PRIY" + 4 random characters, e.g. PRIY7K2Q.
function makeCode(name) {
  const prefix = (name || '').normalize('NFKD').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4) || 'BITE';
  let tail = '';
  for (let i = 0; i < 4; i++) tail += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return prefix + tail;
}

export const normalizeCode = raw => String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

// "Rahul Kumar Singh" → "Rahul S." (what a customer sees about the friends they invited).
export const shortName = name => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'New friend';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
};

// The customer's own code, created the first time it's needed.
export function ensureCode(customerId) {
  return serialize(`referral-code:${customerId}`, async () => {
    const customer = await store.findById('customers', customerId);
    if (customer.referralCode) return customer.referralCode;
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = makeCode(customer.name);
      if (await store.findOne('customers', { referralCode: code })) continue;
      try {
        await store.update('customers', customerId, { referralCode: code });
        return code;
      } catch (err) {
        if (err.code !== 11000) throw err; // taken a moment ago by someone else: try another
      }
    }
    throw new Error('Could not create a referral code.');
  });
}

// Who a code belongs to (for "Priya invited you" before signing up). First name only.
export async function lookupCode(raw) {
  const code = normalizeCode(raw);
  const owner = code.length >= 4 && (await store.findOne('customers', { referralCode: code }));
  if (!owner || owner.blocked) throw notFound('That referral code doesn’t exist. Check it and try again.');
  return { code, inviter: shortName(owner.name).split(' ')[0] };
}

// A new customer uses a friend's code.
export function applyCode(customerId, raw) {
  return serialize(`referral:${customerId}`, async () => {
    const me = await store.findById('customers', customerId);
    const code = normalizeCode(raw);
    if (!code) throw badRequest('Enter a referral code.');
    if (me.referredBy || (await store.findOne('referrals', { friendId: me._id }))) throw badRequest('You’ve already used a referral code.');
    if (await hasOrdered(me._id)) throw badRequest('Referral codes are for new customers, before their first order.');
    const referrer = await store.findOne('customers', { referralCode: code });
    if (!referrer || referrer.blocked) throw notFound('That referral code doesn’t exist. Check it and try again.');
    if (referrer._id === me._id) throw badRequest('That’s your own code. Share it with friends instead!');
    if (referrer.referredBy === me._id) throw badRequest('You invited this friend, so you can’t use their code.');

    const at = nowIso();
    const referral = await store.insert('referrals', {
      referrerId: referrer._id, referrerName: referrer.name,
      friendId: me._id, friendName: me.name, friendPhone: me.phone || me.deliveryPhone || '',
      code, status: 'pending', ordersDelivered: 0,
      // The promise at the time of joining, so later changes to the settings don't change it.
      ordersNeeded: config.referral.orders, reward: config.referral.reward,
      createdAt: at, rewardedAt: null, walletTxnId: null, source: 'web',
    });
    await store.update('customers', me._id, { referredBy: referrer._id, referredAt: at, referralCodeUsed: code });
    return referral;
  });
}

// The wallet transaction's id is worked out from the referral's id, so the reward can't be paid twice
// (a second insert with the same id fails in MongoDB, and is skipped below).
const rewardTxnId = referralId => crypto.createHash('sha256').update(`referral-reward:${referralId}`).digest('hex').slice(0, 24);

// The admin panel can void a pending referral at any moment, so the referral is claimed before it's paid:
// it moves from 'pending' to 'rewarded' only if it's still pending. One voided since settleReferrals()
// read it is never paid, and a claimed one can't be voided any more. Then the wallet txn is written, and
// walletTxnId set last; a run that stops in between leaves { status: 'rewarded', walletTxnId: null },
// which the next run pays (without claiming again).
async function payReward(r) {
  const referrer = await store.findById('customers', r.referrerId);
  if (!referrer) {
    await store.updateMany('referrals', { _id: r._id, status: r.status, walletTxnId: null }, { status: 'void', voidReason: 'The inviter’s account no longer exists', rewardedAt: null });
    return;
  }
  if (r.status === 'pending') {
    const claimed = await store.updateMany('referrals', { _id: r._id, status: 'pending' }, { status: 'rewarded', rewardedAt: nowIso(), ordersDelivered: r.ordersNeeded });
    if (!claimed) return; // voided since it was read
  }
  const txnId = rewardTxnId(r._id);
  if (!(await store.findById('walletTxns', txnId))) {
    try {
      await store.insert('walletTxns', {
        _id: txnId,
        customerId: referrer._id, customerName: referrer.name, customerPhone: referrer.phone || referrer.deliveryPhone || '',
        orderId: null, type: 'cashback', source: 'referral', referralId: r._id,
        amount: r.reward,
        note: `Referral: ${shortName(r.friendName)} completed ${r.ordersNeeded} order${r.ordersNeeded > 1 ? 's' : ''}`,
        by: 'Refer & earn', at: nowIso(),
      });
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }
  await store.update('referrals', r._id, { walletTxnId: txnId });
  console.log(`Referral reward of ₹${r.reward} paid to customer ${referrer._id} (friend ${r.friendId}).`);
}

// Counts each pending referral's delivered orders and pays the rewards that are due.
// `filter` narrows it to one customer's referrals, e.g. { referrerId }.
export function settleReferrals(filter = {}) {
  return serialize('referrals', async () => {
    // Rewards claimed by an earlier run that stopped before paying them (see payReward).
    for (const r of await store.find('referrals', { status: 'rewarded', walletTxnId: null, ...filter })) await payReward(r);
    const pending = await store.find('referrals', { status: 'pending', ...filter });
    for (const r of pending) {
      const delivered = await store.count('orders', { customerId: r.friendId, status: 'delivered' });
      if (delivered >= r.ordersNeeded) await payReward(r);
      else if (delivered !== r.ordersDelivered) await store.update('referrals', r._id, { ordersDelivered: delivered });
    }
  });
}

// Orders are marked delivered in the admin panel, so the website checks every few minutes (and
// whenever a customer looks at their wallet or referrals).
export function startReferralChecks(everyMs = 3 * MIN) {
  if (!config.referral.enabled) return;
  const run = () => settleReferrals().catch(err => console.error(`Referral check failed: ${err.message}`));
  run();
  setInterval(run, everyMs).unref();
}

// What the Refer & Earn page shows.
export async function referralSummary(customer) {
  await settleReferrals({ referrerId: customer._id });
  const [code, referrals, referredBy, ordered] = await Promise.all([
    ensureCode(customer._id),
    store.find('referrals', { referrerId: customer._id }, { sort: { createdAt: -1 }, limit: 200 }),
    customer.referredBy ? store.findById('customers', customer.referredBy) : null,
    hasOrdered(customer._id),
  ]);
  const rewarded = referrals.filter(r => r.status === 'rewarded');
  return {
    code,
    reward: config.referral.reward,
    ordersNeeded: config.referral.orders,
    canApply: !customer.referredBy && !ordered,
    referredBy: customer.referredBy ? { name: referredBy ? shortName(referredBy.name).split(' ')[0] : 'a friend' } : null,
    stats: {
      joined: referrals.length,
      rewarded: rewarded.length,
      earned: rewarded.reduce((s, r) => s + r.reward, 0),
      pending: referrals.filter(r => r.status === 'pending').length,
    },
    friends: referrals.map(r => ({
      _id: r._id,
      name: shortName(r.friendName),
      joinedAt: r.createdAt,
      status: r.status,
      ordersDelivered: Math.min(r.ordersDelivered || 0, r.ordersNeeded),
      ordersNeeded: r.ordersNeeded,
      reward: r.reward,
      rewardedAt: r.rewardedAt,
    })),
  };
}
