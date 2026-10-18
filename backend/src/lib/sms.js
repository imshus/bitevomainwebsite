// Sends sign-in codes by SMS.
//
// No SMS provider is connected yet. With OTP_DEV_MODE=true (the default) the code is printed in this
// server's log and returned to the website, which shows it on screen, so sign-in works in development.
// To go live: connect a provider here (MSG91, Twilio, Gupshup, …), then set OTP_DEV_MODE=false.
import { config } from '../config.js';
import { HttpError } from './http.js';

export async function sendOtpSms(phone, code) {
  if (config.otpDevMode) {
    console.log(`[dev] Sign-in code for ${phone}: ${code}`);
    return;
  }
  // Example shape for a provider call:
  //   await fetch('https://provider.example/send', { method: 'POST', headers: {...}, body: JSON.stringify({ to: phone, text: `${code} is your BiteVo code` }) });
  throw new HttpError(503, 'We can’t send sign-in codes right now. Please try again later.');
}
