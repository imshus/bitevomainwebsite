// Sends sign-in codes by SMS through Fast2SMS's OTP route, which needs no DLT registration: the customer
// gets "Your OTP: 123456". Needs FAST2SMS_API_KEY in .env (fast2sms.com → Dev API).
//
// With OTP_DEV_MODE=true (the default) nothing is sent: the code is printed in this server's log and
// returned to the website, which shows it on screen, so sign-in works in development. To go live, set
// FAST2SMS_API_KEY and OTP_DEV_MODE=false.
import { config } from '../config.js';
import { HttpError } from './http.js';

const FAST2SMS_URL = 'https://www.fast2sms.com/dev/bulkV2';
const cantSend = () => new HttpError(503, 'We couldn’t send the code by SMS right now. Please try again in a minute.');

export async function sendOtpSms(phone, code) {
  if (config.otpDevMode) {
    console.log(`[dev] Sign-in code for ${phone}: ${code}`);
    return;
  }
  if (!config.sms.fast2smsKey) {
    console.error('[sms] OTP_DEV_MODE is false but FAST2SMS_API_KEY is empty, so sign-in codes can’t be sent.');
    throw cantSend();
  }

  const number = String(phone).replace(/\D/g, '').slice(-10); // "+91 98765 43210" → "9876543210"
  try {
    const res = await fetch(FAST2SMS_URL, {
      method: 'POST',
      headers: { authorization: config.sms.fast2smsKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ route: 'otp', variables_values: code, numbers: number, flash: 0 }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.return === true) return;
    console.error(`[sms] Fast2SMS didn’t send the code to ${phone}: HTTP ${res.status} ${JSON.stringify(data?.message ?? data)}`);
  } catch (err) {
    console.error(`[sms] Could not reach Fast2SMS: ${err.message}`);
  }
  throw cantSend();
}
