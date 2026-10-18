// "Continue with Google". The browser gets an ID token (a JWT signed by Google) from Google's own
// sign-in button; the server checks its signature against Google's published keys, that it was issued
// for our Client ID, and that the email is verified. No Google secret is needed for this.
//
// A Google account is linked to a BiteVo account (which is always tied to a verified mobile number,
// since deliveries need one). If the Google account isn't linked yet, the customer verifies their
// mobile number once; a short-lived signed ticket carries the Google details over to that step.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { HttpError, MIN } from './http.js';

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
let certs = { keys: [], expires: 0 };

async function googleKeys() {
  if (Date.now() < certs.expires) return certs.keys;
  const res = await fetch(CERTS_URL, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`Google keys: HTTP ${res.status}`);
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') || '')?.[1]) || 3600;
  certs = { keys: (await res.json()).keys, expires: Date.now() + maxAge * 1000 };
  return certs.keys;
}

const b64json = part => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
const invalid = () => new HttpError(401, 'Google sign-in didn’t work. Please try again.');

// Returns { sub, email, name } for a valid Google ID token.
export async function verifyGoogleToken(idToken) {
  if (!config.googleClientId) throw new HttpError(404, 'Google sign-in isn’t set up.');
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw invalid();
  let header, claims;
  try { header = b64json(parts[0]); claims = b64json(parts[1]); } catch { throw invalid(); }
  if (header.alg !== 'RS256') throw invalid();

  let keys;
  try { keys = await googleKeys(); } catch (err) {
    console.error(`Could not load Google's sign-in keys: ${err.message}`);
    throw new HttpError(502, 'Google sign-in isn’t working right now. Please use your mobile number.');
  }
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) { certs.expires = 0; throw invalid(); } // keys rotate: fetch fresh ones next time
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
  const now = Date.now() / 1000;
  if (!ok || !ISSUERS.includes(claims.iss) || claims.aud !== config.googleClientId || !(claims.exp > now - 60)) throw invalid();
  if (claims.email_verified !== true && claims.email_verified !== 'true') throw new HttpError(401, 'That Google account’s email isn’t verified yet.');
  return { sub: String(claims.sub), email: String(claims.email || '').toLowerCase(), name: String(claims.name || '').trim().slice(0, 60) };
}

// A signed, 15-minute ticket with the Google details, for the "add your mobile number" step.
const sign = data => crypto.createHmac('sha256', config.authSecret).update(data).digest('base64url');

export function makeTicket(profile) {
  const data = Buffer.from(JSON.stringify({ ...profile, exp: Date.now() + 15 * MIN })).toString('base64url');
  return `${data}.${sign(data)}`;
}

export function readTicket(ticket) {
  const [data, mac] = String(ticket || '').split('.');
  const expected = data ? sign(data) : '';
  if (!mac || mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  const profile = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  return profile.exp > Date.now() ? profile : null;
}
