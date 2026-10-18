// Refer & earn routes (rules and data in ../lib/referrals.js).
//   GET  /api/referrals/:code       who a code belongs to (first name), for invite links
//   GET  /api/me/referrals          the signed-in customer's code, friends and earnings
//   POST /api/me/referrals/apply    a new customer uses a friend's code
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { HttpError, MIN } from '../lib/http.js';
import { requireCustomer, publicCustomer } from '../auth.js';
import { store } from '../db/index.js';
import { lookupCode, applyCode, referralSummary } from '../lib/referrals.js';

const enabled = (req, res, next) => {
  if (!config.referral.enabled) throw new HttpError(404, 'Refer & earn isn’t running right now.');
  next();
};

// Codes are short, so guessing them is slowed down.
const limiter = limit => rateLimit({
  windowMs: 15 * MIN, limit, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many tries. Please wait a few minutes and try again.' },
});

export const router = Router();
router.use(enabled);
router.get('/:code', limiter(40), async (req, res) => {
  res.json(await lookupCode(req.params.code));
});

export const meRouter = Router();
meRouter.use(enabled, requireCustomer);

meRouter.get('/', async (req, res) => {
  res.json(await referralSummary(req.customer));
});

meRouter.post('/apply', limiter(15), async (req, res) => {
  await applyCode(req.customer._id, req.body?.code);
  const customer = await store.findById('customers', req.customer._id);
  res.json({ customer: publicCustomer(customer), referrals: await referralSummary(customer) });
});
