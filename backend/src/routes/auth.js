// Sign-in with a one-time code sent to the customer's mobile number or email address (new ones become
// new customers), or with Google: a linked Google account signs straight in; otherwise the customer
// verifies their mobile number once and the Google account is linked to that BiteVo account (see
// ../lib/google.js). An email address signs in only once verified by its code (`loginEmail`), never
// through the email typed into the profile. Accounts made by email have no `phone` (the verified sign-in
// number); checkout asks them for a delivery number instead (see orders.js).
import { Router } from 'express';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { store } from '../db/index.js';
import { config } from '../config.js';
import { sha256 } from '../lib/ids.js';
import { HttpError, badRequest, notFound, unauthorized, tooMany, nowIso, MIN } from '../lib/http.js';
import { normalizePhone, deviceName, clientIp } from '../lib/rules.js';
import { phoneCodesByMiniMoth, sendPhoneCode, checkPhoneCode, MINIMOTH_CODE_TTL_MS } from '../lib/sms.js';
import { verifyGoogleToken, makeTicket, readTicket } from '../lib/google.js';
import { sendMail, mailEnabled, emailSignInEnabled, welcomeEmail, signInCodeEmail } from '../lib/mail.js';
import { findSession, startSession, clearSessionCookie, publicCustomer } from '../auth.js';
import { newAccountFields, paySignupBonus } from '../lib/offers.js';

// A new account's signup bonus goes straight into its wallet; if that fails, settleOffers() pays it later.
const welcomeBonus = customer => paySignupBonus(customer).catch(err => console.error(`Signup bonus for ${customer._id} not paid yet: ${err.message}`));

export const router = Router();

const CODE_TTL_MS = 5 * MIN;
const RESEND_AFTER_MS = 30000;
const MAX_CODES_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const limiter = (limit, message) => rateLimit({
  windowMs: 15 * MIN, limit, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: message },
});
const sendLimiter = limiter(10, 'Too many codes requested. Please wait 15 minutes and try again.');
const verifyLimiter = limiter(30, 'Too many sign-in attempts. Please wait 15 minutes and try again.');

// The code is hashed with the number or address it was sent to, so a leaked hash can't be replayed for another.
const codeHash = (to, code) => sha256(`${to}:${code}`);

function requirePhone(body) {
  const phone = normalizePhone(body?.phone);
  if (!phone) throw badRequest('Enter a valid 10-digit mobile number.');
  return phone;
}

function requireEmail(body) {
  const email = String(body?.email || '').trim().toLowerCase();
  if (email.length > 120 || !EMAIL.test(email)) throw badRequest('Enter a valid email address.');
  return email;
}

const logAttempt = (req, identifier, customer, success, reason) => store.insert('loginEvents', {
  userId: customer?._id ?? null, userName: customer?.name || (customer ? 'New customer' : 'Unknown'), role: 'customer', identifier,
  platform: 'web', device: `${deviceName(req.get('user-agent'))} · bitevo.in`, ip: clientIp(req), success, reason, at: nowIso(),
});

// A new 6-digit code for a phone number ('otpCodes', 'phone') or an email address ('emailCodes', 'email').
// Creates a code, hands it to `deliver` (SMS or email) and returns it. If delivery fails, the code is
// thrown away again, so it doesn't hold up a retry or count towards the hourly limit.
// With `remote`, MiniMoth makes and checks the code: only the request is recorded (for the waits and
// limits here), `deliver` asks MiniMoth to send it, and nothing is returned.
async function issueCode(collection, field, to, deliver, { remote = false } = {}) {
  const since = new Date(Date.now() - 60 * MIN).toISOString();
  const recent = await store.find(collection, { [field]: to, createdAt: { $gte: since } }, { sort: { createdAt: -1 } });
  if (recent[0] && Date.now() - Date.parse(recent[0].createdAt) < RESEND_AFTER_MS) {
    throw tooMany('Please wait a few seconds before asking for another code.');
  }
  if (recent.length >= MAX_CODES_PER_HOUR) {
    throw tooMany(`Too many codes for this ${field === 'phone' ? 'number' : 'email address'}. Please try again in an hour.`);
  }
  const code = remote ? null : String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const saved = await store.insert(collection, {
    [field]: to, codeHash: remote ? null : codeHash(to, code), ...(remote && { remote: 'minimoth' }), attempts: 0, usedAt: null,
    createdAt: nowIso(), expiresAt: new Date(Date.now() + (remote ? MINIMOTH_CODE_TTL_MS : CODE_TTL_MS)).toISOString(),
  });
  try {
    await deliver(code);
  } catch (err) {
    await store.remove(collection, saved._id).catch(() => {});
    throw err;
  }
  return code;
}

// Is this the right code? Local codes are compared by hash; MiniMoth's are checked with MiniMoth.
async function codeMatches(latest, to, code) {
  if (code.length !== 6) return 'wrong';
  if (!latest.remote) return codeHash(to, code) === latest.codeHash ? 'ok' : 'wrong';
  return checkPhoneCode(to, code);
}

