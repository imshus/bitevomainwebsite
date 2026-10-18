// All backend settings come from environment variables, usually backend/.env (see .env.example).
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '..');
dotenv.config({ path: path.join(backendDir, '.env'), quiet: true });

// Accepts MONGODB_URI, or the MONGO_DB_URL / MONGO_DB_USER / MONGO_DB_PASSWORD trio (same as the admin panel).
function mongoUri() {
  const raw = (process.env.MONGODB_URI || process.env.MONGO_DB_URL || '').trim();
  if (!raw) return '';
  const user = process.env.MONGO_DB_USER;
  const pass = process.env.MONGO_DB_PASSWORD;
  const hasCredentials = /^mongodb(\+srv)?:\/\/[^/]*@/.test(raw);
  if (hasCredentials || !user || !pass) return raw;
  return raw.replace(/^(mongodb(\+srv)?:\/\/)/, `$1${encodeURIComponent(user)}:${encodeURIComponent(pass)}@`);
}

const list = value => (value || '').split(',').map(s => s.trim()).filter(Boolean);
const num = (value, fallback) => (value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : fallback);

// `--port 4001` on the command line wins over PORT (the dev script pins the API to 4001).
const argPort = Number(process.argv[process.argv.indexOf('--port') + 1] || 0) || 0;

export const config = {
  port: (process.argv.includes('--port') && argPort) || Number(process.env.PORT) || 4001,
  mongoUri: mongoUri(),
  mongoDbName: process.env.MONGO_DB_NAME || 'bitevo',
  // Without MongoDB the API stores data in this JSON file instead (handy for offline work).
  dataFile: process.env.DATA_FILE || path.join(backendDir, 'data', 'db.json'),
  // Origins of the website allowed to call the API with cookies.
  clientOrigins: list(process.env.CLIENT_ORIGIN || 'http://localhost:2002'),
  // Prefix for menu photos the admin panel uploaded (stored as /uploads/<file>).
  adminPublicUrl: (process.env.ADMIN_PUBLIC_URL || '').replace(/\/$/, ''),
  deliveryFee: num(process.env.DELIVERY_FEE, 30),
  freeDeliveryAbove: num(process.env.FREE_DELIVERY_ABOVE, 499),
  minOrderValue: num(process.env.MIN_ORDER_VALUE, 99),
  otpDevMode: process.env.OTP_DEV_MODE !== 'false',
  // Google Maps Platform. The server key is used only here, for place search, place details and
  // turning a map pin into an address. The browser key draws the map, so restrict it to the
  // website's domains in Google Cloud (it falls back to the server key, which is fine on localhost).
  maps: {
    serverKey: (process.env.GOOGLE_MAPS_KEY || '').trim(),
    browserKey: (process.env.GOOGLE_MAPS_BROWSER_KEY || process.env.GOOGLE_MAPS_KEY || '').trim(),
    // Optional: the kitchen's position and how far it delivers. Addresses further away are refused,
    // and searches favour places near the kitchen. Leave empty to skip the distance check.
    kitchen: Number.isFinite(parseFloat(process.env.KITCHEN_LAT)) && Number.isFinite(parseFloat(process.env.KITCHEN_LNG))
      ? { lat: parseFloat(process.env.KITCHEN_LAT), lng: parseFloat(process.env.KITCHEN_LNG) }
      : null,
    radiusKm: num(process.env.DELIVERY_RADIUS_KM, 0),
  },
  // Public address of the website, used for links in emails.
  siteUrl: (process.env.SITE_URL || list(process.env.CLIENT_ORIGIN || 'http://localhost:2002')[0]).replace(/\/$/, ''),
  // "Continue with Google": the OAuth 2.0 Client ID (Web application) from Google Cloud. Empty = hidden.
  googleClientId: (process.env.GOOGLE_CLIENT_ID || '').trim(),
  // Signs the short-lived ticket that carries a Google sign-in over to the phone step. Set it in
  // production so tickets survive a restart; without it a random one is made at start-up.
  authSecret: process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex'),
  // Emails (welcome, order confirmations) from your Hostinger mailbox. Empty SMTP_PASS = no emails.
  mail: {
    host: process.env.SMTP_HOST || 'smtp.hostinger.com',
    port: num(process.env.SMTP_PORT, 465),
    user: (process.env.SMTP_USER || '').trim(),
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || (process.env.SMTP_USER ? `BiteVo <${process.env.SMTP_USER.trim()}>` : ''),
  },
  // Refer & earn: a new customer signs up with a friend's code; once they have this many orders
  // delivered, the friend who invited them gets the reward in their wallet (as cashback).
  referral: {
    enabled: process.env.REFERRAL_ENABLED !== 'false',
    reward: num(process.env.REFERRAL_REWARD, 100),
    orders: Math.max(1, num(process.env.REFERRAL_ORDERS, 2)),
  },
  cookie: {
    name: 'bitevo_session',
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: process.env.COOKIE_SAMESITE || 'lax', // use "none" (with COOKIE_SECURE=true) when the site is on another domain
  },
  sessionDays: Number(process.env.SESSION_DAYS) || 30,
  trustProxy: process.env.TRUST_PROXY === 'true',
};
