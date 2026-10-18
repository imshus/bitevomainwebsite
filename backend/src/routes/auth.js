// Sign-in with a one-time code sent to the customer's mobile number (new numbers become new customers),
// or with Google: a linked Google account signs straight in; otherwise the customer verifies their
// mobile number once and the Google account is linked to that BiteVo account (see ../lib/google.js).
import { Router } from 'express';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { store } from '../db/index.js';
import { config } from '../config.js';
import { sha256 } from '../lib/ids.js';
import { badRequest, unauthorized, tooMany, nowIso, MIN } from '../lib/http.js';
import { normalizePhone, deviceName, clientIp } from '../lib/rules.js';
import { sendOtpSms } from '../lib/sms.js';
import { verifyGoogleToken, makeTicket, readTicket } from '../lib/google.js';
import { sendMail, welcomeEmail } from '../lib/mail.js';
import { findSession, startSession, clearSessionCookie, publicCustomer } from '../auth.js';

export const router = Router();

const CODE_TTL_MS = 5 * MIN;
const RESEND_AFTER_MS = 30000;
const MAX_CODES_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

const limiter = (limit, message) => rateLimit({
  windowMs: 15 * MIN, limit, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: message },
});
const sendLimiter = limiter(10, 'Too many codes requested. Please wait 15 minutes and try again.');
const verifyLimiter = limiter(30, 'Too many sign-in attempts. Please wait 15 minutes and try again.');

// The code is hashed with the phone number, so a leaked hash can't be replayed for another number.
const codeHash = (phone, code) => sha256(`${phone}:${code}`);

function requirePhone(body) {
  const phone = normalizePhone(body?.phone);
  if (!phone) throw badRequest('Enter a valid 10-digit mobile number.');
  return phone;
}

const logAttempt = (req, phone, customer, success, reason) => store.insert('loginEvents', {
  userId: customer?._id ?? null, userName: customer?.name || (customer ? 'New customer' : 'Unknown'), role: 'customer', identifier: phone,
  platform: 'web', device: `${deviceName(req.get('user-agent'))} · bitevo.in`, ip: clientIp(req), success, reason, at: nowIso(),
});

router.post('/otp', sendLimiter, async (req, res) => {
  const phone = requirePhone(req.body);
  const since = new Date(Date.now() - 60 * MIN).toISOString();
  const recent = await store.find('otpCodes', { phone, createdAt: { $gte: since } }, { sort: { createdAt: -1 } });
  if (recent[0] && Date.now() - Date.parse(recent[0].createdAt) < RESEND_AFTER_MS) {
    throw tooMany('Please wait a few seconds before asking for another code.');
  }
  if (recent.length >= MAX_CODES_PER_HOUR) throw tooMany('Too many codes for this number. Please try again in an hour.');

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await store.insert('otpCodes', {
    phone, codeHash: codeHash(phone, code), attempts: 0, usedAt: null,
    createdAt: nowIso(), expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  await sendOtpSms(phone, code);
  const existing = await store.findOne('customers', { phone });
  res.json({
    phone,
    isNew: !existing,
    resendAfterSecs: RESEND_AFTER_MS / 1000,
    ...(config.otpDevMode ? { devCode: code } : {}),
  });
});

router.post('/verify', verifyLimiter, async (req, res) => {
  const phone = requirePhone(req.body);
  const code = String(req.body?.code || '').replace(/\D/g, '');
  let customer = await store.findOne('customers', { phone });

  const [latest] = await store.find('otpCodes', { phone, usedAt: null }, { sort: { createdAt: -1 }, limit: 1 });
  const fail = async (reason, message) => {
    await logAttempt(req, phone, customer, false, reason);
    throw unauthorized(message);
  };
  if (!latest || Date.parse(latest.expiresAt) < Date.now()) await fail('OTP expired', 'That code has expired. Ask for a new one.');
  if (latest.attempts >= MAX_ATTEMPTS) await fail('Too many attempts', 'Too many wrong tries. Ask for a new code.');
  if (code.length !== 6 || codeHash(phone, code) !== latest.codeHash) {
    await store.update('otpCodes', latest._id, { attempts: latest.attempts + 1 });
    await fail('Invalid OTP', 'That code isn’t right. Check the SMS and try again.');
  }
  await store.update('otpCodes', latest._id, { usedAt: nowIso() });

  // Finishing a Google sign-in: link that Google account to this number's BiteVo account.
  const google = req.body?.googleTicket ? readTicket(req.body.googleTicket) : null;
  if (req.body?.googleTicket && !google) throw unauthorized('Your Google sign-in timed out. Please start again.');

  const isNew = !customer;
  if (!customer) {
    customer = await store.insert('customers', {
      name: google?.name || '', phone, email: google?.email || '', addresses: [], createdAt: nowIso(), source: 'web',
      ...(google && { googleId: google.sub, googleEmail: google.email }),
    });
  } else if (google) {
    customer = await store.update('customers', customer._id, {
      googleId: google.sub, googleEmail: google.email,
      ...(!customer.email && { email: google.email }),
      ...(!customer.name && google.name && { name: google.name }),
    });
  }
  if (customer.blocked) await fail('Account blocked', 'This account has been blocked. Please contact support.');
  if (isNew && customer.email && customer.name) sendMail(welcomeEmail(customer));

  await logAttempt(req, phone, customer, true, null);
  await startSession(req, res, customer);
  res.json({ customer: publicCustomer(customer), isNew });
});

// Google's sign-in button sends its ID token here.
router.post('/google', verifyLimiter, async (req, res) => {
  const profile = await verifyGoogleToken(req.body?.credential);
  const customer = await store.findOne('customers', { googleId: profile.sub });
  if (!customer) {
    // Not linked yet: the customer adds their mobile number next, carrying this ticket.
    return res.json({ needsPhone: true, ticket: makeTicket(profile), name: profile.name, email: profile.email });
  }
  if (customer.blocked) {
    await logAttempt(req, customer.phone, customer, false, 'Account blocked');
    throw unauthorized('This account has been blocked. Please contact support.');
  }
  await logAttempt(req, customer.phone, customer, true, null);
  await startSession(req, res, customer);
  res.json({ customer: publicCustomer(customer), isNew: false });
});

router.post('/logout', async (req, res) => {
  const found = await findSession(req);
  if (found) await store.update('sessions', found.session._id, { revokedAt: nowIso() });
  clearSessionCookie(res);
  res.status(204).end();
});