// Checks the latest code sent to `to` and uses it up. `fail(reason, message)` logs the attempt and throws.
async function useCode(collection, field, to, rawCode, fail, checkWhere) {
  const code = String(rawCode || '').replace(/\D/g, '');
  const [latest] = await store.find(collection, { [field]: to, usedAt: null }, { sort: { createdAt: -1 }, limit: 1 });
  if (!latest || Date.parse(latest.expiresAt) < Date.now()) await fail('OTP expired', 'That code has expired. Ask for a new one.');
  if (latest.attempts >= MAX_ATTEMPTS) await fail('Too many attempts', 'Too many wrong tries. Ask for a new code.');
  const result = await codeMatches(latest, to, code);
  if (result === 'expired') {
    await store.update(collection, latest._id, { usedAt: nowIso() });
    await fail('OTP expired', 'That code has expired. Ask for a new one.');
  }
  if (result === 'locked') {
    await store.update(collection, latest._id, { attempts: MAX_ATTEMPTS });
    await fail('Too many attempts', 'Too many wrong tries. Ask for a new code.');
  }
  if (result !== 'ok') {
    await store.update(collection, latest._id, { attempts: latest.attempts + 1 });
    await fail('Invalid OTP', `That code isn’t right. Check the ${checkWhere} and try again.`);
  }
  await store.update(collection, latest._id, { usedAt: nowIso() });
}

router.post('/otp', sendLimiter, async (req, res) => {
  const phone = requirePhone(req.body);
  // Live: MiniMoth makes the code and sends it on WhatsApp or SMS. Test mode: our own code, shown on screen.
  const remote = phoneCodesByMiniMoth();
  const code = await issueCode('otpCodes', 'phone', phone, c => {
    if (remote) return sendPhoneCode(phone);
    console.log(`[dev] Sign-in code for ${phone}: ${c}`);
  }, { remote });
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
  let customer = await store.findOne('customers', { phone });
  const fail = async (reason, message) => {
    await logAttempt(req, phone, customer, false, reason);
    throw unauthorized(message);
  };
  await useCode('otpCodes', 'phone', phone, req.body?.code, fail, 'WhatsApp or SMS');

  // Finishing a Google sign-in: link that Google account to this number's BiteVo account.
  const google = req.body?.googleTicket ? readTicket(req.body.googleTicket) : null;
  if (req.body?.googleTicket && !google?.sub) throw unauthorized('Your Google sign-in timed out. Please start again.');

  const isNew = !customer;
  if (!customer) {
    customer = await store.insert('customers', {
      name: google?.name || '', phone, email: google?.email || '', addresses: [], createdAt: nowIso(), source: 'web',
      ...(google && { googleId: google.sub, googleEmail: google.email }),
      ...newAccountFields(),
    });
    await welcomeBonus(customer);
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

// Sign-in with an email address: a code by email. In test mode without a mailbox (SMTP_PASS), the code
// is shown on screen instead, like the SMS codes.
router.post('/email', sendLimiter, async (req, res) => {
  if (!emailSignInEnabled()) throw notFound('Email sign-in isn’t set up.');
  const email = requireEmail(req.body);
  const onScreen = config.otpDevMode && !mailEnabled();
  const code = await issueCode('emailCodes', 'email', email, async c => {
    if (onScreen) console.log(`[dev] Sign-in code for ${email}: ${c}`);
    else if (!(await sendMail(signInCodeEmail(email, c)))) {
      throw new HttpError(503, 'We couldn’t send the email right now. Please try again, or use your mobile number.');
    }
  });
  res.json({ email, resendAfterSecs: RESEND_AFTER_MS / 1000, ...(onScreen ? { devCode: code } : {}) });
});

router.post('/email/verify', verifyLimiter, async (req, res) => {
  const email = requireEmail(req.body);
  let customer = await store.findOne('customers', { loginEmail: email });
  const fail = async (reason, message) => {
    await logAttempt(req, email, customer, false, reason);
    throw unauthorized(message);
  };
  await useCode('emailCodes', 'email', email, req.body?.code, fail, 'email');

  // A new email address becomes a new account straight away (it adds its name next, like any new account).
  const isNew = !customer;
  if (!customer) {
    customer = await store.insert('customers', {
      name: '', phone: '', email, loginEmail: email, addresses: [], createdAt: nowIso(), source: 'web',
      ...newAccountFields(),
    });
    await welcomeBonus(customer);
  }
  if (customer.blocked) await fail('Account blocked', 'This account has been blocked. Please contact support.');
  await logAttempt(req, email, customer, true, null);
  await startSession(req, res, customer);
  res.json({ customer: publicCustomer(customer), isNew });
});

router.post('/logout', async (req, res) => {
  const found = await findSession(req);
  if (found) await store.update('sessions', found.session._id, { revokedAt: nowIso() });
  clearSessionCookie(res);
  res.status(204).end();
});
