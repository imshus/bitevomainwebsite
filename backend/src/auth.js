// Customer sessions: a random token in an httpOnly cookie; only its SHA-256 hash is stored.
// Sessions live in the shared "sessions" collection with role "customer", so they show up in the
// admin panel's Login status page, and an admin can sign a customer out from there.
import { store } from './db/index.js';
import { config } from './config.js';
import { randomToken, sha256 } from './lib/ids.js';
import { unauthorized, nowIso, DAY } from './lib/http.js';
import { deviceName, clientIp } from './lib/rules.js';

const TOUCH_EVERY_MS = 60000; // how often "last active" is written while a customer uses the site

export async function findSession(req) {
  const token = req.cookies?.[config.cookie.name];
  if (!token) return null;
  const session = await store.findOne('sessions', { tokenHash: sha256(token) });
  if (!session || session.role !== 'customer' || session.revokedAt) return null;
  if (session.expiresAt && Date.parse(session.expiresAt) < Date.now()) return null;
  const customer = await store.findById('customers', session.userId);
  if (!customer || customer.blocked) return null;
  return { session, customer };
}

async function attach(req, found) {
  req.customer = found.customer;
  req.session = found.session;
  if (Date.now() - Date.parse(found.session.lastActiveAt) > TOUCH_EVERY_MS) {
    await store.update('sessions', found.session._id, { lastActiveAt: nowIso() });
  }
}

// Guards routes that need a signed-in customer.
export async function requireCustomer(req, res, next) {
  const found = await findSession(req);
  if (!found) throw unauthorized();
  await attach(req, found);
  next();
}

// Adds req.customer when someone is signed in, but lets guests through.
export async function optionalCustomer(req, res, next) {
  const found = await findSession(req);
  if (found) await attach(req, found);
  next();
}

export async function startSession(req, res, customer) {
  const token = randomToken();
  const at = nowIso();
  await store.insert('sessions', {
    userId: customer._id, userName: customer.name || 'New customer', role: 'customer', identifier: customer.phone || customer.email,
    platform: 'web', device: `${deviceName(req.get('user-agent'))} · bitevo.in`, ip: clientIp(req),
    loginAt: at, lastActiveAt: at, revokedAt: null,
    expiresAt: new Date(Date.now() + config.sessionDays * DAY).toISOString(),
    tokenHash: sha256(token),
  });
  res.cookie(config.cookie.name, token, { ...cookieOptions(), maxAge: config.sessionDays * DAY });
}

const cookieOptions = () => ({
  httpOnly: true,
  secure: config.cookie.secure,
  sameSite: config.cookie.sameSite,
  path: '/',
});

export function clearSessionCookie(res) {
  res.clearCookie(config.cookie.name, cookieOptions());
}

// What the website gets to know about the signed-in customer.
export const publicCustomer = c => ({
  _id: c._id,
  name: c.name || '',
  phone: c.phone || '', // the verified sign-in number; empty for accounts made with an email address
  deliveryPhone: c.deliveryPhone || '', // the number those accounts gave at checkout
  email: c.email || '',
  addresses: c.addresses || [],
  createdAt: c.createdAt,
  google: c.googleId ? c.googleEmail || true : null, // the linked Google account's email, if any
  emailLogin: c.loginEmail || null, // the verified email address it can sign in with, if any
});
