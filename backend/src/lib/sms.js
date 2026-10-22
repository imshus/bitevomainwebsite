// Sign-in codes for mobile numbers through MiniMoth (minimoth.dev): MiniMoth makes the 6-digit code, sends
// it on WhatsApp (or SMS from its own DLT-registered sender when WhatsApp doesn't go through) and checks the
// code the customer types. Needs MINIMOTH_API_KEY in .env (dashboard → Project → Settings; an mm_test_ key
// sends nothing and uses no credits).
//
// With OTP_DEV_MODE=true (the default) MiniMoth isn't used: the website makes its own code, prints it in
// this server's log and shows it on screen, so sign-in works in development (see routes/auth.js).
import { config } from '../config.js';
import { HttpError, badRequest, tooMany, MIN } from './http.js';

const API = 'https://api.minimoth.dev/v1/otp';
export const MINIMOTH_CODE_TTL_MS = 10 * MIN; // how long MiniMoth's codes work
export const phoneCodesByMiniMoth = () => !config.otpDevMode;

const cantSend = () => new HttpError(503, 'We couldn’t send the code right now. Please try again in a minute.');
const intl = phone => `+91${String(phone).replace(/\D/g, '').slice(-10)}`; // "+91 98765 43210" → "+919876543210"

async function call(path, body) {
  if (!config.sms.minimothKey) {
    console.error('[otp] OTP_DEV_MODE is false but MINIMOTH_API_KEY is empty, so sign-in codes can’t be sent.');
    throw cantSend();
  }
  try {
    const res = await fetch(`${API}/${path}`, {
      method: 'POST',
      headers: { 'X-Api-Key': config.sms.minimothKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, code: data?.code, error: data?.error };
  } catch (err) {
    console.error(`[otp] Could not reach MiniMoth: ${err.message}`);
    throw cantSend();
  }
}

// Asks MiniMoth to send a new code to this number.
export async function sendPhoneCode(phone) {
  const r = await call('send', { phone: intl(phone) });
  if (r.ok) return;
  if (r.code === 'OTP_RATE_LIMITED') throw tooMany('Too many codes for this number. Please try again in 10 minutes.');
  if (r.code === 'INVALID_PHONE') throw badRequest('Enter a valid 10-digit mobile number.');
  console.error(`[otp] MiniMoth didn’t send the code to ${phone}: HTTP ${r.status} ${r.code || ''} ${r.error || ''}`);
  throw cantSend();
}

// Checks a code with MiniMoth: 'ok', 'wrong', 'expired' or 'locked' (too many wrong tries).
export async function checkPhoneCode(phone, code) {
  const r = await call('verify', { phone: intl(phone), code });
  if (r.ok) return 'ok';
  if (r.code === 'INVALID_OTP' || r.code === 'INVALID_OTP_CODE') return 'wrong';
  if (r.code === 'OTP_NOT_FOUND') return 'expired';
  if (r.code === 'VERIFY_RATE_LIMITED') return 'locked';
  console.error(`[otp] MiniMoth couldn’t check the code for ${phone}: HTTP ${r.status} ${r.code || ''} ${r.error || ''}`);
  throw new HttpError(503, 'We couldn’t check the code right now. Please try again in a minute.');
}
